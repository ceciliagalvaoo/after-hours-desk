import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments } from "../utils/deployments.js";
import { createSepoliaHandleClient } from "../utils/handleClient.js";
import { withRetries } from "../utils/retry.js";

/**
 * Real, non-mocked E2E check for Phase 3 (compliance-viewer ACL wiring), run against LIVE
 * Ethereum Sepolia: submits a BUY order and a SELL order against the Phase-3 `AfterHoursDesk`
 * (the one wired to `ViewerRegistry`, from `05-deploy-after-hours-desk.ts`), settles the batch,
 * then proves — with REAL on-chain data, not an assumption — that `ViewerRegistry.registerFill`
 * actually executed for every fill produced.
 *
 * KNOWN, DELIBERATE LIMITATION (documented, not hidden — see feedback.md, Fase 3, and the same
 * pattern already used in `settle-check.sepolia.ts`, Fase 2): this repo has exactly ONE funded
 * Sepolia signer. `ViewerRegistry`'s `complianceViewer` (the auditor) was deployed AS that same
 * signer (`04-deploy-viewer-registry.ts`), and both the BUY and SELL orders below are submitted
 * BY THAT SAME SIGNER too. This means the signer ends up holding BOTH:
 *   (a) ADMIN access over each fill (`Nox.allow(fill, order.trader)`, granted because the signer
 *       IS the trader for both orders), and
 *   (b) VIEWER access over each fill (`Nox.addViewer(fill, complianceViewer)`, granted by
 *       `ViewerRegistry.registerFill` because the signer IS the compliance viewer).
 * With only one account, decrypting a fill successfully does NOT, by itself, distinguish which
 * grant made it possible — (a) alone would already be sufficient. Genuinely distinct
 * trader/trader/auditor/stranger accounts (4 of them) are exercised for real, with ACL
 * ISOLATION actually proven (each trader can decrypt ONLY their own fill; the auditor can
 * decrypt BOTH; a stranger can decrypt NEITHER), by `test/unit/ViewerRegistry.test.ts` against
 * the local Nox stack's free multi-account support — that is where the actual ACL-isolation
 * claim is verified, not here.
 *
 * What THIS script proves instead, with real single-account Sepolia data: that the FULL
 * deployed call chain (`AfterHoursDesk._registerFillForCompliance` ->
 * `Nox.allowTransient(fill, address(viewerRegistry))` -> `ViewerRegistry.registerFill(fill)` ->
 * `Nox.addViewer(fill, complianceViewer)`) actually executes, on real Sepolia, without
 * reverting, for BOTH the buy leg and the sell leg of a real settlement — by reading the real
 * `ViewerRegistry.FillRegistered` event emitted during the real `settleBatch()` transaction and
 * asserting its `fillHandle` matches `getOrderFillHandle` for each order. This is orthogonal to
 * (not a substitute for) the ACL-isolation proof above.
 *
 * Never assumes synchronous confirmation of decrypted results right after a transaction — see
 * scripts/utils/retry.ts and feedback.md Day-1 spike 4.
 */

const BUY_AMOUNT = 10n * 10n ** 6n; // 10.000000 mUSDC
const SELL_AMOUNT = 6n * 10n ** 6n; // 6.000000 mUSDC — matched = min(10, 6) = 6
const EXPECTED_MATCHED = SELL_AMOUNT;

const SHORT_LIVED_OPERATOR_EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);

