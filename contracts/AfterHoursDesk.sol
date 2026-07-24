// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Nox, euint256, ebool, externalEuint256} from
    "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {IConfidentialSettlement} from "./interfaces/IConfidentialSettlement.sol";
import {IViewerRegistry} from "./interfaces/IViewerRegistry.sol";
import {IUniswapPriceOracle} from "./interfaces/IUniswapPriceOracle.sol";

/**
 * @title AfterHoursDesk
 * @notice Confidential OTC / dark-pool batch-settlement desk. Traders submit encrypted orders
 * (`submitOrder`); anyone can trigger `settleBatch()` once a batch has both a buy and a sell
 * side. Settlement nets the batch and moves real confidential cUSDC balances between traders —
 * order size is never plaintext on-chain; only the aggregate matched quantity and a real,
 * live Uniswap-Sepolia-referenced execution price (Phase 4 — see `priceOracle` /
 * `_executionPriceHandle` below and `UniswapV3PriceReader.sol`) are ever marked publicly
 * decryptable.
 *
 * ================= Day-1 spike checklist (see feedback.md) — all four resolved before this
 * file was written =================
 * 1. No "custom matching function" primitive exists on the Runner (Solidity Library's
 *    "Custom Functions" section is marked "Coming Soon"). Netting here is Plan A: composed from
 *    existing primitives only — chained `safeAdd` (sum each side), `lt` + `select` (matched =
 *    min(buySum, sellSum)), `safeMul` + `safeDiv` + `safeSub` (per-order pro-rata fill /
 *    residual). Confirmed viable AND empirically tested against the local Nox stack in the
 *    Fase 0 spike (`feedback.md`, "Spike 1/4") before this contract existed.
 * 2. Never relies on Sepolia chain-id auto-detection — this contract itself has no JS-SDK
 *    dependency, but every script/test that talks to it (see scripts/utils/handleClient.ts,
 *    scripts/utils/network.ts) forces explicit Sepolia config and asserts chainId === 11155111.
 * 3. `submitOrder`'s only confidential field is `amount` (`euint256`/`externalEuint256` —
 *    `uint256` is one of the five types `encryptInput` supports today). `trader` (address) and
 *    `isBuy` (bool, kept PUBLIC here — see rationale below) are plain, public parameters/state,
 *    never handles — an encrypted `address` is not supported by the SDK today.
 * 4. Every `Nox.safeAdd`/`safeMul`/`safeDiv`/`safeSub`/`lt`/`select` call below composes
 *    on-chain, synchronously, WITHIN this same `settleBatch()` transaction (handles are
 *    deterministic and available immediately — only their CIPHERTEXT resolves asynchronously,
 *    later, off-chain, via the single Runner). Do not assume a caller can `decrypt`/
 *    `publicDecrypt` the results the instant this transaction is mined — poll/retry (see
 *    scripts/utils/retry.ts and feedback.md, Day-1 spike 4).
 *
 * ================= Design notes =================
 * - `isBuy` is kept as PUBLIC metadata (not an encrypted `euint16` enum). The Day-1 spike only
 *   required `amount` to stay confidential; keeping side public lets `submitOrder` bucket orders
 *   into the batch's buy/sell arrays without any extra confidential branching, and a dark pool's
 *   information leak model is about SIZE, not direction (which side is trading is far less
 *   sensitive than how much).
 * - This contract acts as a confidential clearing house (CCP) for the matched leg of each batch:
 *   it PULLS each buyer's own pro-rata fill of cUSDC into itself (`confidentialTransferFrom`,
 *   requires the buyer to have called `cUSDC.setOperator(address(thisDesk), until)` beforehand —
 *   see `submitOrder`'s buy-side precondition check), then PUSHES the equivalent amount out to
 *   each seller from its own balance (`confidentialTransfer`). Sellers never need to grant
 *   operator status — funds only ever move OUT to them, never pulled FROM them.
 * - CRITICAL, NOT DOCUMENTED IN THE GROUND TRUTH, CONFIRMED BY READING SOURCE: calling
 *   `IERC7984.confidentialTransferFrom(from, to, euint256 amount)` / `confidentialTransfer(to,
 *   euint256 amount)` with an `amount` handle THIS contract computed itself is NOT enough on its
 *   own. `confidentialTransferFrom`'s own `require(Nox.isAllowed(amount, msg.sender), ...)` check
 *   passes (msg.sender there = this desk, which DOES have transient ACL over `amount` from having
 *   just computed it) — but internally it calls `_updateWithOptimizedPrimitives` ->
 *   `Nox.transfer(fromBalance, toBalance, amount)`, and THAT call is made BY the cUSDC contract
 *   itself, so NoxCompute's ACL check for the `amount` operand runs with `msg.sender == cUSDC`,
 *   NOT this desk. Only this desk (not cUSDC) automatically holds transient access to a handle
 *   this desk computed — so the deeper call reverts with `NotAllowed(amount, cUSDCAddress)`
 *   unless we explicitly grant cUSDC itself transient access first via
 *   `Nox.allowTransient(amount, address(settlementToken))`, immediately before calling
 *   `confidentialTransferFrom`/`confidentialTransfer`. This exact pattern is confirmed against
 *   iExec's own reference implementation — `nox-product-poc`/cVault's
 *   `ConfidentialERC4626._transferIn`/`_transferOut` do precisely this — not invented from
 *   scratch. See feedback.md for the full writeup.
 * - Known, DELIBERATELY UNRESOLVED limitation (documented, not hidden): `submitOrder` cannot
 *   check a buyer's *confidential* cUSDC balance at submission time (the contract cannot read
 *   plaintext balances of an encrypted value without its own async round trip) — only that the
 *   buyer has authorized this desk as an operator. If a buyer's real balance is insufficient at
 *   settlement time, cUSDC's own `confidentialTransferFrom` never reverts (all-or-nothing
 *   success ebool, preserved here) — it silently moves 0 for that leg. This desk does not
 *   currently reconcile that shortfall across the matched sellers (no escrow-on-submit, no
 *   partial-shortfall redistribution) — acceptable for hackathon scope, called out here and in
 *   feedback.md rather than glossed over.
 * - ACL: each trader can decrypt their own order amount and their own post-settlement
 *   residual/fill (mirrors the exact pattern `ERC7984Base` itself uses: `Nox.allow(newBalance,
 *   holder)`). Phase 3 adds compliance-viewer wiring: `order.fill` (previously a local variable
 *   inside `_settleBuyOrder`/`_settleSellOrder`, discarded after use — a real gap, see
 *   feedback.md, Fase 3, "gap real") is now persisted on `Order` and exposed via
 *   `getOrderFillHandle`, and every fill is registered with the standalone `ViewerRegistry`
 *   module immediately after being computed, granting the compliance viewer VIEWER-role access
 *   (`Nox.addViewer`, decrypt-only) over EVERY fill produced by settlement — never the
 *   individual order's original `amount`, only its `fill`. See `ViewerRegistry.sol` for why
 *   `allow` (admin, already granted to the trader) and `addViewer` (viewer, granted to the
 *   auditor) are deliberately different roles here, and for the second, independent occurrence
 *   of the "the consuming contract needs its own transient ACL grant" pattern first found with
 *   `confidentialTransferFrom` above.
 * - Phase 4 (composability with Uniswap, read-only): `priceOracle` (`IUniswapPriceOracle`) is a
 *   third immutable constructor argument. `_executionPriceHandle()` (formerly
 *   `_placeholderExecutionPriceHandle`, see feedback.md, Fase 4) now calls
 *   `priceOracle.getReferencePrice()` — a real `view` read against a live, verified Uniswap V3
 *   pool on Ethereum Sepolia (`UniswapV3PriceReader.sol`), never a hardcoded constant. This
 *   contract never writes to Uniswap state — the oracle call is `view`, and the only Uniswap ABI
 *   surface reachable from it (`IUniswapV3PoolMinimal`) declares no mutating functions at all.
 *   The exact same `Nox.toEuint256(...)` -> "already a public handle" -> `Nox.add(..., 0)` -> now
 *   genuinely-fresh-and-publicly-decryptable-handle friction documented below for the Phase-2/3
 *   placeholder applies identically to this real, runtime-computed price: `Nox.toEuint256(x)`
 *   derives a canonical/public handle purely as a function of `x`'s value and type, regardless of
 *   whether `x` came from a compile-time constant or a live oracle call this same transaction —
 *   confirmed by reading `Nox.sol`'s `toEuint256` (always routes through
 *   `wrapAsPublicHandle`), not assumed.
 */
