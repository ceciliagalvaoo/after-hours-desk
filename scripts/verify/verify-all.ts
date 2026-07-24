import { execFileSync } from "node:child_process";
import { readSepoliaDeployments } from "../utils/deployments.js";

/**
 * Re-verifies every currently-deployed contract in `deployments/sepolia.json` on Etherscan/
 * Blockscout/Sourcify in one run — `npx hardhat verify` already no-ops gracefully on a contract
 * that's already verified (confirmed repeatedly in this session), so this is safe to re-run any
 * time, e.g. after a redeploy this file forgot to account for. Constructor arguments are
 * hardcoded here to match EXACTLY what each deploy script (`scripts/deploy/0N-*.ts`) actually
 * passed — kept in sync manually (this repo has no on-chain constructor-arg introspection), so
 * update this file alongside any future deploy script change.
 */

const MOCK_USDC_INITIAL_SUPPLY = 1_000_000n * 10n ** 6n; // scripts/deploy/01-deploy-mock-usdc.ts
const UNISWAP_V3_WETH_USDC_POOL_SEPOLIA = "0x3289680dd4d6c10bb19b899729cda5eef58aeff1";
const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const ONE_WETH = 10n ** 18n; // scripts/deploy/06-deploy-uniswap-price-reader.ts

function verify(label: string, address: string, args: string[]) {
  console.log(`\n[verify] ${label} @ ${address}`);
  try {
    execFileSync("npx", ["hardhat", "verify", "--network", "sepolia", address, ...args], {
      stdio: "inherit",
    });
  } catch (error) {
    // `hardhat verify` exits non-zero when ONE of its three targets (Etherscan/Blockscout/
    // Sourcify) fails even if the others succeed (see feedback.md, Fase 3: Blockscout failed once
    // for AfterHoursDesk while Etherscan/Sourcify succeeded) — don't abort the whole run over a
    // single already-verified/partial-failure target.
    console.log(`[verify] ${label}: non-zero exit (see output above) — continuing.`);
  }
}

async function main() {
  const deployments = await readSepoliaDeployments();

  if (deployments.mockUSDC) {
    verify("MockUSDC", deployments.mockUSDC, [MOCK_USDC_INITIAL_SUPPLY.toString()]);
  }
  if (deployments.confidentialUSDC && deployments.mockUSDC) {
    verify("ConfidentialUSDC", deployments.confidentialUSDC, [deployments.mockUSDC]);
  }
  if (deployments.viewerRegistry && deployments.complianceViewer) {
    verify("ViewerRegistry", deployments.viewerRegistry, [deployments.complianceViewer]);
  }
  if (deployments.priceOracle) {
    verify("UniswapV3PriceReader", deployments.priceOracle, [
      UNISWAP_V3_WETH_USDC_POOL_SEPOLIA,
      WETH_SEPOLIA,
      USDC_SEPOLIA,
      ONE_WETH.toString(),
    ]);
  }
  if (deployments.afterHoursDesk && deployments.confidentialUSDC && deployments.viewerRegistry && deployments.priceOracle) {
    verify("AfterHoursDesk", deployments.afterHoursDesk, [
      deployments.confidentialUSDC,
      deployments.viewerRegistry,
      deployments.priceOracle,
    ]);
  }

  console.log("\n[verify] Done. Check each block above for per-contract Etherscan/Blockscout/Sourcify results.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
