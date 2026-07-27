import { useEffect, useState } from "react";
import type { Handle } from "@iexec-nox/handle";
import { useDeskEvents, type DeskTapeEvent } from "../../hooks/useDeskEvents";
import { useHandleClient } from "../../hooks/useHandleClient";
import { getPublicClient } from "../../lib/viemClients";
import { decryptWithRetry, type RetryProgress } from "../../lib/retry";
import { deployments, AFTER_HOURS_DESK_ABI } from "../../config/contracts";
import { formatUsdc, formatTimestamp, shortAddress, shortHandle, isNullHandle } from "../../lib/format";

const rowStyle: React.CSSProperties = { display: "grid", gap: 14, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--bs)" };
const timeStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "var(--ft)" };
const descStyle: React.CSSProperties = { fontSize: 13, color: "var(--dm)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const tagStyle = (c: string): React.CSSProperties => ({ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".08em", color: c });
const censor = (title: string, text: string) => (
  <span title={title} className="noir-censor">{text}</span>
);

export function TapePanel() {
  const { events, isLoading, error } = useDeskEvents();
  const [orderHandles, setOrderHandles] = useState<Map<string, `0x${string}`>>(new Map());
  const [matchHandles, setMatchHandles] = useState<Map<string, `0x${string}`>>(new Map());
  const [priceHandles, setPriceHandles] = useState<Map<string, `0x${string}`>>(new Map());

  useEffect(() => {
    const client = getPublicClient();
    const missingOrders = events.filter((e): e is Extract<DeskTapeEvent, { kind: "ORDER_SUBMITTED" }> => e.kind === "ORDER_SUBMITTED").filter((e) => !orderHandles.has(e.orderId.toString()));
    const missingBatches = events.filter((e): e is Extract<DeskTapeEvent, { kind: "BATCH_SETTLED" }> => e.kind === "BATCH_SETTLED").filter((e) => !matchHandles.has(e.batchId.toString()));

    if (missingOrders.length > 0) {
      void Promise.all(missingOrders.map(async (e) => {
        const handle = await client.readContract({ address: deployments.afterHoursDesk, abi: AFTER_HOURS_DESK_ABI, functionName: "getOrderHandle", args: [e.orderId] });
        return [e.orderId.toString(), handle as `0x${string}`] as const;
      })).then((entries) => setOrderHandles((prev) => { const next = new Map(prev); for (const [id, h] of entries) next.set(id, h); return next; }));
    }
    if (missingBatches.length > 0) {
      void Promise.all(missingBatches.map(async (e) => {
        const [matchedHandle, priceHandle] = await Promise.all([
          client.readContract({ address: deployments.afterHoursDesk, abi: AFTER_HOURS_DESK_ABI, functionName: "getBatchMatchedAmountHandle", args: [e.batchId] }),
          client.readContract({ address: deployments.afterHoursDesk, abi: AFTER_HOURS_DESK_ABI, functionName: "getBatchExecutionPriceHandle", args: [e.batchId] }),
        ]);
        return [e.batchId.toString(), matchedHandle as `0x${string}`, priceHandle as `0x${string}`] as const;
      })).then((entries) => {
        setMatchHandles((prev) => { const next = new Map(prev); for (const [id, h] of entries) next.set(id, h); return next; });
        setPriceHandles((prev) => { const next = new Map(prev); for (const [id, , p] of entries) next.set(id, p); return next; });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  function renderRow(event: DeskTapeEvent) {
    const time = event.blockTimestamp ? formatTimestamp(event.blockTimestamp) : "pending…";
    if (event.kind === "ORDER_SUBMITTED") {
      const handle = orderHandles.get(event.orderId.toString());
      return (
        <div key={event.id} data-tape-row style={rowStyle}>
          <span style={timeStyle}>{time}</span>
          <span style={descStyle}><span style={tagStyle(event.isBuy ? "var(--ph)" : "var(--am)")}>{event.isBuy ? "BUY" : "SELL"}</span> order #{event.orderId.toString()} · {shortAddress(event.trader)} · batch {event.batchId.toString()}</span>
          {censor("Order amount. Confidential, redacted on the public tape.", handle ? shortHandle(handle) : "██████")}
        </div>
      );
    }
    if (event.kind === "BATCH_OPENED") {
      return (
        <div key={event.id} data-tape-row style={rowStyle}>
          <span style={timeStyle}>{time}</span>
          <span style={descStyle}>Batch {event.batchId.toString()} opened</span>
          <span />
        </div>
      );
    }
    if (event.kind === "BATCH_SETTLED") {
      return <BatchSettledRow key={event.id} time={time} event={event} matchHandle={matchHandles.get(event.batchId.toString())} priceHandle={priceHandles.get(event.batchId.toString())} />;
    }
    return (
      <div key={event.id} data-tape-row style={rowStyle}>
        <span style={timeStyle}>{time}</span>
        <span style={descStyle}>Fill registered for compliance viewer</span>
        {censor("Per-order fill. Only the trader and the compliance viewer can ever decrypt this.", shortHandle(event.fillHandle))}
      </div>
    );
  }

  return (
    <section data-tour="tape" className="noir-card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: "1px solid var(--bs)" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 400, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx)" }}>Tape</h2>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ft)" }}>{isLoading ? "syncing…" : `${events.length} event${events.length === 1 ? "" : "s"} · every figure a real secret`}</span>
      </div>
      {error && <p style={{ padding: "12px 18px", color: "var(--dg)", fontSize: 12.5, margin: 0 }}>{error}</p>}
      {!error && events.length === 0 && !isLoading && (
        <p style={{ padding: 32, textAlign: "center", color: "var(--ft)", fontSize: 13, margin: 0 }}>No orders yet. Send one from the ticket and watch it print, redacted.</p>
      )}
      <div style={{ padding: "6px 0", maxHeight: 560, overflowY: "auto" }} className="ahd-scrollbar">{events.map(renderRow)}</div>
    </section>
  );
}

function BatchSettledRow({ time, event, matchHandle, priceHandle }: {
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
      const [m, p] = await Promise.all([
        decryptWithRetry(() => handleClient.publicDecrypt(matchHandle as Handle<"uint256">), { onProgress: setProgress }),
        decryptWithRetry(() => handleClient.publicDecrypt(priceHandle as Handle<"uint256">)),
      ]);
      setMatched(m.value as bigint);
      setPrice(p.value as bigint);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRevealing(false);
      setProgress(null);
    }
  }

  const revealed = matched !== null;
  return (
    <div data-tape-row style={rowStyle}>
      <span style={timeStyle}>{time}</span>
      <span style={descStyle}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--ak)" }}>MATCH FILLED</span> batch {event.batchId.toString()} · {event.buyOrderCount.toString()} buy / {event.sellOrderCount.toString()} sell
        {revealed && <span style={{ color: "var(--ph)", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}> · matched ${formatUsdc(matched)} @ ${formatUsdc(price ?? 0n)}/WETH</span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
        {!revealed && censor("Matched quantity and execution price. Publicly decryptable · click to call publicDecrypt.", matchHandle && !isNullHandle(matchHandle) ? shortHandle(matchHandle) : "██████")}
        {!revealed && matchHandle && !isNullHandle(matchHandle) && (
          <button type="button" className="noir-ghost" style={{ fontSize: 12, padding: "5px 10px" }} disabled={!handleClient || isRevealing} onClick={() => void handleReveal()} title={!handleClient ? "Connect any wallet · publicDecrypt needs no special authorization" : undefined}>
            {isRevealing ? (progress ? `Computing… (${progress.attempt}/${progress.maxAttempts})` : "Revealing…") : "Prove it happened"}
          </button>
        )}
        {error && <span style={{ color: "var(--dg)", fontSize: 11.5 }}>{error}</span>}
      </span>
    </div>
  );
}