async function main() {
  const { viem } = await connectSepolia();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const deployments = await readSepoliaDeployments();
  if (
    !deployments.mockUSDC ||
    !deployments.confidentialUSDC ||
    !deployments.viewerRegistry ||
    !deployments.afterHoursDesk ||
    !deployments.complianceViewer
  ) {
    throw new Error(
      "[e2e] deployments/sepolia.json is missing mockUSDC/confidentialUSDC/viewerRegistry/" +
        "afterHoursDesk/complianceViewer — run scripts/deploy/01 through 05 first.",
    );
  }

  const usdc = await viem.getContractAt("MockUSDC", deployments.mockUSDC);
  const cusdc = await viem.getContractAt("ConfidentialUSDC", deployments.confidentialUSDC);
  const viewerRegistry = await viem.getContractAt("ViewerRegistry", deployments.viewerRegistry);
  const desk = await viem.getContractAt("AfterHoursDesk", deployments.afterHoursDesk);

  console.log(`[e2e] signer (trader AND complianceViewer — see limitation note above): ${signer.account.address}`);
  console.log(`[e2e] MockUSDC:        ${usdc.address}`);
  console.log(`[e2e] ConfidentialUSDC:${cusdc.address}`);
  console.log(`[e2e] ViewerRegistry:  ${viewerRegistry.address}`);
  console.log(`[e2e] AfterHoursDesk:  ${desk.address}`);

  const onChainComplianceViewer = await viewerRegistry.read.complianceViewer();
  console.log(`[e2e] ViewerRegistry.complianceViewer(): ${onChainComplianceViewer}`);
  if (onChainComplianceViewer.toLowerCase() !== deployments.complianceViewer.toLowerCase()) {
    throw new Error(
      `[e2e] MISMATCH: on-chain complianceViewer (${onChainComplianceViewer}) does not match ` +
        `deployments/sepolia.json's complianceViewer (${deployments.complianceViewer}).`,
    );
  }

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

  // --- settle. Keep the receipt: we read `ViewerRegistry.FillRegistered` events emitted DURING
  // this exact transaction below — the strongest single-account-compatible proof available that
  // the compliance-viewer wiring actually ran on real Sepolia (see docstring above).
  console.log("[e2e] settleBatch()...");
  const settleTx = await desk.write.settleBatch();
  console.log(`[e2e] settleBatch tx: ${settleTx}`);
  const settleReceipt = await publicClient.waitForTransactionReceipt({ hash: settleTx });

  // --- read back the persisted fill handles (Phase 3 gap fix: `Order.fill`, previously
  // discarded after use — see feedback.md, Fase 3, "gap real").
  const buyFillHandle = (await desk.read.getOrderFillHandle([buyOrderId])) as `0x${string}`;
  const sellFillHandle = (await desk.read.getOrderFillHandle([sellOrderId])) as `0x${string}`;
  console.log(`[e2e] buyFillHandle:  ${buyFillHandle}`);
  console.log(`[e2e] sellFillHandle: ${sellFillHandle}`);
  if (buyFillHandle === `0x${"0".repeat(64)}` || sellFillHandle === `0x${"0".repeat(64)}`) {
    throw new Error("[e2e] MISMATCH: expected both fill handles to be non-zero after settlement.");
  }

  // --- real on-chain proof that `ViewerRegistry.registerFill` executed for BOTH fills, read
  // directly from the settlement transaction's own logs (not re-derived/assumed).
  const fillRegisteredEvents = await viewerRegistry.getEvents.FillRegistered(
    {},
    { fromBlock: settleReceipt.blockNumber, toBlock: settleReceipt.blockNumber },
  );
  const registeredHandlesInThisTx = fillRegisteredEvents
    .filter((event) => event.transactionHash === settleTx)
    .map((event) => event.args.fillHandle);
  console.log(
    `[e2e] ViewerRegistry.FillRegistered events in settleBatch tx: ${registeredHandlesInThisTx.length}`,
  );
  if (!registeredHandlesInThisTx.includes(buyFillHandle)) {
    throw new Error(
      `[e2e] MISMATCH: no FillRegistered(${buyFillHandle}) event found for the BUY leg — ` +
        "compliance-viewer wiring did not fire as expected.",
    );
  }
  if (!registeredHandlesInThisTx.includes(sellFillHandle)) {
    throw new Error(
      `[e2e] MISMATCH: no FillRegistered(${sellFillHandle}) event found for the SELL leg — ` +
        "compliance-viewer wiring did not fire as expected.",
    );
  }
  console.log(
    "[e2e] OK — ViewerRegistry.FillRegistered fired for both the buy leg and the sell leg's " +
      "fill handles, real on-chain evidence that AfterHoursDesk -> ViewerRegistry -> " +
      "Nox.addViewer executed end to end on live Sepolia.",
  );

  // --- decrypt the fills too (full round trip) — succeeds here because the signer holds BOTH
  // admin (trader) and viewer (auditor) access, per the limitation documented above.
  const { value: buyFill } = await withRetries(() => handleClient.decrypt(buyFillHandle), {
    label: "decrypt(buyFillHandle)",
  });
  console.log(`[e2e] decrypted buy fill: ${buyFill}`);
  if (buyFill !== EXPECTED_MATCHED) {
    throw new Error(`[e2e] MISMATCH: expected buyFill=${EXPECTED_MATCHED}, got ${buyFill}`);
  }

  const { value: sellFill } = await withRetries(() => handleClient.decrypt(sellFillHandle), {
    label: "decrypt(sellFillHandle)",
  });
  console.log(`[e2e] decrypted sell fill: ${sellFill}`);
  if (sellFill !== EXPECTED_MATCHED) {
    throw new Error(`[e2e] MISMATCH: expected sellFill=${EXPECTED_MATCHED}, got ${sellFill}`);
  }

  console.log(
    "[e2e] OK — submitOrder -> settleBatch -> ViewerRegistry.registerFill -> decrypt(fill) " +
      "all confirmed with real data on live Sepolia.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
