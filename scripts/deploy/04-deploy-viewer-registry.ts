import { connectSepolia } from "../utils/network.js";
import { writeSepoliaDeployments } from "../utils/deployments.js";

/**
 * Deploys `ViewerRegistry` (Phase 3 — compliance-viewer ACL module). Must run BEFORE
 * `05-deploy-after-hours-desk.ts`: `AfterHoursDesk`'s constructor takes `ViewerRegistry`'s
 * address, while `ViewerRegistry`'s constructor takes only the compliance-viewer (auditor)
 * address — no dependency on `AfterHoursDesk` at all, precisely so this ordering has no
 * circular constructor-argument dependency (see `ViewerRegistry.sol`'s docstring).
 *
 * KNOWN, DOCUMENTED LIMITATION (same shape as Phase 2's E2E limitation — see feedback.md):
 * this repo has exactly ONE funded Sepolia signer. On live Sepolia, that signer is used as the
 * `complianceViewer` (auditor) address itself — not mocked data, a real address with real
 * (immutable, on-chain) viewer rights, just not a genuinely distinct auditor identity. Distinct
 * auditor/trader/stranger accounts are exercised for real against the local Nox stack in
 * `test/unit/ViewerRegistry.test.ts`, which has free multi-account support.
 */
async function main() {
  const { viem } = await connectSepolia();
  const [signer] = await viem.getWalletClients();

  const complianceViewer = signer.account.address;
  console.log(
    `[deploy] ViewerRegistry — complianceViewer = ${complianceViewer} ` +
      `(single funded Sepolia signer, doubling as auditor — see feedback.md, Fase 3)`,
  );

  const viewerRegistry = await viem.deployContract("ViewerRegistry", [complianceViewer]);
  console.log(`[deploy] ViewerRegistry deployed at ${viewerRegistry.address}`);

  await writeSepoliaDeployments({
    viewerRegistry: viewerRegistry.address,
    complianceViewer,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
