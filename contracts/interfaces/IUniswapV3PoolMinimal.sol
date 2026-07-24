// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @title IUniswapV3PoolMinimal
 * @notice The minimal read-only slice of the real `IUniswapV3Pool` ABI that
 * `UniswapV3PriceReader.sol` needs (`slot0`, `token0`, `token1`). Deliberately NOT the full
 * official `IUniswapV3Pool` interface (which pulls in `IUniswapV3PoolActions` — `mint`/`swap`/
 * `burn`/`collect`/`flash` — state-mutating functions this project must never call, per the
 * hackathon's read-only composability rule) — this interface makes it structurally impossible
 * for `UniswapV3PriceReader.sol` to accidentally call anything but a view function on the real
 * pool, because the mutating functions are simply not declared here at all.
 *
 * Field layout of `slot0()` and both token getters confirmed by direct `eth_call` against the
 * REAL, verified `UniswapV3Pool` contract deployed on Ethereum Sepolia at
 * `0x3289680dd4d6c10bb19b899729cda5eef58aeff1` (WETH/USDC, 0.05% fee tier), read via
 * `network.connect("sepoliaFork")` (an EDR fork of live Sepolia state, chainId 11155111
 * preserved) in this session — see feedback.md, Fase 4, for the exact values observed
 * (`token0` = USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, `token1` = WETH
 * `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, `fee` = 500, non-zero `liquidity`,
 * `slot0().unlocked` = true).
 */
interface IUniswapV3PoolMinimal {
    /// @notice Real Uniswap V3 pool state, matching the official 7-tuple return shape exactly
    /// (only `sqrtPriceX96` is actually consumed by `UniswapV3PriceReader`, but the ABI must
    /// decode the full tuple correctly or the call reverts on a return-data length mismatch).
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    function token0() external view returns (address);

    function token1() external view returns (address);
}
