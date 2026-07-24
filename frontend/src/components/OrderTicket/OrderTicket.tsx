import { useState } from "react";
import { parseEventLogs } from "viem";
import type { Handle } from "@iexec-nox/handle";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "../../state/WalletContext";
import { useAppState } from "../../state/AppStateContext";
import { useHandleClient } from "../../hooks/useHandleClient";
import { useOperatorStatus } from "../../hooks/useOperatorStatus";
import { useMyOrders, type MyOrder } from "../../hooks/useMyOrders";
import { useCUsdcBalances } from "../../hooks/useCUsdcBalances";
import { useFaucetAndWrap } from "../../hooks/useFaucetAndWrap";
import { getPublicClient } from "../../lib/viemClients";
import { assertConnectedToSepolia } from "../../lib/assertChain";
import { decryptWithRetry, type RetryProgress } from "../../lib/retry";
import { deployments, AFTER_HOURS_DESK_ABI, CONFIDENTIAL_USDC_ABI } from "../../config/contracts";
import { parseUsdc, formatUsdc, shortHandle, isNullHandle } from "../../lib/format";
import { RedactedValue } from "../common/RedactedValue";
import styles from "./OrderTicket.module.css";

/** Operator windows are deliberately short — per hackathon-watchdog review: "operators have no
 * per-amount cap... prefer short, per-batch operator windows set right before settlement", NOT
 * the naive 24h/far-future expiry a first draft might reach for. See feedback.md, Fase 5. */
const OPERATOR_WINDOW_SECONDS = 15 * 60;

