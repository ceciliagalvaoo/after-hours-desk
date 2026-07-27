import { useState } from "react";
import { parseEventLogs } from "viem";
import type { Handle } from "@iexec-nox/handle";
import { useWallet } from "../../state/WalletContext";
import { useAppState } from "../../state/AppStateContext";
import { useFx } from "../../state/FxContext";
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

const OPERATOR_WINDOW_SECONDS = 15 * 60;

const card: React.CSSProperties = { display: "flex", flexDirection: "column" };
const headRow: React.CSSProperties = { padding: "15px 18px", borderBottom: "1px solid var(--bs)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 };
const h2: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 400, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx)" };
const metaLabel: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ft)" };
const smallGhost: React.CSSProperties = { fontSize: 12.5, padding: "6px 11px" };
const err: React.CSSProperties = { color: "var(--dg)", fontSize: 12.5, margin: 0 };

export function OrderTicketPanel() {
  const { account, walletClient, chainId } = useWallet();
  const appState = useAppState();
  const fx = useFx();
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
  const [settleError, setSettleError] = useState<string | null>(null);
  const [matchBanner, setMatchBanner] = useState<{ batchId: bigint; txHash: `0x${string}` } | null>(null);

  async function handleAuthorizeOperator() {
    if (!walletClient || !account) return;
    setFormError(null);
    setIsBusy(true);
    try {
      assertConnectedToSepolia(chainId);
      const until = BigInt(Math.floor(Date.now() / 1000) + OPERATOR_WINDOW_SECONDS);
      appState.enterOrderFlow("Authorizing desk as cUSDC operator (15 min window)…");
      const hash = await walletClient.writeContract({
        address: deployments.confidentialUSDC, abi: CONFIDENTIAL_USDC_ABI, functionName: "setOperator",
        args: [deployments.afterHoursDesk, until], chain: walletClient.chain, account: walletClient.account!,
      });
      appState.enterOrderFlow(`Operator tx sent: ${hash.slice(0, 14)}…`);
      await getPublicClient().waitForTransactionReceipt({ hash });
      await operator.refresh();
      appState.exitToReady(`Operator authorized until ${new Date(Number(until) * 1000).toLocaleTimeString()}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
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
    if (amount <= 0n) return setFormError("Amount must be greater than zero.");
    if (isBuy && !operator.isOperator) return setFormError("Authorize the desk as a cUSDC operator before submitting a buy order.");

    setIsBusy(true);
    try {
      assertConnectedToSepolia(chainId);
      appState.enterOrderFlow("Encrypting order size in the browser…");
      const { handle, handleProof } = await handleClient.encryptInput(amount, "uint256", deployments.afterHoursDesk);
      appState.enterOrderFlow(`Submitting order · handle ${shortHandle(handle)}…`);
      const hash = await walletClient.writeContract({
        address: deployments.afterHoursDesk, abi: AFTER_HOURS_DESK_ABI, functionName: "submitOrder",
        args: [isBuy, handle, handleProof], chain: walletClient.chain, account: walletClient.account!,
      });
      appState.enterOrderFlow(`Order tx sent: ${hash.slice(0, 14)}…`);
      const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
      const decoded = parseEventLogs({ abi: AFTER_HOURS_DESK_ABI, eventName: "OrderSubmitted", logs: receipt.logs }) as unknown as { args: { orderId: bigint; batchId: bigint } }[];
      const orderId = decoded[0]?.args.orderId;
      const batchId = decoded[0]?.args.batchId;
      if (orderId !== undefined && batchId !== undefined) {
        myOrders.addOptimisticOrder({ orderId, isBuy, batchId, submittedAt: Math.floor(Date.now() / 1000), settled: false });
        appState.exitToReady(`Order #${orderId.toString()} submitted (tx ${hash.slice(0, 10)}…)`);
      } else {
        appState.exitToReady(`Order submitted (tx ${hash.slice(0, 10)}…)`);
      }
      setAmountInput("");
      fx.show("smirk", "Sent dark", "Nobody saw a number.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
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
        address: deployments.afterHoursDesk, abi: AFTER_HOURS_DESK_ABI, functionName: "settleBatch",
        args: [], chain: walletClient.chain, account: walletClient.account!,
      });
      appState.enterOrderFlow(`Settlement tx sent: ${hash.slice(0, 14)}…`);
      const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
      const decoded = parseEventLogs({ abi: AFTER_HOURS_DESK_ABI, eventName: "BatchSettled", logs: receipt.logs });
      const settled = decoded[0]?.args as { batchId: bigint } | undefined;
      if (settled) {
        setMatchBanner({ batchId: settled.batchId, txHash: hash });
        appState.exitToReady(`MATCH FILLED — batch ${settled.batchId.toString()} (tx ${hash.slice(0, 10)}…)`);
        fx.show("money", "Batch closed", "Matched. Public. And you still don’t know the size.");
      } else {
        appState.exitToReady(`Settlement tx mined (${hash.slice(0, 10)}…)`);
      }
      await myOrders.refresh();
    } catch (e) {
      setSettleError(e instanceof Error ? e.message : String(e));
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
  const faucetBusy = faucet.step !== "idle" && faucet.step !== "done" && faucet.step !== "error";

  return (
    <section data-tour="ticket" className="noir-card" style={card}>
      <div style={headRow}>
        <h2 style={h2}>Order ticket</h2>
        <span style={metaLabel}>encrypted client-side</span>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Balance */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 13px", border: "1px solid transparent", borderRadius: 8, background: "var(--rz)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dm)" }}>Confidential cUSDC balance</span>
          {balance.decryptedValue !== null ? (
            <span title="Told you it was real." style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: "var(--ph)", fontVariantNumeric: "tabular-nums" }}>${formatUsdc(balance.decryptedValue)}</span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <span title="Real handle underneath. Go on, try." className="noir-censor" style={{ fontSize: 11.5 }}>{balance.handle && !isNullHandle(balance.handle) ? shortHandle(balance.handle) : "██████"}</span>
              <button type="button" className="noir-ghost" style={smallGhost} disabled={!balance.handle || isNullHandle(balance.handle) || balance.isDecrypting} onClick={() => void balance.decryptBalance()}>
                {balance.isDecrypting ? (balance.decryptProgress ? `Computing… (${balance.decryptProgress.attempt}/${balance.decryptProgress.maxAttempts})` : "Decrypting…") : "Decrypt"}
              </button>
            </span>
          )}
        </div>
        {balance.decryptError && <p style={err}>{balance.decryptError}</p>}

        {/* Faucet + wrap */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "11px 13px", border: "1px dashed var(--bd)", borderRadius: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--ft)", lineHeight: 1.4 }}>New wallet? Get real testnet cUSDC — faucet + wrap, chained automatically.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="noir-mono" value={faucetAmountInput} onChange={(e) => setFaucetAmountInput(e.target.value)} inputMode="decimal" disabled={faucetBusy} style={{ width: 96, padding: "8px 10px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", fontSize: 14 }} />
            <button type="button" className="noir-ghost" disabled={!account || faucetBusy} onClick={() => void handleFaucetAndWrap()}>
              {faucet.step === "faucet" ? "1/3 Fauceting…" : faucet.step === "approve" ? "2/3 Approving…" : faucet.step === "wrap" ? "3/3 Wrapping…" : "Get testnet cUSDC"}
            </button>
          </div>
          {faucet.step === "done" && <p style={{ color: "var(--ph)", fontSize: 12, margin: 0 }}>Done — {faucetAmountInput} wrapped into real cUSDC. Click "Decrypt" above.</p>}
          {faucet.error && <p style={err}>{faucet.error}</p>}
        </div>

        {/* Buy / Sell */}
        <div data-tour="side" style={{ display: "flex", gap: 10 }}>
          {([["buy", isBuy, "var(--ph)"], ["sell", !isBuy, "var(--am)"]] as const).map(([side, active, color]) => (
            <div key={side} style={{ position: "relative", flex: 1 }}>
              <button type="button" onClick={() => setIsBuy(side === "buy")} style={{ width: "100%", padding: 11, borderRadius: 10, border: "1px solid transparent", background: "linear-gradient(150deg,rgba(255,255,255,.08),rgba(255,255,255,.02))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.1)", color: active ? "var(--tx)" : "var(--dm)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".1em", textTransform: "uppercase", fontSize: 12, cursor: "pointer" }}>{side}</button>
              {active && <div style={{ position: "absolute", left: "24%", right: "24%", bottom: 6, height: 2, borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}`, pointerEvents: "none" }} />}
            </div>
          ))}
        </div>

        {/* Amount */}
        <div>
          <label style={{ display: "block", fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dm)", marginBottom: 8 }}>Amount · USDC</label>
          <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} inputMode="decimal" placeholder="0.00" style={{ width: "100%", padding: "13px 14px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontVariantNumeric: "tabular-nums" }} />
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--ft)" }}>Encrypted before it leaves your browser. Not even we see the number.</p>
        </div>

        {formError && <p style={err}>{formError}</p>}

        {needsAuthorization ? (
          <button type="button" className="noir-primary" style={{ width: "100%", padding: 14 }} disabled={isBusy || operator.isLoading} onClick={() => void handleAuthorizeOperator()}>{isBusy ? "Authorizing…" : "Authorize desk (15 min window)"}</button>
        ) : (
          <button type="button" className="noir-primary" style={{ width: "100%", padding: 14 }} disabled={isBusy || !handleClient} onClick={() => void handleSubmit()}>{isBusy ? "Submitting…" : "Send it dark"}</button>
        )}

        <div style={{ borderTop: "1px solid var(--bs)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dm)", maxWidth: "20ch", lineHeight: 1.4 }}>Settlement is permissionless</span>
          <button type="button" className="noir-ghost" style={{ fontSize: 12.5, padding: "9px 13px" }} disabled={isBusy} onClick={() => void handleSettleBatch()}>Close the batch</button>
        </div>
        {settleError && <p style={err}>{settleError}</p>}

        {matchBanner && (
          <div style={{ padding: "13px 15px", borderRadius: 8, border: "1px solid var(--ak)", background: "rgba(245,197,24,.08)", animation: "ahd-rise .4s ease both" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: "var(--ak)", letterSpacing: ".04em" }}>MATCH FILLED · batch {matchBanner.batchId.toString()} · tx {matchBanner.txHash.slice(0, 10)}…</span>
            <span style={{ display: "block", marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: "var(--dm)" }}>Matched. Public. And you still don’t know the size. Fills compute off-chain — decrypt below retries until ready.</span>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--bs)" }} />

        <span style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dm)" }}>Your orders</span>
        {myOrders.error && <p style={err}>{myOrders.error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
          {myOrders.orders.length === 0 && !myOrders.isLoading && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--ft)" }}>No orders from this account yet.</span>
          )}
          {myOrders.orders.map((o) => <MyOrderRow key={o.orderId.toString()} order={o} />)}
        </div>
      </div>
    </section>
  );
}

function MyOrderRow({ order }: { order: MyOrder }) {
  const { handleClient } = useHandleClient();
  const fx = useFx();
  const [fillHandle, setFillHandle] = useState<`0x${string}` | null>(null);
  const [isFetchingHandle, setIsFetchingHandle] = useState(false);
  const [decryptedFill, setDecryptedFill] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [progress, setProgress] = useState<RetryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureFillHandle() {
    if (fillHandle || isFetchingHandle) return fillHandle;
    setIsFetchingHandle(true);
    try {
      const handle = (await getPublicClient().readContract({ address: deployments.afterHoursDesk, abi: AFTER_HOURS_DESK_ABI, functionName: "getOrderFillHandle", args: [order.orderId] })) as `0x${string}`;
      setFillHandle(handle);
      return handle;
    } finally {
      setIsFetchingHandle(false);
    }
  }

  async function handleDecryptFill() {
    if (!handleClient) return setError("Connect a wallet on Sepolia first.");
    setError(null);
    setIsDecrypting(true);
    setProgress(null);
    try {
      const handle = (await ensureFillHandle()) ?? fillHandle;
      if (!handle || isNullHandle(handle)) {
        setError("This order has not settled yet — no fill handle exists.");
        return;
      }
      const { value } = await decryptWithRetry(() => handleClient.decrypt(handle as Handle<"uint256">), { onProgress: setProgress });
      setDecryptedFill(value as bigint);
      fx.show("smile", "Told you it was real.", "Your fill, your key. Decrypted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsDecrypting(false);
      setProgress(null);
    }
  }

  const sideColor = order.isBuy ? "var(--ph)" : "var(--am)";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid transparent", borderRadius: 8, flexWrap: "wrap" }}>
      <span style={{ display: "flex", gap: 9, alignItems: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "var(--dm)" }}>
        <span style={{ color: "var(--tx)" }}>#{order.orderId.toString()}</span>
        <span style={{ color: sideColor }}>{order.isBuy ? "BUY" : "SELL"}</span>
        <span>batch {order.batchId.toString()}</span>
      </span>
      {order.settled ? (
        decryptedFill !== null ? (
          <span title="Told you it was real." style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "var(--ph)", fontVariantNumeric: "tabular-nums" }}>${formatUsdc(decryptedFill)}</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <span title="Real handle underneath. Go on, try." className="noir-censor">{fillHandle && !isNullHandle(fillHandle) ? shortHandle(fillHandle) : "██████"}</span>
            <button type="button" className="noir-ghost" style={{ fontSize: 12, padding: "5px 10px" }} disabled={isDecrypting || isFetchingHandle} onClick={() => void handleDecryptFill()}>
              {isDecrypting ? (progress ? `Computing… (${progress.attempt}/${progress.maxAttempts})` : "Decrypting…") : "Unlock my number"}
            </button>
          </span>
        )
      ) : (
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--ft)" }}>awaiting settlement</span>
      )}
      {error && <span style={{ color: "var(--dg)", fontSize: 11.5, width: "100%" }}>{error}</span>}
    </div>
  );
}
