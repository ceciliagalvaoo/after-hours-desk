// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * @title IConfidentialSettlement
 * @notice External interface of `AfterHoursDesk.sol` — the stable ABI surface the frontend
 * builds the redacted order-tape UI against. Every confidential-amount getter returns the raw
 * 32-byte handle (`bytes32`, the unwrapped form of `euint256`), never a plaintext value — the
 * frontend decides whether to render "███" or call `decrypt`/`publicDecrypt` on it.
 *
 * Phase 3 adds `getOrderFillHandle` (the per-order pro-rata fill computed during settlement,
 * previously only a local variable inside `_settleBuyOrder`/`_settleSellOrder` — see
 * feedback.md, Fase 3, "gap real" — now persisted on `Order` and exposed here) and wires
 * compliance-viewer access via `ViewerRegistry.sol`, a standalone module `AfterHoursDesk` calls
 * into after computing each fill. There is deliberately no `grantAuditorAccess`/
 * `setComplianceViewer` function on this interface: the compliance viewer is immutable, fixed
 * once at `ViewerRegistry`'s deploy time (see `ViewerRegistry.sol` for why rotation was not
 * built).
 */
interface IConfidentialSettlement {
    /// @dev Emitted when a trader submits a new encrypted order. `isBuy` is public metadata
    /// (side is not one of the fields required to stay confidential per the Day-1 spike) — only
    /// `amount` is ever a handle.
    event OrderSubmitted(
        uint256 indexed orderId,
        address indexed trader,
        bool indexed isBuy,
        uint64 batchId
    );

    /// @dev Emitted once per newly opened batch (including the very first one, at construction).
    event BatchOpened(uint64 indexed batchId);

    /// @dev Emitted when a batch settles. Carries only PUBLIC bookkeeping (order counts per
    /// side) — the matched quantity and execution price are handles, read separately via
    /// `getBatchMatchedAmountHandle` / `getBatchExecutionPriceHandle`.
    event BatchSettled(uint64 indexed batchId, uint256 buyOrderCount, uint256 sellOrderCount);

    /**
     * @notice Submits a new encrypted order into the currently open batch.
     * @dev `amountHandle`/`amountProof` MUST come from the client's `encryptInput()` call made
     * BEFORE this transaction is broadcast (Pattern A). There is no plaintext-amount overload —
     * accepting a plain `uint256` here would leak the order size in calldata (Pattern B), which
     * is exactly the leak this contract exists to avoid.
     * @param isBuy Public side flag (buy vs sell).
     * @param amountHandle Externally-encrypted order size handle.
     * @param amountProof Handle Gateway proof binding `amountHandle` to `msg.sender` and this
     * contract address.
     * @return orderId Public, sequential order identifier.
     */
    function submitOrder(
        bool isBuy,
        externalEuint256 amountHandle,
        bytes calldata amountProof
    ) external returns (uint256 orderId);

    /**
     * @notice Settles the currently open batch: composed-primitives netting (Plan A) plus real
     * confidential cUSDC movement between traders. Callable by anyone — settlement triggering is
     * deliberately not gated behind a privileged keeper (see `AfterHoursDesk.sol` for why).
     * @return batchId The id of the batch that was just settled.
     */
    function settleBatch() external returns (uint64 batchId);

    /// @notice Returns the order's original (never-decreasing) encrypted amount handle.
    function getOrderHandle(uint256 orderId) external view returns (bytes32);

    /// @notice Returns the order's unmatched-residual handle (equal to the original amount handle
    /// until the order's batch settles). Decryptable only by the order's own trader.
    function getOrderResidualHandle(uint256 orderId) external view returns (bytes32);

    /// @notice Returns the order's pro-rata FILL handle produced by `settleBatch()`
    /// (`bytes32(0)` before the order's batch settles). Decryptable by the order's own trader
    /// (`Nox.allow`, set at settlement time) AND by the compliance viewer registered in
    /// `ViewerRegistry` (`Nox.addViewer`, granted via `registerFill` — see `ViewerRegistry.sol`).
    /// No other address can decrypt it.
    function getOrderFillHandle(uint256 orderId) external view returns (bytes32);

    /// @notice Returns the batch's real, Uniswap-Sepolia-referenced execution price handle
    /// (see `UniswapV3PriceReader.sol`). Publicly decryptable once the batch settles
    /// (`bytes32(0)` before then).
    function getBatchExecutionPriceHandle(uint64 batchId) external view returns (bytes32);

    /// @notice Returns the batch's aggregate matched-quantity handle. Publicly decryptable once
    /// the batch settles (`bytes32(0)` before then) — individual order sizes never are.
    function getBatchMatchedAmountHandle(uint64 batchId) external view returns (bytes32);

    /// @notice Returns the order ids (buy side, sell side) assigned to a batch.
    function getBatchOrderIds(
        uint64 batchId
    ) external view returns (uint256[] memory buyOrderIds, uint256[] memory sellOrderIds);
}
