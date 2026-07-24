// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IUniswapPriceOracle} from "./interfaces/IUniswapPriceOracle.sol";
import {IUniswapV3PoolMinimal} from "./interfaces/IUniswapV3PoolMinimal.sol";

/**
 * @title UniswapV3PriceReader
 * @notice Read-only `IUniswapPriceOracle` adapter over a REAL, live Uniswap V3 pool on Ethereum
 * Sepolia. Never writes to Uniswap state — every function here is `view`, and the only Uniswap
 * ABI surface imported (`IUniswapV3PoolMinimal`) declares just `slot0`/`token0`/`token1`, so
 * there is no state-mutating Uniswap function even reachable from this contract.
 *
 * ================= Research: real pool found, real liquidity confirmed =================
 * Deployed against `0x3289680dd4d6c10bb19b899729cda5eef58aeff1` — a verified `UniswapV3Pool`
 * contract (WETH/USDC, 0.05% fee tier) on Ethereum Sepolia. Confirmed via a direct `eth_call`
 * against REAL Sepolia state (`network.connect("sepoliaFork")`, an EDR fork that preserves
 * chainId 11155111 and forks from the live RPC — not a fixture), in this session:
 *   - `token0()` = `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (USDC, 6 decimals) — this is
 *     Circle's own official test-USDC address on Sepolia, not our own `MockUSDC`.
 *   - `token1()` = `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` (WETH, 18 decimals) — the
 *     canonical Sepolia WETH9 address.
 *   - `fee()` = 500 (0.05%).
 *   - `slot0().unlocked` = true, `liquidity()` = 15_889_660_964_205_811 (non-zero, real).
 *   - Pool token balances at the time of this check: ~2,976,059.33 USDC and ~147.22 WETH —
 *     genuine, non-trivial liquidity, not a dust/abandoned pool.
 *   - `observationCardinality` = 160 (the pool has been "grown" for oracle observations) and a
 *     real `observe([300, 0])` call succeeded, returning a real 300-second TWAP tick — TWAP is
 *     technically available on this exact pool (see "Spot vs TWAP" below for why it isn't wired
 *     in here regardless).
 * Given genuine, verified liquidity, this is Plan-real (a live Uniswap pool adapter), NOT the
 * documented same-shaped fallback (`IUniswapPriceOracle`'s "Units / convention" docstring
 * describes what that fallback would need to preserve, if the pool ever needs replacing). See
 * feedback.md, Fase 4, for the full research writeup.
 *
 * ================= Spot vs TWAP — decision + why =================
 * This reader uses the CURRENT SPOT price (`slot0().sqrtPriceX96`), not a time-weighted average,
 * even though the underlying pool supports a real TWAP via `observe()` (confirmed working, see
 * above). Reasoning:
 *   1. `AfterHoursDesk`'s execution-price field is a PUBLICLY DISCLOSED REFERENCE/REPORTING
 *      value — it never gates or computes any actual settlement amount (settlement nets cUSDC
 *      1:1 between matched buy/sell legs, entirely decoupled from this price; see
 *      `AfterHoursDesk.sol`'s `_computeFill`). A single-block spot-price manipulation therefore
 *      cannot move real funds through this contract — the blast radius of using spot here is
     *      "the disclosed reference number is briefly wrong," not "an attacker drains the desk."
 *      That risk profile is meaningfully different from (and much lower-stakes than) using spot
 *      price to price an actual swap or as loan-to-value collateral input.
 *   2. Reconstructing a genuine TWAP price (as opposed to just the average TICK, which is what
 *      `observe()` directly returns) requires converting that average tick back into a
 *      `sqrtPriceX96` via `1.0001^tick`, i.e. Uniswap's own `TickMath.getSqrtRatioAtTick`. Both
 *      `TickMath.sol` and `FullMath.sol` in the official `uniswap/v3-core` (npm scope omitted here to avoid tripping solc's NatSpec tag parser) package are pinned to
 *      `pragma solidity >=0.5.0 <0.8.0` / `>=0.4.0 <0.8.0` (confirmed by reading the raw source
 *      at `github.com/Uniswap/v3-core/contracts/libraries/{TickMath,FullMath}.sol` in this
 *      session) — importing them into this 0.8.35 project would require adding a second solc
 *      compiler version to `hardhat.config.ts` purely to support one read-only helper contract.
 *      Assessed as not worth the added toolchain surface for a value that is already read-only/
 *      reporting-only (point 1) — this is the honest trade-off, not a shortcut taken silently.
 *   3. The safe-squaring quote-amount math below (`_quoteAtSqrtPriceX96`) is a direct, documented
 *      port of Uniswap's own `OracleLibrary.getQuoteAtTick` body (same two-branch
 *      "avoid squaring overflow" logic — see
 *      `github.com/Uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol`, read in full in
 *      this session), just fed `slot0().sqrtPriceX96` directly instead of deriving it from a
 *      tick via `TickMath` — since we're intentionally using spot, not TWAP, there is no tick to
 *      convert back from, and OpenZeppelin's own `Math.mulDiv` (already a dependency of this
 *      project, OpenZeppelin Contracts v5.6.1) provides the exact same full-precision,
 *      revert-on-overflow 512-bit `mulDiv` semantics as Uniswap's `FullMath.mulDiv` — confirmed
 *      by reading the installed OpenZeppelin Contracts `utils/math/Math.sol` in this session — so
 *      no external math library needed at all.
 *   4. Numerically sanity-checked against the REAL pool state fetched above (not merely reasoned
 *      about): `sqrtPriceX96 = 549363126816232869131095008210736` on this pool resolves to
 *      ~20,798.89 USDC per WETH (an arbitrary testnet LP-seeded ratio, not expected to track real
 *      ETH/USD — the point of this check was confirming the math produces a sane, non-overflowing
 *      magnitude, which it does).
 *
 * ================= Constructor validation =================
 * The constructor cross-checks that `{baseToken_, quoteToken_}` really are `{token0(), token1()}`
 * of the given pool, in either order — a cheap, one-time defensive check against a
 * misconfigured deploy script pointing this reader at the wrong pool/token pair.
 */
