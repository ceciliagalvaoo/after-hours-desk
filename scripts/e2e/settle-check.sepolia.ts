import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments } from "../utils/deployments.js";
import { createSepoliaHandleClient } from "../utils/handleClient.js";
import { withRetries } from "../utils/retry.js";

/**
 * Real, non-mocked E2E sanity check for Phase 2 (AfterHoursDesk core), run
 * against LIVE Ethereum Sepolia: submits a BUY order and a SELL order,
 * settles the batch (composed-primitives netting, Plan A), and decrypts the
 * real results.
 *
 * KNOWN, DELIBERATE LIMITATION (documented, not hidden — see feedback.md):
 * this repo has exactly ONE funded Sepolia signer. Both the buy order and
 * the sell order below are submitted BY THAT SAME ACCOUNT. This is NOT mock
 * data — every order, encryption, transaction, and confidential-balance
 * movement here is real — it is a funds limitation of a hackathon testnet
 * setup, not a faked counterparty. It still proves the mechanism end to end:
 * `AfterHoursDesk` pulls the buy leg's fill out of the signer's cUSDC
 * balance into itself (`confidentialTransferFrom`), then pushes the
 * matching sell leg's fill back out to the very same signer
 * (`confidentialTransfer`) — a real transfer OUT and back IN, round-tripping
 * through the desk's own (transiently non-zero) balance, not a no-op.
 * Multi-counterparty netting is already covered for real by
 * `test/unit/AfterHoursDesk.test.ts` using the local Hardhat network's free
 * multi-account support (see feedback.md, Fase 2 entries).
 *
 * Never assumes synchronous confirmation of decrypted results right after a
 * transaction — see scripts/utils/retry.ts and feedback.md Day-1 spike 4.
 */

const BUY_AMOUNT = 10n * 10n ** 6n; // 10.000000 mUSDC
const SELL_AMOUNT = 6n * 10n ** 6n; // 6.000000 mUSDC — matched = min(10, 6) = 6
const EXPECTED_MATCHED = SELL_AMOUNT;
const EXPECTED_BUY_RESIDUAL = BUY_AMOUNT - EXPECTED_MATCHED; // 4.000000
const EXPECTED_SELL_RESIDUAL = 0n;

const SHORT_LIVED_OPERATOR_EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);

