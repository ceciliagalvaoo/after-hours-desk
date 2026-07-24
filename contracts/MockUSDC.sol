// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Our own test ERC-20 (6 decimals, USDC convention), deployed on Ethereum
 * Sepolia to serve as the underlying asset wrapped by `ConfidentialUSDC` (cUSDC).
 *
 * This is deliberately NOT a "real" (third-party) Sepolia test USDC — see
 * feedback.md ("Own test token instead of third-party USDC") for the full
 * reasoning: third-party Sepolia test-USDC addresses/faucets are unreliable
 * across sources and can go dark without notice, which is exactly the kind of
 * "demo breaks the night before" risk we want to avoid.
 * This is a real, deployed contract on Sepolia (not mocked data/state) — it is
 * only "mock" in the sense of "not backed by real value", same as every other
 * ERC-20 test token in this ecosystem.
 *
 * Not part of the confidential surface: this contract has no `euint256`
 * fields, no Nox import, and is never itself deployed to any network other
 * than Sepolia/local test nets. All balances here are plaintext by design —
 * confidentiality starts at the `ConfidentialUSDC` wrapper layer.
 */
contract MockUSDC is ERC20 {
    /// @dev USDC convention: 6 decimals (overrides OZ ERC20's default of 18).
    uint8 private constant DECIMALS = 6;

    /// @dev Per-call cap on the public faucet, expressed in the token's
    /// smallest unit (i.e. 50,000 * 1e6 = 50,000.000000 USDC). Generous enough
    /// for demo/test balances, small enough that the faucet cannot be used to
    /// mint an unbounded supply in one call.
    uint256 public constant FAUCET_CAP = 50_000 * 10 ** DECIMALS;

    /// @dev Emitted whenever the public faucet is used, for demo/E2E-script
    /// visibility (distinct from the standard ERC-20 {Transfer} event, which
    /// already fires from `_mint` — this just makes faucet usage easy to grep
    /// in a receipt without relying on `from == address(0)`).
    event Faucet(address indexed to, uint256 amount);

    error FaucetAmountTooLarge(uint256 requested, uint256 cap);

    constructor(uint256 initialSupplyToDeployer) ERC20("Mock USDC", "mUSDC") {
        if (initialSupplyToDeployer > 0) {
            _mint(msg.sender, initialSupplyToDeployer);
        }
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Public, permissionless faucet — anyone can mint up to
     * `FAUCET_CAP` mUSDC per call to any address. No owner/admin gating: this
     * is a demo token with no real value, so there is no "insider mint"
     * surface worth restricting, and an open faucet is simpler to demo/test
     * against than a privileged one.
     * @param to Recipient of the minted tokens.
     * @param amount Amount to mint, in the token's smallest unit (6 decimals).
     */
    function faucet(address to, uint256 amount) external {
        if (amount > FAUCET_CAP) revert FaucetAmountTooLarge(amount, FAUCET_CAP);
        _mint(to, amount);
        emit Faucet(to, amount);
    }
}
