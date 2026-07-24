import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments, writeSepoliaDeployments } from "../utils/deployments.js";

/**
 * NOTE (defense-in-depth follow-up, same day, see feedback.md "[Fase 3] Hardening..."):
 * `ViewerRegistry.sol` gained a one-time `setDesk(address)` caller gate after the
 * hackathon-watchdog review flagged relying solely on Nox's own ACL as a single point of
 * failure. This script now calls `setDesk` on the ALREADY-deployed `viewerRegistry` right after
 * deploying this new `desk`, wiring the pairing both directions in one script run.
 */

/**
 * Phase 3 REDEPLOY of `AfterHoursDesk` — supersedes the Phase 2 deployment produced by
 * `03-deploy-after-hours-desk.ts` (`0x5a3b87a57927ab415c7b368aa36bfdc2df9933f9`, see
 * feedback.md, "[Fase 2] AfterHoursDesk.sol — resultado final"). A new deployment is
 * unavoidable here: `AfterHoursDesk.sol`'s constructor signature changed (it now also takes
 * `ViewerRegistry`'s address) and its bytecode changed (the new `Order.fill` field +
 * `_registerFillForCompliance` call inside `_settleBuyOrder`/`_settleSellOrder`) — there is no
 * way to "upgrade" an already-deployed, non-proxied contract in place. The OLD address still
 * exists on-chain and still works exactly as it did in Phase 2 (it simply has no
 * `ViewerRegistry` wiring or `getOrderFillHandle`) — it is superseded, not broken; kept out of
 * `deployments/sepolia.json` going forward so the frontend/E2E scripts never point at it by
 * accident.
 *
 * Depends on both `confidentialUSDC` (Phase 1) and `viewerRegistry`
 * (`04-deploy-viewer-registry.ts`, Phase 3) already being recorded in
 * `deployments/sepolia.json`.
 */
async function main() {
  const { viem } = await connectSepolia();
  const deployments = await readSepoliaDeployments();

  if (!deployments.confidentialUSDC) {
    throw new Error(
      "[deploy] deployments/sepolia.json has no confidentialUSDC address — run " +
        "scripts/deploy/02-deploy-confidential-usdc.ts first.",
    );
  }
  if (!deployments.viewerRegistry) {
    throw new Error(
      "[deploy] deployments/sepolia.json has no viewerRegistry address — run " +
        "scripts/deploy/04-deploy-viewer-registry.ts first.",
    );
  }

  console.log(
    `[deploy] AfterHoursDesk settling against cUSDC at ${deployments.confidentialUSDC}, ` +
      `wired to ViewerRegistry at ${deployments.viewerRegistry}`,
  );
  const desk = await viem.deployContract("AfterHoursDesk", [
    deployments.confidentialUSDC,
    deployments.viewerRegistry,
  ]);
  console.log(`[deploy] AfterHoursDesk (Phase 3) deployed at ${desk.address}`);

  const viewerRegistry = await viem.getContractAt(
    "ViewerRegistry",
    deployments.viewerRegistry,
  );
  const currentDesk = await viewerRegistry.read.desk();
  if (currentDesk === "0x0000000000000000000000000000000000000000") {
    console.log(`[deploy] ViewerRegistry.setDesk(${desk.address})...`);
    const setDeskTx = await viewerRegistry.write.setDesk([desk.address]);
    console.log(`[deploy] setDesk tx: ${setDeskTx}`);
  } else {
    console.log(
      `[deploy] ViewerRegistry.desk already set to ${currentDesk} — skipping ` +
        "(this registry can only be paired with a desk once; deploy a fresh " +
        "ViewerRegistry via 04-deploy-viewer-registry.ts to re-pair).",
    );
  }

  await writeSepoliaDeployments({ afterHoursDesk: desk.address });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
