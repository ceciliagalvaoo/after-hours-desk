// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @title IUniswapPriceOracle
 * @notice Minimal, source-agnostic price-reference interface `AfterHoursDesk` reads from at
 * settlement time (see `AfterHoursDesk.sol`'s `_executionPriceHandle`). Deliberately narrow (one
 * function) and deliberately agnostic to WHERE the number comes from — `UniswapV3PriceReader.sol`
 * (a real, read-only adapter over a live Sepolia Uniswap V3 pool) and the documented fallback
 * shape described in feedback.md (Fase 4) both implement exactly this interface, so
 * `AfterHoursDesk` never needs to know or care which one it was constructed with.
 *
 * ================= Units / convention =================
 * `getReferencePrice()` returns the amount of QUOTE-token the implementation is configured with,
 * denominated in the quote token's OWN native decimals, that one whole unit of the BASE token is
 * currently worth. For `UniswapV3PriceReader`, base = WETH (18 decimals) and quote = USDC
 * (6 decimals), so the returned value is already "USDC amount, 6-decimal fixed-point, per 1
 * WETH" — the exact same 6-decimal convention `AfterHoursDesk.sol`'s Phase-2/3 placeholder
 * (`PLACEHOLDER_EXECUTION_PRICE = 1_000_000`, i.e. "1.000000") used, so no unit conversion is
 * needed anywhere downstream when Phase 4 swaps the placeholder for this real read.
 *
 * ================= Read-only, by construction =================
 * `view` here is not just documentation — every implementation of this interface MUST be a pure
 * read against its underlying price source (a public Uniswap pool's own view functions, or this
 * repo's own fallback state), never a state-mutating call. This is a hard hackathon-scope rule
 * (composability with Uniswap means CALLING it, never modifying it) enforced at the type level:
 * a `view` function physically cannot emit a Uniswap-state-mutating call without the compiler
 * rejecting it.
 */
interface IUniswapPriceOracle {
    /// @notice Returns the current reference execution price (see convention above).
    /// @return price The quote-token amount (quote-token-native decimals) equivalent to one
    /// whole unit of the base token, as of the current on-chain state.
    function getReferencePrice() external view returns (uint256 price);
}