contract AfterHoursDesk is IConfidentialSettlement {
    // ============ Public metadata (never confidential) ============

    struct Order {
        address trader;
        bool isBuy;
        uint64 batchId;
        uint64 submittedAt;
        bool settled;
        euint256 amount; // PRIVATE — original submitted size, never decreases
        euint256 residual; // PRIVATE — mirrors `amount` until the order's batch settles
        euint256 fill; // PRIVATE — this order's pro-rata fill; `bytes32(0)` until settled
    }

    struct Batch {
        uint64 batchId;
        uint64 openedAt;
        uint64 settledAt;
        bool settled;
        uint256[] buyOrderIds;
        uint256[] sellOrderIds;
        euint256 matchedAmount; // PRIVATE internally; publicly decryptable once settled
        euint256 executionPriceHandle; // Real Uniswap-referenced price; publicly decryptable once settled
    }

    IERC7984 public immutable settlementToken; // cUSDC
    IViewerRegistry public immutable viewerRegistry; // Phase 3 — compliance-viewer ACL module
    /// @notice Phase 4 — read-only Uniswap Sepolia price reference (see
    /// `UniswapV3PriceReader.sol`). Never written to; only ever `.getReferencePrice()` (a `view`
    /// call) is invoked, from `_executionPriceHandle()`.
    IUniswapPriceOracle public immutable priceOracle;

    uint256 public nextOrderId = 1;
    uint64 public nextBatchId = 1;
    uint64 public currentBatchId;

    mapping(uint256 orderId => Order) private _orders;
    mapping(uint64 batchId => Batch) private _batches;

    // ============ Errors ============

    error EmptyBuySide(uint64 batchId);
    error EmptySellSide(uint64 batchId);
    error BatchAlreadySettled(uint64 batchId);
    error BuyerMustSetDeskAsOperator(address trader, address desk);

    constructor(address cUSDCAddress, address viewerRegistryAddress, address priceOracleAddress) {
        settlementToken = IERC7984(cUSDCAddress);
        // `ViewerRegistry` has no dependency on this desk's address (its constructor takes only
        // `complianceViewer`), so it can — and, per `scripts/deploy/`, must — be deployed FIRST;
        // this sidesteps what would otherwise be a circular constructor-argument dependency. See
        // `ViewerRegistry.sol`'s contract-level docstring.
        viewerRegistry = IViewerRegistry(viewerRegistryAddress);
        // Phase 4 — see feedback.md: `ViewerRegistry`'s one-time `setDesk` pairing means every
        // bytecode-changing redeploy of THIS contract also forces a fresh `ViewerRegistry`
        // deploy (the old one is already permanently paired to the old desk address) — the
        // `priceOracle`, by contrast, has NO notion of "which desk" at all (it is a pure,
        // stateless read over Uniswap), so the SAME `UniswapV3PriceReader` deployment can be
        // reused across desk redeploys indefinitely.
        priceOracle = IUniswapPriceOracle(priceOracleAddress);
        _openNewBatch();
    }

    // ============ External functions ============

    /// @inheritdoc IConfidentialSettlement
    function submitOrder(
        bool isBuy,
        externalEuint256 amountHandle,
        bytes calldata amountProof
    ) external returns (uint256 orderId) {
        // Pattern A only: `amountHandle`/`amountProof` were produced client-side by
        // `encryptInput()` before this tx was broadcast. `Nox.fromExternal` validates the proof
        // was signed for `msg.sender` (the trader calling this function directly) and for this
        // exact contract address — there is no plaintext-amount parameter anywhere in this
        // function; accepting one would leak the order size in calldata (Pattern B).
        euint256 amount = Nox.fromExternal(amountHandle, amountProof);

        // Fresh handles start transient-only (this tx, granted automatically to this contract by
        // `fromExternal`/`validateInputProof`). This order must survive past this tx (read again,
        // in a LATER tx, by `settleBatch`) AND the trader must eventually be able to decrypt
        // their own order size — so both grants are made explicitly, before this function
        // returns, per the ground-truth "leaks into the void until proven otherwise" rule.
        Nox.allowThis(amount);
        Nox.allow(amount, msg.sender);

        if (isBuy) {
            // Fail fast and LOUDLY on a plaintext precondition only — `isOperator()` is a public
            // boolean; checking it leaks nothing about order size. Buyers must pre-authorize this
            // desk to move their cUSDC ("operators, not allowances" — see ERC7984Base) because
            // settlement later pulls funds via `confidentialTransferFrom` on their behalf. Sellers
            // never need this: funds only ever get PUSHED to them, never pulled.
            require(
                settlementToken.isOperator(msg.sender, address(this)),
                BuyerMustSetDeskAsOperator(msg.sender, address(this))
            );
        }

        orderId = nextOrderId++;
        _orders[orderId] = Order({
            trader: msg.sender,
            isBuy: isBuy,
            batchId: currentBatchId,
            submittedAt: uint64(block.timestamp),
            settled: false,
            amount: amount,
            residual: amount,
            // `fill` does not exist yet at submission time — it is only computed at settlement
            // (`_computeFill`, inside `_settleBuyOrder`/`_settleSellOrder`). Explicitly the
            // null handle (`bytes32(0)`), never `Nox.toEuint256(0)` (which WOULD create a real,
            // publicly-decryptable handle for no reason) — `getOrderFillHandle` returning
            // `bytes32(0)` before settlement is the documented "not settled yet" signal, mirrored
            // by `getBatchMatchedAmountHandle`/`getBatchExecutionPriceHandle` before a batch
            // settles.
            fill: euint256.wrap(bytes32(0))
        });

        Batch storage batch = _batches[currentBatchId];
        if (isBuy) {
            batch.buyOrderIds.push(orderId);
        } else {
            batch.sellOrderIds.push(orderId);
        }

        emit OrderSubmitted(orderId, msg.sender, isBuy, currentBatchId);
    }

    /// @inheritdoc IConfidentialSettlement
    function settleBatch() external returns (uint64 batchId) {
        batchId = currentBatchId;
        Batch storage batch = _batches[batchId];
        if (batch.settled) revert BatchAlreadySettled(batchId);
        if (batch.buyOrderIds.length == 0) revert EmptyBuySide(batchId);
        if (batch.sellOrderIds.length == 0) revert EmptySellSide(batchId);

        uint256[] memory buyIds = batch.buyOrderIds;
        uint256[] memory sellIds = batch.sellOrderIds;

        // Open the next batch immediately so any order submitted after this point never lands in
        // the batch being closed out below.
        _openNewBatch();

        // ---- Plan A, step 1: sum each side via chained `safeAdd`. Folds from a known PUBLIC
        // zero constant (`Nox.toEuint256(0)` — the plaintext 0 is trivially known to everyone, a
        // "public handle" per Nox.sol, so folding from it leaks nothing). `select` falls back to
        // the previous running sum on any hypothetical overflow, so a single bad addend can never
        // silently corrupt every subsequent step (ground truth: never let overflow silently
        // corrupt balance-critical state).
        euint256 buySum = Nox.toEuint256(0);
        for (uint256 i = 0; i < buyIds.length; i++) {
            (ebool ok, euint256 candidate) = Nox.safeAdd(buySum, _orders[buyIds[i]].amount);
            buySum = Nox.select(ok, candidate, buySum);
        }

        euint256 sellSum = Nox.toEuint256(0);
        for (uint256 i = 0; i < sellIds.length; i++) {
            (ebool ok, euint256 candidate) = Nox.safeAdd(sellSum, _orders[sellIds[i]].amount);
            sellSum = Nox.select(ok, candidate, sellSum);
        }

        // ---- Plan A, step 2: matched = min(buySum, sellSum). `select` is the only branch
        // primitive over encrypted data — there is no `if` on an `euint256`/`ebool` condition.
        euint256 matched = Nox.select(Nox.lt(buySum, sellSum), buySum, sellSum);

        // ---- Plan A, step 3: per-order pro-rata fill + real confidential balance movement.
        // Neither loop below ever reveals an individual order's size or fill — every per-order
        // handle stays behind `allow()` for that order's own trader only.
        for (uint256 i = 0; i < buyIds.length; i++) {
            _settleBuyOrder(_orders[buyIds[i]], matched, buySum);
        }
        for (uint256 i = 0; i < sellIds.length; i++) {
            _settleSellOrder(_orders[sellIds[i]], matched, sellSum);
        }

        // ---- Plan A, step 4: the ONLY two aggregates ever marked publicly decryptable —
        // matched quantity and the real, live Uniswap-referenced execution price. Individual
        // order/fill sizes never are.
        Nox.allowThis(matched);
        Nox.allowPublicDecryption(matched);

        euint256 executionPriceHandle = _executionPriceHandle();
        Nox.allowThis(executionPriceHandle);
        Nox.allowPublicDecryption(executionPriceHandle);

        batch.matchedAmount = matched;
        batch.executionPriceHandle = executionPriceHandle;
        batch.settled = true;
        batch.settledAt = uint64(block.timestamp);

        emit BatchSettled(batchId, buyIds.length, sellIds.length);
    }

    // ============ View functions ============

    /// @inheritdoc IConfidentialSettlement
    function getOrderHandle(uint256 orderId) external view returns (bytes32) {
        return euint256.unwrap(_orders[orderId].amount);
    }

    /// @inheritdoc IConfidentialSettlement
    function getOrderResidualHandle(uint256 orderId) external view returns (bytes32) {
        return euint256.unwrap(_orders[orderId].residual);
    }

    /// @inheritdoc IConfidentialSettlement
    function getOrderFillHandle(uint256 orderId) external view returns (bytes32) {
        return euint256.unwrap(_orders[orderId].fill);
    }

    /// @inheritdoc IConfidentialSettlement
    function getBatchMatchedAmountHandle(uint64 batchId) external view returns (bytes32) {
        return euint256.unwrap(_batches[batchId].matchedAmount);
    }

    /// @inheritdoc IConfidentialSettlement
    function getBatchExecutionPriceHandle(uint64 batchId) external view returns (bytes32) {
        return euint256.unwrap(_batches[batchId].executionPriceHandle);
    }

    /// @inheritdoc IConfidentialSettlement
    function getBatchOrderIds(
        uint64 batchId
    ) external view returns (uint256[] memory buyOrderIds, uint256[] memory sellOrderIds) {
        Batch storage batch = _batches[batchId];
        return (batch.buyOrderIds, batch.sellOrderIds);
    }

    /// @notice Public, plaintext order metadata (trader/side/timing/settled) — never includes the
    /// confidential `amount`/`residual` handles, which live behind `getOrderHandle`/
    /// `getOrderResidualHandle` above instead, so it is trivial to audit which fields are actually
    /// confidential just by reading this file.
    function getOrderMeta(
        uint256 orderId
    )
        external
        view
        returns (address trader, bool isBuy, uint64 batchId, uint64 submittedAt, bool settled)
    {
        Order storage order = _orders[orderId];
        return (order.trader, order.isBuy, order.batchId, order.submittedAt, order.settled);
    }

    /// @notice Public, plaintext batch metadata.
    function getBatchMeta(
        uint64 batchId
    )
        external
        view
        returns (uint64 openedAt, uint64 settledAt, bool settled, uint256 buyOrderCount, uint256 sellOrderCount)
    {
        Batch storage batch = _batches[batchId];
        return (
            batch.openedAt,
            batch.settledAt,
            batch.settled,
            batch.buyOrderIds.length,
            batch.sellOrderIds.length
        );
    }

    // ============ Internal functions ============

    function _openNewBatch() private {
        currentBatchId = nextBatchId++;
        Batch storage batch = _batches[currentBatchId];
        batch.batchId = currentBatchId;
        batch.openedAt = uint64(block.timestamp);
        emit BatchOpened(currentBatchId);
    }

    /**
     * @dev Computes this buy order's pro-rata fill and residual, grants the trader ACL over both,
     * records the residual, then pulls the fill in cUSDC from the buyer into this desk.
     */
    function _settleBuyOrder(Order storage order, euint256 matched, euint256 buySum) private {
        (euint256 fill, euint256 residual) = _computeFill(order.amount, matched, buySum);

        Nox.allowThis(fill);
        Nox.allow(fill, order.trader);
        Nox.allowThis(residual);
        Nox.allow(residual, order.trader);

        order.fill = fill;
        order.residual = residual;
        order.settled = true;

        _registerFillForCompliance(fill);

        // See the contract-level docstring: cUSDC's OWN internal `Nox.transfer` call checks ACL
        // from cUSDC's OWN perspective, not this desk's — `fill` must be explicitly granted
        // transient access for `address(settlementToken)` here, or the call reverts deep inside
        // `_updateWithOptimizedPrimitives`. This is a real, verified requirement (confirmed
        // against iExec's own cVault reference), not a defensive guess.
        Nox.allowTransient(fill, address(settlementToken));
        settlementToken.confidentialTransferFrom(order.trader, address(this), fill);
    }

    /**
     * @dev Computes this sell order's pro-rata fill and residual, grants the trader ACL over
     * both, records the residual, then pushes the fill in cUSDC from this desk to the seller.
     */
    function _settleSellOrder(Order storage order, euint256 matched, euint256 sellSum) private {
        (euint256 fill, euint256 residual) = _computeFill(order.amount, matched, sellSum);

        Nox.allowThis(fill);
        Nox.allow(fill, order.trader);
        Nox.allowThis(residual);
        Nox.allow(residual, order.trader);

        order.fill = fill;
        order.residual = residual;
        order.settled = true;

        _registerFillForCompliance(fill);

        Nox.allowTransient(fill, address(settlementToken));
        settlementToken.confidentialTransfer(order.trader, fill);
    }

    /**
     * @dev Grants the compliance viewer VIEWER-role decrypt access over `fill` by delegating to
     * the standalone `ViewerRegistry` module. This desk already holds persistent ADMIN access
     * over `fill` (`Nox.allowThis`, above) — `ViewerRegistry` does not, so it must be granted
     * TRANSIENT access, for this transaction only, immediately before it calls
     * `Nox.addViewer` itself; otherwise NoxCompute's own `onlyAllowed(handle)` check (evaluated
     * against `msg.sender` == `ViewerRegistry`, since it is `ViewerRegistry` that makes that
     * external call) reverts with `NotAllowed`. Same root cause, same fix shape, as the
     * `confidentialTransferFrom`/`confidentialTransfer` friction documented at the top of this
     * file — its second, independent occurrence in this codebase (see feedback.md, Fase 3).
     */
    function _registerFillForCompliance(euint256 fill) private {
        Nox.allowTransient(fill, address(viewerRegistry));
        viewerRegistry.registerFill(fill);
    }

    /**
     * @dev Pro-rata allocation: `fill = orderAmount * matched / sideSum`, `residual = orderAmount
     * - fill`. Uses `safeMul`/`safeDiv`/`safeSub` (never the wrapping variants) because this
     * feeds a REAL confidential balance movement — an overflow or a division edge case must fall
     * back to a defined value (0 for `fill`, the untouched `orderAmount` for `residual`), never
     * silently corrupt state. For the common case of exactly one order per side (this contract's
     * own unit tests: buy > sell / sell > buy / buy == sell), `orderAmount == sideSum` exactly,
     * so `fill` reduces to `matched` with no rounding loss; for N > 1 orders per side, integer
     * division may leave a small dust remainder inside this contract's own cUSDC balance —
     * documented, not swept, in this phase.
     */
    function _computeFill(
        euint256 orderAmount,
        euint256 matched,
        euint256 sideSum
    ) private returns (euint256 fill, euint256 residual) {
        (ebool mulOk, euint256 numerator) = Nox.safeMul(orderAmount, matched);
        numerator = Nox.select(mulOk, numerator, Nox.toEuint256(0));

        (ebool divOk, euint256 rawFill) = Nox.safeDiv(numerator, sideSum);
        fill = Nox.select(divOk, rawFill, Nox.toEuint256(0));

        (ebool subOk, euint256 rawResidual) = Nox.safeSub(orderAmount, fill);
        residual = Nox.select(subOk, rawResidual, orderAmount);
    }

    /**
     * @dev Phase 4: real execution-price read, replacing the Phase-2/3 placeholder constant.
     * `priceOracle.getReferencePrice()` is a `view` call against `UniswapV3PriceReader.sol`,
     * which itself only ever reads (never writes) a live, verified Uniswap V3 pool on Ethereum
     * Sepolia — see `UniswapV3PriceReader.sol`'s contract-level docstring for the research that
     * confirmed real liquidity on that pool, and for why spot price (not TWAP) was chosen.
     *
     * FRICTION (identical to the Phase-2/3 placeholder's, confirmed to also apply here — see
     * this contract's top-level docstring, "Phase 4" bullet — by reading `nox-protocol-contracts`'
     * `ACL.sol`/`Nox.sol`): a bare `Nox.toEuint256(price)` is always a "public handle" (`toEuint256`
     * unconditionally routes through `wrapAsPublicHandle`, deterministic purely as a function of
     * the value — it does not matter that `price` was just computed from a live oracle call this
     * same transaction, rather than being a compile-time constant). Calling
     * `Nox.allowPublicDecryption` on an ALREADY-public handle REVERTS with
     * `PublicHandleACLForbidden` (`ACL.sol`'s `notPublicHandle` modifier). Routing the value
     * through one `Nox.add` first produces a genuine "fresh" (non-canonical-public) result
     * handle that `allowPublicDecryption` accepts — same workaround shape as before, now
     * confirmed against a real, dynamic, oracle-sourced value instead of a hardcoded constant.
     */
    function _executionPriceHandle() private returns (euint256) {
        uint256 price = priceOracle.getReferencePrice();
        return Nox.add(Nox.toEuint256(price), Nox.toEuint256(0));
    }
}
