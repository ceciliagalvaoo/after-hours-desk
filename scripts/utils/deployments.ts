import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Single source of truth for deployed Sepolia addresses. The frontend (later
 * phases) reads this file directly instead of hardcoding addresses, so
 * redeploys never require a frontend code change.
 */
const DEPLOYMENTS_DIR = path.resolve(import.meta.dirname, "..", "..", "deployments");
const SEPOLIA_DEPLOYMENTS_FILE = path.join(DEPLOYMENTS_DIR, "sepolia.json");
const SEPOLIA_CHAIN_ID_LITERAL = 11_155_111 as const;

export interface SepoliaDeployments {
  chainId: 11_155_111;
  mockUSDC?: `0x${string}`;
  confidentialUSDC?: `0x${string}`;
  /// Phase 3: standalone ACL/compliance-viewer module — deployed BEFORE `afterHoursDesk`
  /// (see ViewerRegistry.sol for why deploy order matters), which takes its address as a
  /// constructor argument.
  viewerRegistry?: `0x${string}`;
  afterHoursDesk?: `0x${string}`;
  /// The real, live Uniswap V3 pool on Ethereum Sepolia used as the price reference (WETH/USDC,
  /// 0.05% fee tier) — read-only, never written to. See feedback.md, Fase 4, for the liquidity
  /// research that confirmed this pool (not a fallback) was usable.
  uniswapPool?: `0x${string}`;
  /// `UniswapV3PriceReader` — the `IUniswapPriceOracle` adapter contract `afterHoursDesk` calls
  /// into at settlement time. Distinct from `uniswapPool` above (the raw third-party pool
  /// address) — this is OUR OWN deployed adapter contract.
  priceOracle?: `0x${string}`;
  /// The auditor EOA passed to `ViewerRegistry`'s constructor (immutable `complianceViewer`).
  /// On live Sepolia this is, by necessity, the SAME single funded signer used everywhere else
  /// in this repo (see feedback.md, Fase 3, for the documented funds limitation) — genuinely
  /// distinct auditor/counterparty accounts are exercised in `test/unit/ViewerRegistry.test.ts`
  /// against the local Nox stack instead, which has free multi-account support.
  complianceViewer?: `0x${string}`;
}

export async function readSepoliaDeployments(): Promise<SepoliaDeployments> {
  try {
    const raw = await readFile(SEPOLIA_DEPLOYMENTS_FILE, "utf8");
    return JSON.parse(raw) as SepoliaDeployments;
  } catch {
    return { chainId: SEPOLIA_CHAIN_ID_LITERAL };
  }
}

export async function writeSepoliaDeployments(
  update: Partial<Omit<SepoliaDeployments, "chainId">>,
): Promise<SepoliaDeployments> {
  const current = await readSepoliaDeployments();
  const next: SepoliaDeployments = {
    ...current,
    ...update,
    chainId: SEPOLIA_CHAIN_ID_LITERAL,
  };
  await mkdir(DEPLOYMENTS_DIR, { recursive: true });
  await writeFile(SEPOLIA_DEPLOYMENTS_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`[deploy] wrote ${SEPOLIA_DEPLOYMENTS_FILE}`);
  return next;
}
