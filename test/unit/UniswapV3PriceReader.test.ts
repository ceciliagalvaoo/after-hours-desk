import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { network } from "hardhat";

/**
 * Runs against `sepoliaFork` (an EDR fork of LIVE Ethereum Sepolia, chainId 11155111 preserved —
 * see hardhat.config.ts) rather than the `nox-hardhat-plugin`'s local Nox stack: this contract
 * has nothing to do with Nox/encrypted handles at all — it is a plain, deterministic read over a
 * REAL third-party Uniswap V3 pool, and the whole point of this suite is proving the read is
 * correct against REAL on-chain state, not a fixture. See feedback.md, Fase 4, for the research
 * that found this pool and confirmed its liquidity.
 */

const POOL = "0x3289680dd4d6c10bb19b899729cda5eef58aeff1" as const; // Uniswap V3 WETH/USDC, 0.05%
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const ONE_WETH = 10n ** 18n;

const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint128" }],
  },
] as const;

/**
 * Mirrors, in TypeScript/bigint, the exact same safe-squaring quote-amount formula
 * `UniswapV3PriceReader._quoteAtSqrtPriceX96` implements in Solidity (itself a documented port of
 * Uniswap's own `OracleLibrary.getQuoteAtTick` body) — an INDEPENDENT re-derivation, not a call
 * into the contract under test, so this is a genuine cross-check rather than a tautology.
 */
function independentQuote(sqrtPriceX96: bigint, baseToken: string, quoteToken: string, baseAmount: bigint): bigint {
  const UINT128_MAX = (1n << 128n) - 1n;
  if (sqrtPriceX96 <= UINT128_MAX) {
    const ratioX192 = sqrtPriceX96 * sqrtPriceX96;
    return baseToken.toLowerCase() < quoteToken.toLowerCase()
      ? (ratioX192 * baseAmount) / (1n << 192n)
      : ((1n << 192n) * baseAmount) / ratioX192;
  }
  const ratioX128 = (sqrtPriceX96 * sqrtPriceX96) / (1n << 64n);
  return baseToken.toLowerCase() < quoteToken.toLowerCase()
    ? (ratioX128 * baseAmount) / (1n << 128n)
    : ((1n << 128n) * baseAmount) / ratioX128;
}

describe("UniswapV3PriceReader — real, live Sepolia Uniswap V3 pool (read-only)", () => {
  it("confirms the pool has real, non-zero liquidity (research sanity check)", async () => {
    const { viem } = await network.connect("sepoliaFork");
    const publicClient = await viem.getPublicClient();

    const liquidity = await publicClient.readContract({
      address: POOL,
      abi: POOL_ABI,
      functionName: "liquidity",
    });
    assert.ok(liquidity > 0n, "expected the real Sepolia WETH/USDC pool to have non-zero liquidity");

    const slot0 = await publicClient.readContract({
      address: POOL,
      abi: POOL_ABI,
      functionName: "slot0",
    });
    assert.equal(slot0[6], true, "expected slot0().unlocked to be true (not mid-reentrancy-locked)");
  });

  it("constructor accepts the real pool with the correct {base, quote} token pair", async () => {
    const { viem } = await network.connect("sepoliaFork");
    const reader = await viem.deployContract("UniswapV3PriceReader", [POOL, WETH, USDC, ONE_WETH]);
    assert.equal((await reader.read.pool()).toLowerCase(), POOL.toLowerCase());
    assert.equal((await reader.read.baseToken()).toLowerCase(), WETH.toLowerCase());
    assert.equal((await reader.read.quoteToken()).toLowerCase(), USDC.toLowerCase());
    assert.equal(await reader.read.baseAmount(), ONE_WETH);
  });

  it("constructor also accepts the pair in the OTHER order (quote as 'base' arg, base as 'quote' arg)", async () => {
    const { viem } = await network.connect("sepoliaFork");
    // Sanity: the constructor only checks {arg1, arg2} == {token0, token1} as a SET, not in a
    // fixed order — deploying with (USDC, WETH) instead of (WETH, USDC) must still succeed.
    await viem.deployContract("UniswapV3PriceReader", [POOL, USDC, WETH, 10n ** 6n]);
  });

  it("constructor reverts TokenPairMismatch when given a token not in this pool", async () => {
    const { viem } = await network.connect("sepoliaFork");
    const NOT_IN_POOL = "0x0000000000000000000000000000000000000001" as const;
    await assert.rejects(
      viem.deployContract("UniswapV3PriceReader", [POOL, WETH, NOT_IN_POOL, ONE_WETH]),
      /TokenPairMismatch/,
    );
  });

  it("constructor reverts ZeroBaseAmount when baseAmount is 0", async () => {
    const { viem } = await network.connect("sepoliaFork");
    await assert.rejects(
      viem.deployContract("UniswapV3PriceReader", [POOL, WETH, USDC, 0n]),
      /ZeroBaseAmount/,
    );
  });

  it("getReferencePrice() matches an independently-derived quote from the pool's OWN real slot0()", async () => {
    const { viem } = await network.connect("sepoliaFork");
    const publicClient = await viem.getPublicClient();

    const reader = await viem.deployContract("UniswapV3PriceReader", [POOL, WETH, USDC, ONE_WETH]);
    const priceFromContract = await reader.read.getReferencePrice();

    // Independent cross-check: read the SAME pool's slot0() directly (not through the contract
    // under test) and recompute the expected price in TypeScript using a separately-written
    // implementation of the same formula.
    const [sqrtPriceX96] = await publicClient.readContract({
      address: POOL,
      abi: POOL_ABI,
      functionName: "slot0",
    });
    const expectedPrice = independentQuote(sqrtPriceX96, WETH, USDC, ONE_WETH);

    assert.equal(priceFromContract, expectedPrice);
    // Sane order of magnitude for a WETH/USDC pool (6-decimal fixed point) — not zero, not an
    // absurdly huge number that would indicate an overflow/formula bug.
    assert.ok(priceFromContract > 1n * 10n ** 6n, "expected > 1 USDC per WETH");
    assert.ok(priceFromContract < 10_000_000n * 10n ** 6n, "expected < 10,000,000 USDC per WETH");
  });
});
