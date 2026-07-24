// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from
    "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/**
 * @title ConfidentialUSDC (cUSDC)
 * @notice ERC-7984 confidential wrapper around `MockUSDC` (our own test ERC-20,
 * see MockUSDC.sol). 1:1 wrap/unwrap: `wrap(to, amount)` locks `amount`
 * plaintext mUSDC in this contract and mints an equal `euint256` confidential
 * balance to `to`; `unwrap` burns confidential balance and, once the async
 * TEE Runner publicly-decrypts the burned amount, `finalizeUnwrap` releases
 * the plaintext mUSDC back out.
 *
 * API confirmed against the REAL installed source of package
 * "iexec-nox slash nox-confidential-contracts", version 0.2.2 (not
 * memory/assumption):
 *   - node_modules/iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol
 *   - .../extensions/ERC20ToERC7984WrapperBase.sol (wrap/unwrap/finalizeUnwrap logic)
 *   - .../token/ERC7984Base.sol (confidentialBalanceOf, confidentialTransfer,
 *     setOperator/isOperator, the _updateWithOptimizedPrimitives ACL pattern)
 * `ERC20ToERC7984Wrapper` (not a hypothetical name — the `.env.example` note
 * asking us to confirm this was right) is a real, exported contract at that
 * exact path, with constructor signature
 * `(string name, string symbol, string contractURI, IERC20 underlying)`.
 *
 * No new handle-creating logic is added here beyond what the base contract
 * already does correctly:
 *   - `wrap()` mints via `_mint` -> `_updateWithOptimizedPrimitives` -> the
 *     mint branch of `Nox.mint`, which calls `Nox.allowThis(newToBalance)` +
 *     `Nox.allow(newToBalance, to)` BEFORE returning — the recipient's
 *     confidential balance handle is persistently viewable by them
 *     immediately, no extra wiring needed on our side.
 *   - `unwrap()` (the two-step non-external-proof overload used by an
 *     already-ACL'd amount, or the external-proof overload for a
 *     fromExternal-validated externalEuint256) burns via `_burn` and then
 *     calls `Nox.allowPublicDecryption(unwrapAmount)` — the burned amount
 *     handle is intentionally public (it's leaving the confidential system
 *     entirely, becoming a real plaintext mUSDC transfer), which is correct:
 *     unwrap amounts are not meant to stay private once tokens exit to plain
 *     ERC-20 form.
 * We therefore do not need to override `_update` or add any ACL calls of our
 * own in this file — `ERC20ToERC7984Wrapper` already does it and we verified
 * it by reading the source rather than assuming.
 */
contract ConfidentialUSDC is ERC20ToERC7984Wrapper {
    constructor(IERC20 underlyingMockUsdc)
        ERC20ToERC7984Wrapper("Confidential USDC", "cUSDC", "", underlyingMockUsdc)
    {}
}