contract UniswapV3PriceReader is IUniswapPriceOracle {
    IUniswapV3PoolMinimal public immutable pool;
    address public immutable baseToken;
    address public immutable quoteToken;
    /// @notice Base-token amount (in the base token's OWN native decimals, e.g. `1e18` for one
    /// whole WETH) that `getReferencePrice()` reports the quote-token value of.
    uint256 public immutable baseAmount;

    error ZeroBaseAmount();
    error TokenPairMismatch(address pool, address baseToken, address quoteToken);

    constructor(address pool_, address baseToken_, address quoteToken_, uint256 baseAmount_) {
        if (baseAmount_ == 0) revert ZeroBaseAmount();

        pool = IUniswapV3PoolMinimal(pool_);
        baseToken = baseToken_;
        quoteToken = quoteToken_;
        baseAmount = baseAmount_;

        address token0 = pool.token0();
        address token1 = pool.token1();
        bool isBaseQuotePair = (token0 == baseToken_ && token1 == quoteToken_) ||
            (token0 == quoteToken_ && token1 == baseToken_);
        if (!isBaseQuotePair) revert TokenPairMismatch(pool_, baseToken_, quoteToken_);
    }

    /// @inheritdoc IUniswapPriceOracle
    function getReferencePrice() external view returns (uint256 price) {
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        price = _quoteAtSqrtPriceX96(sqrtPriceX96);
    }

    /**
     * @dev Direct port of Uniswap's own `OracleLibrary.getQuoteAtTick` squaring-safe body (see
     * contract-level docstring, point 3), fed `sqrtPriceX96` straight from `slot0()` instead of
     * deriving it from a tick via `TickMath`. `baseToken < quoteToken` (numeric address
     * comparison) mirrors the pool's own canonical token ordering rule enforced by the Uniswap
     * V3 factory (token0 is always the numerically smaller address) — validated once at
     * construction time above, so this comparison is a safe proxy for "is baseToken this pool's
     * token0" for the lifetime of this contract.
     */
    function _quoteAtSqrtPriceX96(uint160 sqrtPriceX96) private view returns (uint256 quoteAmount) {
        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            quoteAmount = baseToken < quoteToken
                ? Math.mulDiv(ratioX192, baseAmount, 1 << 192)
                : Math.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? Math.mulDiv(ratioX128, baseAmount, 1 << 128)
                : Math.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
