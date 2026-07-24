// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * @title IViewerRegistry
 * @notice External interface of `ViewerRegistry.sol` — the compliance-viewer ACL module that
 * `AfterHoursDesk` delegates to right after computing each order's confidential `fill` handle
 * during `settleBatch()`. Kept in its own file/contract, deliberately separate from
 * `AfterHoursDesk.sol`, so the "who can decrypt what" surface is auditable in one place (see
 * feedback.md, Fase 3).
 */
interface IViewerRegistry {
    /// @dev Emitted once per fill registered. Carries only the PUBLIC handle pointer
    /// (`bytes32`, never plaintext) — lets an off-chain indexer/frontend know "this handle is
    /// now auditor-viewable" without decrypting anything itself.
    event FillRegistered(bytes32 indexed fillHandle);

    /**
     * @notice Grants `complianceViewer` viewer-role decrypt access over `fill`.
     * @dev Gated by `onlyDesk` (reverts `OnlyDesk` otherwise) — a defense-in-depth caller check
     * on top of, not instead of, Nox's own ACL layer (`Nox.addViewer` is itself gated by
     * NoxCompute's `onlyAllowed(handle)`, checked against `msg.sender` as NoxCompute sees it —
     * i.e. THIS registry contract). Even without the `onlyDesk` check, only a caller that has
     * first been granted real (persistent or transient) Nox access over `fill` could make this
     * call succeed — but relying solely on a third-party protocol's ACL as the only
     * authorization boundary was flagged as a single-point-of-failure risk (hackathon watchdog
     * review, Fase 3), so `desk` narrows the caller explicitly too. See `ViewerRegistry.sol`.
     * @param fill The confidential fill-amount handle to register for compliance viewing.
     */
    function registerFill(euint256 fill) external;

    /// @notice One-time setter for the `AfterHoursDesk` instance allowed to call `registerFill`.
    /// Reverts `DeskAlreadySet` if already set, `ZeroDesk` if `desk_` is the zero address.
    function setDesk(address desk_) external;

    /// @notice The one `AfterHoursDesk` instance allowed to call `registerFill`, or `address(0)`
    /// before `setDesk` has been called.
    function desk() external view returns (address);

    /// @notice The immutable compliance-viewer (auditor) address — set once at deploy time,
    /// never rotatable. See `ViewerRegistry.sol` and feedback.md (Fase 3) for why rotation was
    /// deliberately NOT built in this phase.
    function complianceViewer() external view returns (address);
}
