import type { Abi } from "viem";

// ============================================================================
// Single source of truth, imported directly — never hand-copied.
//
// Addresses: `deployments/sepolia.json` is the canonical machine-readable
// record the whole backend already treats as the source of truth (see
// .env.example, scripts/utils/deployments.ts). Importing it directly means
// this frontend can never silently drift from what the backend actually
// deployed to Sepolia.
//
// ABIs: pulled straight from Hardhat's own compiled artifacts
// (`artifacts/contracts/**/*.json`) rather than re-typed by hand — the
// surest way to guarantee the frontend calls exactly the functions/events
// that exist on the deployed bytecode, with the exact argument/return types
// `contracts/interfaces/*.sol` declare. If a contract is ever redeployed with
// a changed ABI, `npx hardhat compile` regenerates these artifacts and the
// frontend picks the change up automatically on next build — no manual sync
// step to forget.
// ============================================================================
import deploymentsJson from "../../../deployments/sepolia.json";
import afterHoursDeskArtifact from "../../../artifacts/contracts/AfterHoursDesk.sol/AfterHoursDesk.json";
import viewerRegistryArtifact from "../../../artifacts/contracts/ViewerRegistry.sol/ViewerRegistry.json";
import confidentialUSDCArtifact from "../../../artifacts/contracts/ConfidentialUSDC.sol/ConfidentialUSDC.json";
import mockUSDCArtifact from "../../../artifacts/contracts/MockUSDC.sol/MockUSDC.json";
import uniswapV3PriceReaderArtifact from "../../../artifacts/contracts/UniswapV3PriceReader.sol/UniswapV3PriceReader.json";

export interface SepoliaDeployments {
  chainId: number;
  mockUSDC: `0x${string}`;
  confidentialUSDC: `0x${string}`;
  afterHoursDesk: `0x${string}`;
  viewerRegistry: `0x${string}`;
  complianceViewer: `0x${string}`;
  uniswapPool: `0x${string}`;
  priceOracle: `0x${string}`;
}

export const deployments = deploymentsJson as SepoliaDeployments;

if (deployments.chainId !== 11_155_111) {
  // Defensive, not decorative: if `deployments/sepolia.json` is ever
  // regenerated pointing at a different chain, fail loudly at import time
  // rather than let the UI silently talk to the wrong network's contracts.
  throw new Error(
    `[config] deployments/sepolia.json declares chainId=${deployments.chainId}, expected 11155111 ` +
      "(Ethereum Sepolia). Refusing to boot against a mismatched deployment record.",
  );
}

export const AFTER_HOURS_DESK_ABI = afterHoursDeskArtifact.abi as Abi;
export const VIEWER_REGISTRY_ABI = viewerRegistryArtifact.abi as Abi;
export const CONFIDENTIAL_USDC_ABI = confidentialUSDCArtifact.abi as Abi;
export const MOCK_USDC_ABI = mockUSDCArtifact.abi as Abi;
export const UNISWAP_V3_PRICE_READER_ABI = uniswapV3PriceReaderArtifact.abi as Abi;

// Convention shared with the backend (contracts/interfaces/IUniswapPriceOracle.sol,
// contracts/MockUSDC.sol): both mUSDC and the Uniswap reference price are
// 6-decimal fixed point ("USDC per 1 WETH").
export const USDC_DECIMALS = 6;
