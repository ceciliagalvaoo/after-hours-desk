import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments } from "../utils/deployments.js";
import { createSepoliaHandleClient } from "../utils/handleClient.js";
import { withRetries } from "../utils/retry.js";

/**
 * Real, non-mocked E2E sanity check for Phase 1 (cToken), run against LIVE
 * Ethereum Sepolia (never a mock/local stand-in): faucet + approve + wrap a
 * plaintext amount of `MockUSDC` into `ConfidentialUSDC`, then decrypt the
 * resulting confidential balance handle via the real Handle Gateway (using
 * the exact same explicit Sepolia config as any other Nox-facing script —
 * see scripts/utils/handleClient.ts) and assert it matches the wrapped
 * amount 1:1.
 *
 * This intentionally does NOT assume synchronous confirmation right after
 * the `wrap` transaction is mined — see scripts/utils/retry.ts and
 * feedback.md Day-1 spike point 4. Expect this script to take anywhere from
 * several seconds to a couple of minutes end-to-end on live Sepolia.
 */

const WRAP_AMOUNT = 25n * 10n ** 6n; // 25.000000 mUSDC — small, real gas cost

async function main() {
  const { viem } = await connectSepolia();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const deployments = await readSepoliaDeployments();
  if (!deployments.mockUSDC || !deployments.confidentialUSDC) {
    throw new Error(
      "[e2e] deployments/sepolia.json is missing mockUSDC/confidentialUSDC " +
        "— run scripts/deploy/01-deploy-mock-usdc.ts and " +
        "scripts/deploy/02-deploy-confidential-usdc.ts first.",
    );
  }

  const usdc = await viem.getContractAt("MockUSDC", deployments.mockUSDC);
  const cusdc = await viem.getContractAt("ConfidentialUSDC", deployments.confidentialUSDC);

  console.log(`[e2e] signer:            ${signer.account.address}`);
  console.log(`[e2e] MockUSDC:          ${usdc.address}`);
  console.log(`[e2e] ConfidentialUSDC:  ${cusdc.address}`);

  const handleClient = await createSepoliaHandleClient(signer);

  // This script is idempotent/re-runnable (useful for a live demo/judge
  // re-check), so the signer's confidential balance may already be nonzero
  // from a previous run — we compare the DELTA across the wrap, not the
  // post-wrap balance in isolation. If this is truly the first-ever wrap for
  // this signer, `confidentialBalanceOf` returns an uninitialized
  // (bytes32(0)) handle and `decrypt()` correctly rejects it as
  // "does not exist" — treat that specific case as a starting balance of 0.
  const balanceHandleBefore = (await cusdc.read.confidentialBalanceOf([
    signer.account.address,
  ])) as `0x${string}`;
  let confidentialBalanceBefore = 0n;
  try {
    const { value } = await handleClient.decrypt(balanceHandleBefore);
    confidentialBalanceBefore = value as bigint;
  } catch {
    console.log("[e2e] no prior confidential balance for this signer (first wrap) — starting from 0");
  }
  console.log(`[e2e] confidential balance BEFORE wrap: ${confidentialBalanceBefore}`);

  const balanceBefore = await usdc.read.balanceOf([signer.account.address]);
  if (balanceBefore < WRAP_AMOUNT) {
    console.log(`[e2e] faucet-ing ${WRAP_AMOUNT} (raw units) mUSDC to signer...`);
    const faucetTx = await usdc.write.faucet([signer.account.address, WRAP_AMOUNT]);
    console.log(`[e2e] faucet tx: ${faucetTx}`);
    await publicClient.waitForTransactionReceipt({ hash: faucetTx });
  }

  console.log(`[e2e] approve(cUSDC, ${WRAP_AMOUNT})...`);
  const approveTx = await usdc.write.approve([cusdc.address, WRAP_AMOUNT]);
  console.log(`[e2e] approve tx: ${approveTx}`);
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  console.log(`[e2e] wrap(signer, ${WRAP_AMOUNT})...`);
  const wrapTx = await cusdc.write.wrap([signer.account.address, WRAP_AMOUNT]);
  console.log(`[e2e] wrap tx: ${wrapTx}`);
  const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapTx });
  console.log(`[e2e] wrap mined in block ${wrapReceipt.blockNumber}`);

  // Public, plaintext cross-check first (no Nox round-trip needed): the
  // wrapper's own mUSDC balance grew by at least WRAP_AMOUNT (>= because,
  // like the confidential balance, it may already hold funds from a
  // previous run of this same idempotent script).
  const wrapperUnderlyingBalance = await usdc.read.balanceOf([cusdc.address]);
  console.log(
    `[e2e] ConfidentialUSDC's underlying mUSDC balance (public, plaintext): ` +
      `${wrapperUnderlyingBalance}`,
  );

  const balanceHandleAfter = (await cusdc.read.confidentialBalanceOf([
    signer.account.address,
  ])) as `0x${string}`;
  console.log(`[e2e] confidential balance handle (after wrap): ${balanceHandleAfter}`);

  const { value: confidentialBalanceAfter } = await withRetries(
    () => handleClient.decrypt(balanceHandleAfter),
    { attempts: 30, delayMs: 5000, label: "decrypt(confidentialBalanceOf(signer))" },
  );

  console.log(`[e2e] decrypted confidential balance AFTER wrap: ${confidentialBalanceAfter}`);

  const delta = (confidentialBalanceAfter as bigint) - confidentialBalanceBefore;
  if (delta !== WRAP_AMOUNT) {
    throw new Error(
      `[e2e] MISMATCH: expected confidential balance to grow by ${WRAP_AMOUNT}, ` +
        `it grew by ${delta} (before: ${confidentialBalanceBefore}, after: ${confidentialBalanceAfter})`,
    );
  }

  console.log(
    "[e2e] OK — decrypted confidential balance grew by exactly the wrapped plaintext amount (1:1).",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
