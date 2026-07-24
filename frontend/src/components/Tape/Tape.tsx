import { useEffect, useState } from "react";
import type { Handle } from "@iexec-nox/handle";
import { useDeskEvents, type DeskTapeEvent } from "../../hooks/useDeskEvents";
import { useHandleClient } from "../../hooks/useHandleClient";
import { getPublicClient } from "../../lib/viemClients";
import { decryptWithRetry, type RetryProgress } from "../../lib/retry";
import { deployments, AFTER_HOURS_DESK_ABI } from "../../config/contracts";
import { formatUsdc, formatTimestamp, shortAddress, shortHandle, isNullHandle } from "../../lib/format";
import { RedactedValue } from "../common/RedactedValue";
import styles from "./Tape.module.css";

/**
 * The public tape/ticker. Every row is a real on-chain event (`useDeskEvents`) — nothing here is
 * synthesized. Order/match sizes are ALWAYS rendered redacted (`███`) on this public view (per
 * the aesthetic spec — the Auditor Panel is the only place a `███` ever flips to a real number),
 * but the bar always sits on top of a real handle this component actually fetched via
 * `getOrderHandle`/`getBatchMatchedAmountHandle` — never a placeholder for data never fetched.
 */
export function Tape() {
  const { events, isLoading, error } = useDeskEvents();
  const [orderHandles, setOrderHandles] = useState<Map<string, `0x${string}`>>(new Map());
  const [matchHandles, setMatchHandles] = useState<Map<string, `0x${string}`>>(new Map());
  const [priceHandles, setPriceHandles] = useState<Map<string, `0x${string}`>>(new Map());

  useEffect(() => {
    const client = getPublicClient();

    const missingOrders = events
      .filter((e): e is Extract<DeskTapeEvent, { kind: "ORDER_SUBMITTED" }> => e.kind === "ORDER_SUBMITTED")
      .filter((e) => !orderHandles.has(e.orderId.toString()));
    const missingBatches = events
      .filter((e): e is Extract<DeskTapeEvent, { kind: "BATCH_SETTLED" }> => e.kind === "BATCH_SETTLED")
      .filter((e) => !matchHandles.has(e.batchId.toString()));

    if (missingOrders.length > 0) {
      void Promise.all(
        missingOrders.map(async (e) => {
          const handle = await client.readContract({
            address: deployments.afterHoursDesk,
            abi: AFTER_HOURS_DESK_ABI,
            functionName: "getOrderHandle",
            args: [e.orderId],
          });
          return [e.orderId.toString(), handle as `0x${string}`] as const;
        }),
      ).then((entries) => {
        setOrderHandles((prev) => {
          const next = new Map(prev);
          for (const [id, handle] of entries) next.set(id, handle);
          return next;
        });
      });
    }

    if (missingBatches.length > 0) {
      void Promise.all(
        missingBatches.map(async (e) => {
          const [matchedHandle, priceHandle] = await Promise.all([
            client.readContract({
              address: deployments.afterHoursDesk,
              abi: AFTER_HOURS_DESK_ABI,
              functionName: "getBatchMatchedAmountHandle",
              args: [e.batchId],
            }),
            client.readContract({
              address: deployments.afterHoursDesk,
              abi: AFTER_HOURS_DESK_ABI,
              functionName: "getBatchExecutionPriceHandle",
              args: [e.batchId],
            }),
          ]);
          return [e.batchId.toString(), matchedHandle as `0x${string}`, priceHandle as `0x${string}`] as const;
        }),
      ).then((entries) => {
        setMatchHandles((prev) => {
          const next = new Map(prev);
          for (const [id, handle] of entries) next.set(id, handle);
          return next;
        });
        setPriceHandles((prev) => {
          const next = new Map(prev);
          for (const [id, , priceHandle] of entries) next.set(id, priceHandle);
          return next;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed maps checked manually above
  }, [events]);

  function renderRow(event: DeskTapeEvent) {
    const time = event.blockTimestamp ? formatTimestamp(event.blockTimestamp) : "pending…";

    if (event.kind === "ORDER_SUBMITTED") {
      const handle = orderHandles.get(event.orderId.toString());
      return (
        <li key={event.id} className={styles.row}>
          <span className={styles.time}>{time}</span>
          <span className={styles.desc}>
            <span className={event.isBuy ? styles.tagBuy : styles.tagSell}>
              {event.isBuy ? "BUY" : "SELL"}
            </span>
            order #{event.orderId.toString()} · {shortAddress(event.trader)} · batch{" "}
            {event.batchId.toString()}
          </span>
          <RedactedValue
            revealed={false}
            revealedText=""
            underlyingHandleText={handle ? shortHandle(handle) : "…"}
            title="Order size — confidential, redacted on the public tape"
          />
        </li>
      );
    }

    if (event.kind === "BATCH_OPENED") {
      return (
        <li key={event.id} className={styles.row}>
          <span className={styles.time}>{time}</span>
          <span className={styles.desc}>Batch {event.batchId.toString()} opened</span>
          <span />
        </li>
      );
    }

    if (event.kind === "BATCH_SETTLED") {
      const matchHandle = matchHandles.get(event.batchId.toString());
      const priceHandle = priceHandles.get(event.batchId.toString());
      return (
        <BatchSettledRow
          key={event.id}
          time={time}
          event={event}
          matchHandle={matchHandle}
          priceHandle={priceHandle}
        />
      );
    }

    // FILL_REGISTERED
    return (
      <li key={event.id} className={styles.row}>
        <span className={styles.time}>{time}</span>
        <span className={styles.desc}>Fill registered for compliance viewer</span>
        <RedactedValue
          revealed={false}
          revealedText=""
          underlyingHandleText={shortHandle(event.fillHandle)}
          title="Per-order fill — only the trader and the compliance viewer can ever decrypt this"
        />
      </li>
    );
  }

  return (
    <section className={`${styles.panel} ahd-panel`}>
      <div className={styles.head}>
        <h2>Tape</h2>
        <span className={styles.headMeta}>
          {isLoading ? "syncing…" : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {!error && events.length === 0 && !isLoading && (
        <p className={styles.empty}>No orders yet. Submit one from the ticket to see it here.</p>
      )}
      <ul className={`${styles.list} ahd-scrollbar`}>{events.map(renderRow)}</ul>
    </section>
  );
}

/**
 * The one place this app actually calls `publicDecrypt` (SDK integration step 5 in this app's
 * own frontend brief — "publicDecrypt only applies to handles explicitly marked publicly
 * decryptable, e.g. an aggregate execution price"). `matchedAmount`/`executionPriceHandle` are
 * the ONLY two handles `AfterHoursDesk.settleBatch()` ever marks publicly decryptable
 * (`Nox.allowPublicDecryption` — see the contract's own docstring); individual order/fill sizes
 * never are. Revealing them here is exactly the dark pool's core promise made visible: anyone —
 * not just a trader or the auditor — can prove the aggregate match happened and at what price,
 * while every individual size stays behind `███` forever. Requires SOME connected wallet only
 * because this app's `HandleClient` is always wallet-bound (see `useHandleClient`) — `publicDecrypt`
 * itself performs no ACL check and would work for any account.
 */
function BatchSettledRow({
  time,
  event,
  matchHandle,
  priceHandle,
}: {
  time: string;
  event: Extract<DeskTapeEvent, { kind: "BATCH_SETTLED" }>;
  matchHandle: `0x${string}` | undefined;
  priceHandle: `0x${string}` | undefined;
}) {
  const { handleClient } = useHandleClient();
  const [matched, setMatched] = useState<bigint | null>(null);
  const [price, setPrice] = useState<bigint | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [progress, setProgress] = useState<RetryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReveal() {
    if (!handleClient || !matchHandle || !priceHandle) return;
    setError(null);
    setIsRevealing(true);
    setProgress(null);
    try {
      // Retried — right after "MATCH FILLED", these aggregate handles are very likely still
      // computing off-chain (single-Runner async latency — see lib/retry.ts).
      const [matchedResult, priceResult] = await Promise.all([
        decryptWithRetry(() => handleClient.publicDecrypt(matchHandle as Handle<"uint256">), {
          onProgress: setProgress,
        }),
        decryptWithRetry(() => handleClient.publicDecrypt(priceHandle as Handle<"uint256">)),
      ]);
      setMatched(matchedResult.value as bigint);
      setPrice(priceResult.value as bigint);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRevealing(false);
      setProgress(null);
    }
  }

  const revealed = matched !== null;

  return (
    <li className={styles.row}>
      <span className={styles.time}>{time}</span>
      <span className={styles.desc}>
        <span className={styles.tagSettled}>MATCH FILLED</span> batch {event.batchId.toString()} ·{" "}
        {event.buyOrderCount.toString()} buy / {event.sellOrderCount.toString()} sell orders
        {revealed && (
          <span className={styles.revealedMeta}>
            {" "}
            · matched ${formatUsdc(matched)} @ ${formatUsdc(price ?? 0n)}/WETH
          </span>
        )}
      </span>
      <span className={styles.revealCell}>
        <RedactedValue
          revealed={false}
          revealedText=""
          underlyingHandleText={matchHandle && !isNullHandle(matchHandle) ? shortHandle(matchHandle) : "…"}
          title="Matched quantity + execution price — publicly decryptable (Nox.allowPublicDecryption); click Reveal to call publicDecrypt for real"
        />
        {!revealed && matchHandle && !isNullHandle(matchHandle) && (
          <button
            type="button"
            className="ahd-btn ahd-btn--ghost"
            disabled={!handleClient || isRevealing}
            onClick={() => void handleReveal()}
            title={!handleClient ? "Connect any wallet — publicDecrypt needs no special authorization" : undefined}
          >
            {isRevealing
              ? progress
                ? `Computing off-chain… (${progress.attempt}/${progress.maxAttempts})`
                : "Revealing…"
              : "Reveal (publicDecrypt)"}
          </button>
        )}
      </span>
      {error && <span className={styles.error}>{error}</span>}
    </li>
  );
}