export function OrderTicket() {
  const { account, walletClient, chainId } = useWallet();
  const appState = useAppState();
  const { handleClient } = useHandleClient();
  const operator = useOperatorStatus();
  const myOrders = useMyOrders();
  const balance = useCUsdcBalances();
  const faucet = useFaucetAndWrap();

  const [isBuy, setIsBuy] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [faucetAmountInput, setFaucetAmountInput] = useState("100");
  const [formError, setFormError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [matchBanner, setMatchBanner] = useState<{
    batchId: bigint;
    buyOrderCount: bigint;
    sellOrderCount: bigint;
    txHash: `0x${string}`;
  } | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  async function handleAuthorizeOperator() {
    if (!walletClient || !account) return;
    setFormError(null);
    setIsBusy(true);
    try {
      assertConnectedToSepolia(chainId);
      const until = BigInt(Math.floor(Date.now() / 1000) + OPERATOR_WINDOW_SECONDS);
      appState.enterOrderFlow("Authorizing desk as cUSDC operator (15 min window)…");
      const hash = await walletClient.writeContract({
        address: deployments.confidentialUSDC,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "setOperator",
        args: [deployments.afterHoursDesk, until],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      appState.enterOrderFlow(`Operator tx sent: ${hash.slice(0, 14)}…`);
      await getPublicClient().waitForTransactionReceipt({ hash });
      await operator.refresh();
      appState.exitToReady(`Operator authorized until ${new Date(Number(until) * 1000).toLocaleTimeString()}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      appState.exitToReady("Operator authorization failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSubmit() {
    if (!walletClient || !account || !handleClient) {
      setFormError("Connect a wallet on Sepolia first.");
      return;
    }
    setFormError(null);
    let amount: bigint;
    try {
      amount = parseUsdc(amountInput || "0");
    } catch {
      setFormError("Enter a valid decimal amount (e.g. 12.5).");
      return;
    }
    if (amount <= 0n) {
      setFormError("Amount must be greater than zero.");
      return;
    }
    if (isBuy && !operator.isOperator) {
      setFormError("Authorize the desk as a cUSDC operator before submitting a buy order.");
      return;
    }

    setIsBusy(true);
    try {
      assertConnectedToSepolia(chainId);

      // 1. Encrypt BEFORE sending anything — the plaintext `amount` never leaves the browser as
      // a raw tx argument, only the resulting {handle, handleProof} pair does.
      appState.enterOrderFlow("Encrypting order size in the browser…");
      const { handle, handleProof } = await handleClient.encryptInput(
        amount,
        "uint256",
        deployments.afterHoursDesk,
      );

      appState.enterOrderFlow(`Submitting order · handle ${shortHandle(handle)}…`);
      const hash = await walletClient.writeContract({
        address: deployments.afterHoursDesk,
        abi: AFTER_HOURS_DESK_ABI,
        functionName: "submitOrder",
        args: [isBuy, handle, handleProof],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      appState.enterOrderFlow(`Order tx sent: ${hash.slice(0, 14)}…`);

      const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
      // `AFTER_HOURS_DESK_ABI` is typed as the broad `Abi` (see `config/contracts.ts`), so viem
      // can't infer `args`' shape from `eventName` alone — narrowed here against the compiled
      // artifact's own `OrderSubmitted` signature (checked directly against the ABI JSON, not
      // assumed), same pattern as `lib/eventLogs.ts`'s `DecodedLog<TArgs>`.
      const decoded = parseEventLogs({
        abi: AFTER_HOURS_DESK_ABI,
        eventName: "OrderSubmitted",
        logs: receipt.logs,
      }) as unknown as { args: { orderId: bigint; batchId: bigint } }[];
      const orderId = decoded[0]?.args.orderId;
      const batchId = decoded[0]?.args.batchId;

      if (orderId !== undefined && batchId !== undefined) {
        const optimistic: MyOrder = {
          orderId,
          isBuy,
          batchId,
          submittedAt: Math.floor(Date.now() / 1000),
          settled: false,
        };
        myOrders.addOptimisticOrder(optimistic);
        appState.exitToReady(`Order #${orderId.toString()} submitted (tx ${hash.slice(0, 10)}…)`);
      } else {
        appState.exitToReady(`Order submitted (tx ${hash.slice(0, 10)}…)`);
      }
      setAmountInput("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      appState.exitToReady("Order submission failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSettleBatch() {
    if (!walletClient || !account) return;
    setSettleError(null);
    setIsBusy(true);
    try {
      assertConnectedToSepolia(chainId);
      appState.enterOrderFlow("Requesting settleBatch() — TEE netting match in flight…");
      const hash = await walletClient.writeContract({
        address: deployments.afterHoursDesk,
        abi: AFTER_HOURS_DESK_ABI,
        functionName: "settleBatch",
        args: [],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      appState.enterOrderFlow(`Settlement tx sent: ${hash.slice(0, 14)}…`);
      const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
      const decoded = parseEventLogs({
        abi: AFTER_HOURS_DESK_ABI,
        eventName: "BatchSettled",
        logs: receipt.logs,
      });
      const settled = decoded[0]?.args as
        | { batchId: bigint; buyOrderCount: bigint; sellOrderCount: bigint }
        | undefined;
      if (settled) {
        setMatchBanner({ ...settled, txHash: hash });
        appState.exitToReady(`MATCH FILLED — batch ${settled.batchId.toString()} (tx ${hash.slice(0, 10)}…)`);
        setTimeout(() => setMatchBanner(null), 12_000);
      } else {
        appState.exitToReady(`Settlement tx mined (${hash.slice(0, 10)}…)`);
      }
      await myOrders.refresh();
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : String(err));
      appState.exitToReady("Settlement failed or batch not ready");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFaucetAndWrap() {
    let amount: bigint;
    try {
      amount = parseUsdc(faucetAmountInput || "0");
    } catch {
      return;
    }
    if (amount <= 0n) return;
    await faucet.faucetAndWrap(amount);
    await balance.refreshHandle();
  }

  const needsAuthorization = isBuy && !operator.isOperator;

  return (
    <section className={`${styles.panel} ahd-panel`}>
      <div className={styles.head}>
        <h2>Order ticket</h2>
      </div>
      <div className={styles.body}>
        <div className={styles.balanceRow}>
          <span className={styles.balanceLabel}>Your confidential cUSDC balance</span>
          <RedactedValue
            revealed={balance.decryptedValue !== null}
            revealedText={balance.decryptedValue !== null ? `$${formatUsdc(balance.decryptedValue)}` : ""}
            underlyingHandleText={balance.handle ? shortHandle(balance.handle) : "…"}
          />
          <button
            type="button"
            className="ahd-btn ahd-btn--ghost"
            disabled={!balance.handle || isNullHandle(balance.handle) || balance.isDecrypting}
            onClick={() => void balance.decryptBalance()}
          >
            {balance.isDecrypting
              ? balance.decryptProgress
                ? `Computing off-chain… (${balance.decryptProgress.attempt}/${balance.decryptProgress.maxAttempts})`
                : "Decrypting…"
              : "Decrypt"}
          </button>
        </div>
        {balance.decryptError && <p className={styles.error}>{balance.decryptError}</p>}

        <div className={styles.faucetRow}>
          <span className={styles.faucetLabel}>
            New wallet? Get real testnet cUSDC — faucet + wrap, chained automatically
          </span>
          <div className={styles.faucetControls}>
            <input
              className={`${styles.faucetInput} mono`}
              inputMode="decimal"
              value={faucetAmountInput}
              onChange={(e) => setFaucetAmountInput(e.target.value)}
              disabled={faucet.step !== "idle" && faucet.step !== "done" && faucet.step !== "error"}
            />
            <button
              type="button"
              className="ahd-btn ahd-btn--ghost"
              disabled={
                !account ||
                (faucet.step !== "idle" && faucet.step !== "done" && faucet.step !== "error")
              }
              onClick={() => void handleFaucetAndWrap()}
            >
              {faucet.step === "faucet" && "1/3 Fauceting mUSDC…"}
              {faucet.step === "approve" && "2/3 Approving cUSDC…"}
              {faucet.step === "wrap" && "3/3 Wrapping…"}
              {(faucet.step === "idle" || faucet.step === "done" || faucet.step === "error") &&
                "Get testnet cUSDC"}
            </button>
          </div>
          {faucet.step === "done" && (
            <p className={styles.faucetSuccess}>
              Done — {faucetAmountInput} mUSDC fauceted, approved, and wrapped into real
              confidential cUSDC. Click "Decrypt" above to see it.
            </p>
          )}
          {faucet.error && <p className={styles.error}>{faucet.error}</p>}
        </div>

        <div className={styles.sideToggle}>
          <button
            type="button"
            className={`${styles.sideBtn} ${isBuy ? styles.sideBtnActiveBuy : ""}`}
            onClick={() => setIsBuy(true)}
          >
            Buy
          </button>
          <button
            type="button"
            className={`${styles.sideBtn} ${!isBuy ? styles.sideBtnActiveSell : ""}`}
            onClick={() => setIsBuy(false)}
          >
            Sell
          </button>
        </div>

        <div className={styles.inputRow}>
          <label htmlFor="ahd-amount">Amount (USDC, 6 decimals)</label>
          <input
            id="ahd-amount"
            className={`${styles.input} mono`}
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
          <p className={styles.hint}>
            Encrypted client-side via <code>encryptInput</code> before anything is sent — the
            transaction only ever carries a {"{handle, handleProof}"} pair, never this plaintext
            number.
          </p>
        </div>

        {formError && <p className={styles.error}>{formError}</p>}

        <div className={styles.actions}>
          {needsAuthorization ? (
            <button
              type="button"
              className="ahd-btn ahd-btn--primary"
              disabled={isBusy || operator.isLoading}
              onClick={() => void handleAuthorizeOperator()}
            >
              {isBusy ? "Authorizing…" : "Authorize desk (15 min window)"}
            </button>
          ) : (
            <button
              type="button"
              className="ahd-btn ahd-btn--primary"
              disabled={isBusy || !handleClient}
              onClick={() => void handleSubmit()}
            >
              {isBusy ? "Submitting…" : "Submit encrypted order"}
            </button>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.settleRow}>
          <span className={styles.ordersHead}>Anyone can trigger settlement once both sides exist</span>
          <button
            type="button"
            className="ahd-btn ahd-btn--ghost"
            disabled={isBusy}
            onClick={() => void handleSettleBatch()}
          >
            Attempt settleBatch()
          </button>
        </div>
        {settleError && <p className={styles.error}>{settleError}</p>}

        <AnimatePresence>
          {matchBanner && (
            <motion.div
              className={styles.matchBanner}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              MATCH FILLED — batch {matchBanner.batchId.toString()} ({matchBanner.buyOrderCount.toString()}{" "}
              buy / {matchBanner.sellOrderCount.toString()} sell) · tx {matchBanner.txHash.slice(0, 10)}…
              <br />
              <span className={styles.matchBannerSub}>
                Settled on-chain — fills are computing off-chain (single TEE Runner, ~seconds to
                tens of seconds for this batch size). "Decrypt my fill" below will retry
                automatically until it's ready.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.divider} />

        <span className={styles.ordersHead}>Your orders</span>
        {myOrders.error && <p className={styles.error}>{myOrders.error}</p>}
        <ul className={styles.ordersList}>
          {myOrders.orders.length === 0 && !myOrders.isLoading && (
            <li className={styles.orderMeta}>No orders submitted from this account yet.</li>
          )}
          {myOrders.orders.map((order) => (
            <MyOrderRow key={order.orderId.toString()} order={order} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function MyOrderRow({ order }: { order: MyOrder }) {
  const { handleClient } = useHandleClient();
  const [fillHandle, setFillHandle] = useState<`0x${string}` | null>(null);
  const [isFetchingHandle, setIsFetchingHandle] = useState(false);
  const [decryptedFill, setDecryptedFill] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptProgress, setDecryptProgress] = useState<RetryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureFillHandle() {
    if (fillHandle || isFetchingHandle) return fillHandle;
    setIsFetchingHandle(true);
    try {
      const handle = (await getPublicClient().readContract({
        address: deployments.afterHoursDesk,
        abi: AFTER_HOURS_DESK_ABI,
        functionName: "getOrderFillHandle",
        args: [order.orderId],
      })) as `0x${string}`;
      setFillHandle(handle);
      return handle;
    } finally {
      setIsFetchingHandle(false);
    }
  }

  async function handleDecryptFill() {
    if (!handleClient) {
      setError("Connect a wallet on Sepolia first.");
      return;
    }
    setError(null);
    setIsDecrypting(true);
    setDecryptProgress(null);
    try {
      const handle = (await ensureFillHandle()) ?? fillHandle;
      if (!handle || isNullHandle(handle)) {
        setError("This order has not settled yet — no fill handle exists.");
        return;
      }
      // Retried — right after "MATCH FILLED", the fill's ciphertext is very likely still being
      // computed off-chain (single-Runner async latency chains ~10-12+ primitives even for the
      // simplest 1-buy/1-sell batch — see lib/retry.ts and feedback.md, Fase 5 watchdog review).
      const { value } = await decryptWithRetry(
        () => handleClient.decrypt(handle as Handle<"uint256">),
        { onProgress: setDecryptProgress },
      );
      setDecryptedFill(value as bigint);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDecrypting(false);
      setDecryptProgress(null);
    }
  }

  return (
    <li className={styles.orderRow}>
      <span className={styles.orderMeta}>
        <span className={order.isBuy ? "" : ""}>#{order.orderId.toString()}</span>
        <span>{order.isBuy ? "BUY" : "SELL"}</span>
        <span>batch {order.batchId.toString()}</span>
        <span>{order.settled ? "settled" : "open"}</span>
      </span>
      {order.settled ? (
        <>
          <RedactedValue
            revealed={decryptedFill !== null}
            revealedText={decryptedFill !== null ? `$${formatUsdc(decryptedFill)}` : ""}
            underlyingHandleText={fillHandle ? shortHandle(fillHandle) : "fill"}
          />
          <button
            type="button"
            className="ahd-btn ahd-btn--ghost"
            disabled={isDecrypting || isFetchingHandle}
            onClick={() => void handleDecryptFill()}
          >
            {isDecrypting
              ? decryptProgress
                ? `Computing off-chain… (${decryptProgress.attempt}/${decryptProgress.maxAttempts})`
                : "Decrypting…"
              : "Decrypt my fill"}
          </button>
        </>
      ) : (
        <span className={styles.orderMeta}>awaiting settlement</span>
      )}
      {error && <span className={styles.error}>{error}</span>}
    </li>
  );
}
