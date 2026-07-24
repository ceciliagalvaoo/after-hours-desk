import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments } from "../utils/deployments.js";
import { createSepoliaHandleClient } from "../utils/handleClient.js";
import { withRetries } from "../utils/retry.js";

/**
 * Real, non-mocked E2E check for Phase 4 (Uniswap price reference), run against LIVE Ethereum
 * Sepolia: submits a BUY order and a SELL order against the Phase-4 `AfterHoursDesk` (the one
 * wired to `UniswapV3PriceReader`, from `07-deploy-after-hours-desk.ts`), settles the batch, and
 * confirms the decrypted execution price matches an INDEPENDENT, separate read of the price
 * oracle taken right after settlement — i.e. this does not just trust `AfterHoursDesk`'s own
 * accounting, it re-derives the expected value from a second, unrelated contract call.
 *
 * KNOWN, DELIBERATE LIMITATION (documented, not hidden — same shape as every other E2E script in
 * this repo, see feedback.md): this repo has exactly ONE funded Sepolia signer, so both legs of
 * the trivial match below are submitted by that same account. Multi-counterparty netting is
 * already covered for real by `test/unit/AfterHoursDesk.test.ts`'s local, free multi-account
 * tests — this script's job is proving the Uniswap-price wiring executes for real in the
 * DEPLOYED bytecode against LIVE Sepolia state, which the local suite (against the local Nox
 * stack's `MockPriceOracle`, not the real pool) cannot prove by itself.
 *
 * IMPORTANT CAVEAT this script explicitly accounts for: the real Uniswap pool's spot price can
 * move BETWEEN the `settleBatch()` transaction being mined and this script's later independent
 * `priceOracle.read.getReferencePrice()` call — on a real, live (if thin-volume) testnet pool,
 * that is a real, if small, race window, not a bug. The assertion below is therefore not "prices
 * are bit-for-bit equal no matter when read" but "the settled price was read from the SAME
 * underlying live oracle, at a time close enough to now that any drift is a real, explainable
 * market/tick movement, not a wiring bug" — logged explicitly either way.
 *
 * Never assumes synchronous confirmation of decrypted results right after a transaction — see
 * scripts/utils/retry.ts and feedback.md Day-1 spike 4.
 */

const BUY_AMOUNT = 4n * 10n ** 6n; // 4.000000 mUSDC
const SELL_AMOUNT = 4n * 10n ** 6n; // 4.000000 mUSDC — fully matched, no residual either side

const SHORT_LIVED_OPERATOR_EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);