async function main() {
  const { viem } = await connectSepolia();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const deployments = await readSepoliaDeployments();
  if (!deployments.mockUSDC || !deployments.confidentialUSDC || !deployments.afterHoursDesk) {
    throw new Error(
      "[e2e] deployments/sepolia.json is missing mockUSDC/confidentialUSDC/afterHoursDesk " +
        "— run scripts/deploy/01, 02, and 03 first.",
    );
  }

  const usdc = await viem.getContractAt("MockUSDC", deployments.mockUSDC);
  const cusdc = await viem.getContractAt("ConfidentialUSDC", deployments.confidentialUSDC);
  const desk = await viem.getContractAt("AfterHoursDesk", deployments.afterHoursDesk);

  console.log(`[e2e] signer:          ${signer.account.address}`);
  console.log(`[e2e] MockUSDC:        ${usdc.address}`);
  console.log(`[e2e] ConfidentialUSDC:${cusdc.address}`);
  console.log(`[e2e] AfterHoursDesk:  ${desk.address}`);

  const handleClient = await createSepoliaHandleClient(signer);

  // --- ensure the signer holds enough confidential cUSDC to cover BUY_AMOUNT
  // (idempotent/re-runnable script — wrap only if the current confidential
  // balance is insufficient).
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

  // --- authorize the desk as an operator over the signer's cUSDC (required
  // for the BUY leg, which settlement fills via confidentialTransferFrom).
  const isOperator = await cusdc.read.isOperator([signer.account.address, desk.address]);
  if (!isOperator) {
    console.log("[e2e] setOperator(desk, short-lived expiry)...");
    const setOperatorTx = await cusdc.write.setOperator([desk.address, SHORT_LIVED_OPERATOR_EXPIRY]);
    await publicClient.waitForTransactionReceipt({ hash: setOperatorTx });
  }

  // After the top-up branch above (if taken), the balance is exactly
  // BUY_AMOUNT (before + (BUY_AMOUNT - before)); otherwise it's whatever it
  // already was (>= BUY_AMOUNT).
  const confidentialBalanceBeforeOrders =
    confidentialBalanceBeforeWrap < BUY_AMOUNT ? BUY_AMOUNT : confidentialBalanceBeforeWrap;
  console.log(`[e2e] confidential balance before orders: ${confidentialBalanceBeforeOrders}`);

  // --- submit BUY order (10 mUSDC).
  console.log(`[e2e] encryptInput(${BUY_AMOUNT}) for BUY order...`);
  const { handle: buyHandle, handleProof: buyProof } = await handleClient.encryptInput(
    BUY_AMOUNT,
    "uint256",
    desk.address,
  );
  const submitBuyTx = await desk.write.submitOrder([true, buyHandle, buyProof]);
  console.log(`[e2e] submitOrder(BUY) tx: ${submitBuyTx}`);
  await publicClient.waitForTransactionReceipt({ hash: submitBuyTx });

  // --- submit SELL order (6 mUSDC) — same signer, see limitation note above.
  console.log(`[e2e] encryptInput(${SELL_AMOUNT}) for SELL order...`);
  const { handle: sellHandle, handleProof: sellProof } = await handleClient.encryptInput(
    SELL_AMOUNT,
    "uint256",
    desk.address,
  );
  const submitSellTx = await desk.write.submitOrder([false, sellHandle, sellProof]);
  console.log(`[e2e] submitOrder(SELL) tx: ${submitSellTx}`);
  await publicClient.waitForTransactionReceipt({ hash: submitSellTx });

  // --- read back the public order metadata to get both order ids.
  const currentBatchId = await desk.read.currentBatchId();
  const [buyOrderIds, sellOrderIds] = await desk.read.getBatchOrderIds([currentBatchId]);
  const buyOrderId = buyOrderIds[buyOrderIds.length - 1] as bigint;
  const sellOrderId = sellOrderIds[sellOrderIds.length - 1] as bigint;
  console.log(`[e2e] batch ${currentBatchId}: buyOrderId=${buyOrderId} sellOrderId=${sellOrderId}`);

  // --- settle. The composed-primitives chain itself runs synchronously
  // within this transaction (handles are deterministic) — only the
  // CIPHERTEXT of the resulting handles resolves asynchronously afterwards.
  console.log("[e2e] settleBatch()...");
  const settleTx = await desk.write.settleBatch();
  console.log(`[e2e] settleBatch tx: ${settleTx}`);
  await publicClient.waitForTransactionReceipt({ hash: settleTx });

  // --- decrypt + assert the results. Public aggregate first.
  const matchedHandle = (await desk.read.getBatchMatchedAmountHandle([
    currentBatchId,
  ])) as `0x${string}`;
  const { value: matched } = await withRetries(
    () => handleClient.publicDecrypt(matchedHandle),
    { label: "publicDecrypt(matchedAmount)" },
  );
  console.log(`[e2e] decrypted matched amount: ${matched}`);
  if (matched !== EXPECTED_MATCHED) {
    throw new Error(`[e2e] MISMATCH: expected matched=${EXPECTED_MATCHED}, got ${matched}`);
  }

  const buyResidualHandle = (await desk.read.getOrderResidualHandle([
    buyOrderId,
  ])) as `0x${string}`;
  const { value: buyResidual } = await withRetries(
    () => handleClient.decrypt(buyResidualHandle),
    { label: "decrypt(buyResidual)" },
  );
  console.log(`[e2e] decrypted buy residual: ${buyResidual}`);
  if (buyResidual !== EXPECTED_BUY_RESIDUAL) {
    throw new Error(
      `[e2e] MISMATCH: expected buyResidual=${EXPECTED_BUY_RESIDUAL}, got ${buyResidual}`,
    );
  }

  const sellResidualHandle = (await desk.read.getOrderResidualHandle([
    sellOrderId,
  ])) as `0x${string}`;
  const { value: sellResidual } = await withRetries(
    () => handleClient.decrypt(sellResidualHandle),
    { label: "decrypt(sellResidual)" },
  );
  console.log(`[e2e] decrypted sell residual: ${sellResidual}`);
  if (sellResidual !== EXPECTED_SELL_RESIDUAL) {
    throw new Error(
      `[e2e] MISMATCH: expected sellResidual=${EXPECTED_SELL_RESIDUAL}, got ${sellResidual}`,
    );
  }

  // --- real confidential balance movement check: same signer plays both
  // legs, so a fully-matched round trip (pull `matched` out on the buy leg,
  // push `matched` back in on the sell leg) nets to zero — but only because
  // the desk genuinely held `matched` cUSDC in between, which the unit tests
  // (two DISTINCT accounts) already confirm directly. Here we just confirm
  // the signer's balance is unchanged end-to-end, i.e. nothing was lost or
  // double-counted.
  const balanceHandleAfter = (await cusdc.read.confidentialBalanceOf([
    signer.account.address,
  ])) as `0x${string}`;
  const { value: confidentialBalanceAfter } = await withRetries(
    () => handleClient.decrypt(balanceHandleAfter),
    { label: "decrypt(confidentialBalanceOf(signer) after settle)" },
  );
  console.log(`[e2e] confidential balance after settle: ${confidentialBalanceAfter}`);
  if (confidentialBalanceAfter !== confidentialBalanceBeforeOrders) {
    throw new Error(
      `[e2e] MISMATCH: expected balance to return to ${confidentialBalanceBeforeOrders} ` +
        `after a fully round-tripped single-account match, got ${confidentialBalanceAfter}`,
    );
  }

  console.log(
    "[e2e] OK — submitOrder -> settleBatch -> decrypt all matched real values on live Sepolia.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
