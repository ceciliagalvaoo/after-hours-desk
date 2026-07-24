import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments, writeSepoliaDeployments } from "../utils/deployments.js";

/**
 * Phase 4 REDEPLOY of `AfterHoursDesk` — supersedes the Phase 3 deployment produced by
 * `05-deploy-after-hours-desk.ts` (`0x52b47b62cd59e1f275c9ae24cb6e1d520a6e51d4`). Unavoidable,
 * same reasoning as every prior redeploy in this repo: the constructor signature changed (a
 * third argument, `priceOracleAddress`) and the bytecode changed (`_executionPriceHandle` now
 * calls a real `IUniswapPriceOracle` instead of returning a hardcoded placeholder) — there is no
 * proxy/upgrade path for a non-proxied contract.
 *
 * REAL FRICTION, not present in the cleaner "just add a constructor arg" cases so far (see
 * feedback.md, Fase 4): `ViewerRegistry.setDesk` is a ONE-TIME setter (`DeskAlreadySet` if
 * already set) — the Phase 3 `ViewerRegistry` (`0xf74d72c7b3ab70ff90e474c61c220f6c4333a180`) is
 * PERMANENTLY paired to the Phase 3 desk address. A new desk cannot reuse it. This script
 * therefore requires a FRESH `ViewerRegistry` deploy first (re-run
 * `04-deploy-viewer-registry.ts` — its logic is generic/re-runnable, no code changes needed)
 * before running this script, and refuses to proceed with a `viewerRegistry` that already has a
 * `desk` set (belongs to an older desk generation), to avoid silently reverting later inside
 * `settleBatch()` -> `_registerFillForCompliance` -> `ViewerRegistry.registerFill`'s `OnlyDesk`
 * check.
 *
 * Depends on `confidentialUSDC` (Phase 1), a FRESH `viewerRegistry` (re-run
 * `04-deploy-viewer-registry.ts` immediately before this script), and `priceOracle`
 * (`06-deploy-uniswap-price-reader.ts`, Phase 4) already being recorded in
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
  if (!deployments.priceOracle) {
    throw new Error(
      "[deploy] deployments/sepolia.json has no priceOracle address — run " +
        "scripts/deploy/06-deploy-uniswap-price-reader.ts first.",
    );
  }

  const viewerRegistry = await viem.getContractAt("ViewerRegistry", deployments.viewerRegistry);
  const existingDesk = await viewerRegistry.read.desk();
  if (existingDesk !== "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `[deploy] viewerRegistry (${deployments.viewerRegistry}) already has desk=${existingDesk} ` +
        "set — ViewerRegistry.setDesk is one-time-only (see feedback.md, Fase 4). Re-run " +
        "scripts/deploy/04-deploy-viewer-registry.ts FIRST to mint a fresh, unpaired " +
        "ViewerRegistry, then re-run this script.",
    );
  }

  console.log(
    `[deploy] AfterHoursDesk (Phase 4) settling against cUSDC at ${deployments.confidentialUSDC}, ` +
      `wired to ViewerRegistry at ${deployments.viewerRegistry}, priceOracle at ${deployments.priceOracle}`,
  );
  const desk = await viem.deployContract("AfterHoursDesk", [
    deployments.confidentialUSDC,
    deployments.viewerRegistry,
    deployments.priceOracle,
  ]);
  console.log(`[deploy] AfterHoursDesk (Phase 4) deployed at ${desk.address}`);

  console.log(`[deploy] ViewerRegistry.setDesk(${desk.address})...`);
  const setDeskTx = await viewerRegistry.write.setDesk([desk.address]);
  console.log(`[deploy] setDesk tx: ${setDeskTx}`);

  await writeSepoliaDeployments({ afterHoursDesk: desk.address });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