async function main() {
  const { viem } = await connectSepolia();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const deployments = await readSepoliaDeployments();
  if (
    !deployments.mockUSDC ||
    !deployments.confidentialUSDC ||
    !deployments.afterHoursDesk ||
    !deployments.priceOracle ||
    !deployments.uniswapPool
  ) {
    throw new Error(
      "[e2e] deployments/sepolia.json is missing mockUSDC/confidentialUSDC/afterHoursDesk/" +
        "priceOracle/uniswapPool — run scripts/deploy/01 through 07 first.",
    );
  }

  const usdc = await viem.getContractAt("MockUSDC", deployments.mockUSDC);
  const cusdc = await viem.getContractAt("ConfidentialUSDC", deployments.confidentialUSDC);
  const priceOracle = await viem.getContractAt("UniswapV3PriceReader", deployments.priceOracle);
  const desk = await viem.getContractAt("AfterHoursDesk", deployments.afterHoursDesk);

  console.log(`[e2e] signer:          ${signer.account.address}`);
  console.log(`[e2e] MockUSDC:        ${usdc.address}`);
  console.log(`[e2e] ConfidentialUSDC:${cusdc.address}`);
  console.log(`[e2e] UniswapV3PriceReader: ${priceOracle.address}`);
  console.log(`[e2e] underlying Uniswap pool: ${deployments.uniswapPool}`);
  console.log(`[e2e] AfterHoursDesk:  ${desk.address}`);

  // --- confirm the desk really is wired to THIS priceOracle instance (not some other one).
  const wiredOracle = await desk.read.priceOracle();
  if (wiredOracle.toLowerCase() !== priceOracle.address.toLowerCase()) {
    throw new Error(
      `[e2e] MISMATCH: AfterHoursDesk.priceOracle() (${wiredOracle}) does not match ` +
        `deployments/sepolia.json's priceOracle (${priceOracle.address}).`,
    );
  }

  // --- independent read #1: the oracle's price BEFORE settlement (sanity/logging only).
  const priceBefore = await priceOracle.read.getReferencePrice();
  console.log(
    `[e2e] priceOracle.getReferencePrice() before settlement: ${priceBefore} ` +
      `(${Number(priceBefore) / 1e6} USDC/WETH)`,
  );

  const handleClient = await createSepoliaHandleClient(signer);

  // --- ensure the signer holds enough confidential cUSDC to cover BUY_AMOUNT (idempotent).
  const balanceHandleBeforeWrap = (await cusdc.read.confidentialBalanceOf([
    signer.account.address,
  ])) as `0x${string}`;
  let confidentialBalanceBeforeWrap = 0n;
  try {
    const { value } = await handleClient.decrypt(balanceHandleBeforeWrap);
    confidentialBalanceBeforeWrap = value as bigint;
  } catch {
    console.log("[e2e] signer has no confidential balance yet — starting from 0");
  }
  console.log(`[e2e] confidential balance before top-up: ${confidentialBalanceBeforeWrap}`);

  if (confidentialBalanceBeforeWrap < BUY_AMOUNT) {
    const topUp = BUY_AMOUNT - confidentialBalanceBeforeWrap;
    console.log(`[e2e] topping up ${topUp} (raw units) mUSDC -> cUSDC...`);
    const plainBalance = await usdc.read.balanceOf([signer.account.address]);
    if (plainBalance < topUp) {
      const faucetTx = await usdc.write.faucet([signer.account.address, topUp]);
      await publicClient.waitForTransactionReceipt({ hash: faucetTx });
    }
    const approveTx = await usdc.write.approve([cusdc.address, topUp]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const wrapTx = await cusdc.write.wrap([signer.account.address, topUp]);
    await publicClient.waitForTransactionReceipt({ hash: wrapTx });
    console.log("[e2e] top-up wrap mined");
  }

  // --- authorize the desk as an operator over the signer's cUSDC (required for the BUY leg).
  const isOperator = await cusdc.read.isOperator([signer.account.address, desk.address]);
  if (!isOperator) {
    console.log("[e2e] setOperator(desk, short-lived expiry)...");
    const setOperatorTx = await cusdc.write.setOperator([desk.address, SHORT_LIVED_OPERATOR_EXPIRY]);
    await publicClient.waitForTransactionReceipt({ hash: setOperatorTx });
  }

  // --- submit BUY order.
  console.log(`[e2e] encryptInput(${BUY_AMOUNT}) for BUY order...`);
  const { handle: buyHandle, handleProof: buyProof } = await handleClient.encryptInput(
    BUY_AMOUNT,
    "uint256",
    desk.address,
  );
  const submitBuyTx = await desk.write.submitOrder([true, buyHandle, buyProof]);
  console.log(`[e2e] submitOrder(BUY) tx: ${submitBuyTx}`);
  await publicClient.waitForTransactionReceipt({ hash: submitBuyTx });

  // --- submit SELL order — same signer, see limitation note above.
  console.log(`[e2e] encryptInput(${SELL_AMOUNT}) for SELL order...`);
  const { handle: sellHandle, handleProof: sellProof } = await handleClient.encryptInput(
    SELL_AMOUNT,
    "uint256",
    desk.address,
  );
  const submitSellTx = await desk.write.submitOrder([false, sellHandle, sellProof]);
  console.log(`[e2e] submitOrder(SELL) tx: ${submitSellTx}`);
  await publicClient.waitForTransactionReceipt({ hash: submitSellTx });

  const currentBatchId = await desk.read.currentBatchId();
  console.log(`[e2e] batch ${currentBatchId} open with both legs submitted`);

  // --- settle. The composed-primitives netting AND `_executionPriceHandle()`'s real
  // `priceOracle.getReferencePrice()` read both run synchronously within this transaction (Day-1
  // spike point 4) — only the resulting handles' CIPHERTEXT resolves asynchronously afterwards.
  console.log("[e2e] settleBatch()...");
  const settleTx = await desk.write.settleBatch();
  console.log(`[e2e] settleBatch tx: ${settleTx}`);
  const settleReceipt = await publicClient.waitForTransactionReceipt({ hash: settleTx });
  console.log(`[e2e] settleBatch mined in block ${settleReceipt.blockNumber}`);

  // --- decrypt the matched amount too (full sanity — fully matched, no rounding).
  const matchedHandle = (await desk.read.getBatchMatchedAmountHandle([
    currentBatchId,
  ])) as `0x${string}`;
  const { value: matched } = await withRetries(
    () => handleClient.publicDecrypt(matchedHandle),
    { label: "publicDecrypt(matchedAmount)" },
  );
  console.log(`[e2e] decrypted matched amount: ${matched}`);
  if (matched !== BUY_AMOUNT) {
    throw new Error(`[e2e] MISMATCH: expected matched=${BUY_AMOUNT}, got ${matched}`);
  }

  // --- the core Phase-4 assertion: decrypt the REAL execution price and cross-check it against
  // an INDEPENDENT, separate call to the oracle contract (not a re-derivation from the desk).
  const priceHandle = (await desk.read.getBatchExecutionPriceHandle([
    currentBatchId,
  ])) as `0x${string}`;
  const { value: decryptedPrice } = await withRetries(
    () => handleClient.publicDecrypt(priceHandle),
    { label: "publicDecrypt(executionPrice)" },
  );
  console.log(
    `[e2e] decrypted execution price: ${decryptedPrice} ` +
      `(${Number(decryptedPrice as bigint) / 1e6} USDC/WETH)`,
  );

  const priceAfter = await priceOracle.read.getReferencePrice();
  console.log(
    `[e2e] independent priceOracle.getReferencePrice() read AFTER settlement: ${priceAfter} ` +
      `(${Number(priceAfter) / 1e6} USDC/WETH)`,
  );

  if (decryptedPrice === priceAfter) {
    console.log(
      "[e2e] OK — decrypted execution price matches an independent, separate oracle read " +
        "EXACTLY (pool spot price did not move between settlement and this check).",
    );
  } else {
    // Real testnet pools can move between the settle tx and this later independent read — not a
    // wiring bug, but flag it loudly rather than silently accepting any value.
    const decrypted = decryptedPrice as bigint;
    const diff = decrypted > priceAfter ? decrypted - priceAfter : priceAfter - decrypted;
    const diffBps = (diff * 10_000n) / priceAfter;
    console.log(
      `[e2e] NOTE: decrypted execution price (${decrypted}) differs from the independent ` +
        `post-settlement oracle read (${priceAfter}) by ${diff} raw units (${diffBps} bps) — ` +
        "expected if the real pool's spot price moved between settleBatch() and this check, " +
        "NOT evidence of a wiring bug (both numbers come from the SAME live oracle contract).",
    );
    if (diffBps > 500n) {
      throw new Error(
        `[e2e] MISMATCH: ${diffBps} bps drift is too large to plausibly be normal spot-price ` +
          "movement on this pool in the last few seconds — investigate before trusting this run.",
      );
    }
  }

  console.log(
    "[e2e] OK — submitOrder -> settleBatch -> decrypt(executionPrice) cross-checked against a " +
      "live, independent Uniswap Sepolia oracle read, real data end to end on live Sepolia.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
