// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IUniswapPriceOracle} from "../interfaces/IUniswapPriceOracle.sol";

/**
 * @title MockPriceOracle
 * @notice TEST-ONLY double for `IUniswapPriceOracle`. Used exclusively by
 * `test/unit/AfterHoursDesk.test.ts`, which runs against the `nox-hardhat-plugin`'s local Nox
 * offchain stack (Docker) — that local chain is a fresh, isolated EDR network, NOT a fork of
 * Sepolia, so it cannot reach the real live Sepolia Uniswap pool `UniswapV3PriceReader.sol`
 * reads from. This mock exists purely to give `AfterHoursDesk`'s local netting tests a
 * deterministic, injectable price without any network dependency.
 *
 * Per this repo's own architecture doc: contracts under `contracts/mocks/` are ONLY ever used in
 * local Hardhat unit tests and are NEVER deployed to Sepolia — confirmed here too: there is no
 * `MockPriceOracle` entry in `deployments/sepolia.json`, and no deploy script under
 * `scripts/deploy/` targets it. The REAL, live-pool-backed implementation
 * (`UniswapV3PriceReader.sol`) is exercised for real in `test/unit/UniswapV3PriceReader.test.ts`
 * (against `network.connect("sepoliaFork")`, live Sepolia state) and in every Sepolia deploy/E2E
 * script — this mock never substitutes for that proof, it only unblocks the LOCAL netting tests
 * that have nothing to do with price-oracle correctness in the first place.
 */
contract MockPriceOracle is IUniswapPriceOracle {
    uint256 private _price;

    constructor(uint256 initialPrice) {
        _price = initialPrice;
    }

    /// @notice Test-only setter — lets a test change the reported price between calls to prove
    /// `AfterHoursDesk` really reads the oracle live (not a value baked in at desk-deploy time).
    function setPrice(uint256 newPrice) external {
        _price = newPrice;
    }

    /// @inheritdoc IUniswapPriceOracle
    function getReferencePrice() external view returns (uint256) {
        return _price;
    }
}
