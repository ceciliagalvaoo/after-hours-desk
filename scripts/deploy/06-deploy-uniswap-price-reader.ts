import { connectSepolia } from "../utils/network.js";
import { writeSepoliaDeployments } from "../utils/deployments.js";

/**
 * Phase 4 — deploys `UniswapV3PriceReader`, a real, read-only `IUniswapPriceOracle` adapter over
 * a LIVE Uniswap V3 pool on Ethereum Sepolia.
 *
 * Pool: `0x3289680dd4d6c10bb19b899729cda5eef58aeff1` — a verified `UniswapV3Pool` (WETH/USDC,
 * 0.05% fee tier). Confirmed to have REAL, non-trivial liquidity via a direct `eth_call` against
 * live Sepolia state (`network.connect("sepoliaFork")`, this repo's EDR fork of Ethereum
 * Sepolia) in this session — see feedback.md, Fase 4, for the exact numbers (token0 = USDC
 * `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, token1 = WETH
 * `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, fee 500, non-zero `liquidity()`, real pool token
 * balances in the millions of USDC / hundreds of WETH). Given real, verified liquidity, this
 * deploys the REAL adapter (not the documented same-shaped fallback).
 *
 * `baseAmount = 1e18` (one whole WETH) — `getReferencePrice()` therefore returns "USDC amount,
 * 6-decimal fixed-point, per 1 WETH", matching the 6-decimal convention `AfterHoursDesk.sol`'s
 * (now-removed) Phase-2/3 placeholder used.
 *
 * `UniswapV3PriceReader` has no dependency on any other contract in this repo (it is a pure,
 * stateless read over a third-party Uniswap pool) — it can be deployed independently of, and
 * reused indefinitely across, any number of future `AfterHoursDesk` redeploys (unlike
 * `ViewerRegistry`, whose one-time `setDesk` pairing forces a fresh deploy alongside every
 * bytecode-changing desk redeploy — see `07-deploy-after-hours-desk.ts`).
 */

const UNISWAP_V3_WETH_USDC_POOL_SEPOLIA = "0x3289680dd4d6c10bb19b899729cda5eef58aeff1" as const;
const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;
const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const ONE_WETH = 10n ** 18n;

async function main() {
  const { viem } = await connectSepolia();

  console.log(
    `[deploy] UniswapV3PriceReader — pool=${UNISWAP_V3_WETH_USDC_POOL_SEPOLIA} ` +
      `base(WETH)=${WETH_SEPOLIA} quote(USDC)=${USDC_SEPOLIA} baseAmount=${ONE_WETH}`,
  );
  const priceReader = await viem.deployContract("UniswapV3PriceReader", [
    UNISWAP_V3_WETH_USDC_POOL_SEPOLIA,
    WETH_SEPOLIA,
    USDC_SEPOLIA,
    ONE_WETH,
  ]);
  console.log(`[deploy] UniswapV3PriceReader deployed at ${priceReader.address}`);

  const price = await priceReader.read.getReferencePrice();
  console.log(
    `[deploy] sanity check — getReferencePrice() right now: ${price} ` +
      `(raw USDC units, 6 decimals, per 1 WETH = ${Number(price) / 1e6} USDC/WETH)`,
  );

  await writeSepoliaDeployments({
    uniswapPool: UNISWAP_V3_WETH_USDC_POOL_SEPOLIA,
    priceOracle: priceReader.address,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
