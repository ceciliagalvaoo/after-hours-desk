import { useEffect, useRef } from "react";
import { useScreen } from "../state/ScreenContext";
import { useTour } from "../state/TourContext";
import { useWallet } from "../state/WalletContext";
import { useAppState } from "../state/AppStateContext";
import { useIdentity } from "../state/IdentityContext";
import { useFx } from "../state/FxContext";
import { useUniswapPrice } from "../hooks/useUniswapPrice";
import { deskGlow, deskLabel, toBrokerState } from "../lib/deskState";
import { formatUsdc, shortAddress } from "../lib/format";
import { BrokerCanvas, CROP_HEAD } from "../components/mascot/BrokerCanvas";
import { CandleChart } from "../components/mascot/CandleChart";
import { OrderTicketPanel } from "../components/desk/OrderTicketPanel";
import { TapePanel } from "../components/desk/TapePanel";
import { AuditorPanelNoir } from "../components/desk/AuditorPanelNoir";
import { NetworkBanner } from "../components/desk/NetworkBanner";
import { TourOverlay } from "../components/desk/TourOverlay";
import { FxOverlay } from "../components/desk/FxOverlay";
import { deployments } from "../config/contracts";

export function DeskScreen() {
  const { go } = useScreen();
  const tour = useTour();
  const { account, status, connect, disconnect } = useWallet();
  const { state, detail } = useAppState();
  const { look, identity } = useIdentity();
  const fx = useFx();
  const glow = deskGlow(state);
  const dotState = toBrokerState(state);

  // One-time welcome reaction on first entering the desk with a connected wallet.
  const welcomed = useRef(false);
  useEffect(() => {
    if (!welcomed.current && account && status === "connected") {
      welcomed.current = true;
      const t = window.setTimeout(() => fx.show("smile", "Desk knows you", "Nobody knows the figure."), 500);
      return () => window.clearTimeout(t);
    }
  }, [account, status, fx]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--tx)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "11px 24px", borderBottom: "1px solid var(--bd)", background: "var(--rz)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }} onClick={() => go("intro")}>
          <BrokerCanvas look={look} glow={glow} crop={CROP_HEAD} width={26} height={29} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15, letterSpacing: "-.01em", color: "var(--tx)" }}>After Hours Desk</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ft)" }}>Confidential dark pool · Nox · Sepolia</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="noir-ghost" style={{ fontSize: 13, padding: "8px 14px" }} onClick={tour.start}>What are we hiding?</button>
          <span onClick={() => go("identity")} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", border: "1px solid transparent", borderRadius: 999, background: "var(--pn2)", cursor: "pointer" }}>
            <BrokerCanvas look={look} glow={glow} crop={CROP_HEAD} width={20} height={22} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: ".1em", color: "var(--dm)" }}>{identity.alias || "BROKER"}</span>
          </span>
          {account ? (
            <span title={account} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "var(--dm)", padding: "7px 12px", border: "1px solid transparent", borderRadius: 999 }}>{shortAddress(account)}</span>
          ) : (
            <button type="button" className="noir-primary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => void connect()}>{status === "connecting" ? "Connecting…" : "Connect wallet"}</button>
          )}
          {account && <button type="button" className="noir-ghost" style={{ fontSize: 13, padding: "8px 14px" }} onClick={disconnect}>Disconnect</button>}
        </div>
      </div>

      {/* Precondition banner (real wallet state) */}
      <NetworkBanner />

      {/* Desk-state band */}
      <div style={{ borderBottom: "1px solid var(--bs)", background: "var(--plate)" }}>
        <div className="ahd-desk-band" style={{ maxWidth: 1400, margin: "0 auto", padding: "18px 24px", display: "grid", gap: 24, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--ft)" }}>The desk</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 19, color: "var(--tx)", letterSpacing: "-.01em" }}>It’s all here.</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--dm)" }}>The number isn’t.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <BrokerCanvas look={look} glow={glow} width={104} height={104} style={{ filter: "drop-shadow(0 8px 18px rgba(0,0,0,.6))" }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--dm)" }}>{deskLabel(state).toUpperCase()}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", textAlign: "right" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--ft)" }}>Desk state</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: glow, boxShadow: `0 0 8px ${glow}`, display: "block", ...(dotState === "loading" ? { animation: "ahd-dot 2s steps(1) infinite" } : null) }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 19, color: "var(--tx)", letterSpacing: "-.01em" }}>{deskLabel(state)}</span>
            </span>
            {detail && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--dm)", maxWidth: "32ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="ahd-desk-grid" style={{ maxWidth: 1400, margin: "0 auto", padding: 24, display: "grid", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <OrderTicketPanel />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <PricePanel />
          <DepthPanel />
          <TapePanel />
        </div>
      </div>

      {/* Auditor (full width) */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 32px" }}>
        <AuditorPanelNoir />
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--bs)", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "8px 24px", display: "flex", gap: 24, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".06em", color: "var(--ft)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><i style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ph)", boxShadow: "0 0 8px var(--ph)", display: "block", animation: "ahd-dot 2.4s steps(1) infinite" }} />ONLINE · ETHEREUM SEPOLIA · 11155111</span>
          <span>DESK {shortAddress(deployments.afterHoursDesk)} · COMPLIANCE VIEWER {shortAddress(deployments.complianceViewer)} · BUILT ON NOX</span>
        </div>
      </div>

      {/* Overlays */}
      <TourOverlay />
      <FxOverlay />
    </div>
  );
}

function PricePanel() {
  const { price, lastUpdated, error, isLoading } = useUniswapPrice();
  return (
    <div data-tour="price" className="noir-card">
      <div style={{ padding: "14px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--ph)" }}>This number is public on purpose. The ones that matter aren’t.</span>
          <span style={{ fontSize: 13, color: "var(--dm)" }}>Uniswap V3 · WETH / USDC · Sepolia</span>
        </div>
        {error ? (
          <span style={{ color: "var(--dg)", fontSize: 12.5 }}>Price read failed</span>
        ) : (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, color: "var(--ph)", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{isLoading && price === null ? "reading…" : price !== null ? `$${formatUsdc(price)}` : "—"}</span>
        )}
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "var(--ft)" }}>{lastUpdated ? `updated ${lastUpdated.toLocaleTimeString(undefined, { hour12: false })}` : "polling…"}</span>
      </div>
      <div style={{ padding: "8px 20px 16px" }}>
        <CandleChart />
      </div>
    </div>
  );
}

/** Illustrative-by-design: the resting book exists but stays sealed until match. Clearly labeled. */
function DepthPanel() {
  const bid = [44, 62, 38, 70];
  const ask = [66, 42, 58, 34];
  return (
    <div data-tour="depth" className="noir-card">
      <div style={{ padding: "14px 20px 6px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--tx)" }}>Dark depth</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ft)" }}>resting book · sealed</span>
      </div>
      <div style={{ padding: "6px 20px 8px" }}>
        <div style={{ position: "relative", background: "var(--plate)", border: "1px solid transparent", borderRadius: 8, padding: "14px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 84 }}>
            {bid.map((h, i) => <div key={`b${i}`} style={{ flex: 1, height: `${h}%`, background: "repeating-linear-gradient(135deg,rgba(61,220,132,.26),rgba(61,220,132,.26) 4px,rgba(61,220,132,.08) 4px,rgba(61,220,132,.08) 8px)", borderTop: "1px solid rgba(61,220,132,.55)" }} />)}
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--bd)", margin: "0 6px" }} />
            {ask.map((h, i) => <div key={`a${i}`} style={{ flex: 1, height: `${h}%`, background: "repeating-linear-gradient(135deg,rgba(255,176,32,.24),rgba(255,176,32,.24) 4px,rgba(255,176,32,.07) 4px,rgba(255,176,32,.07) 8px)", borderTop: "1px solid rgba(255,176,32,.5)" }} />)}
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".18em", color: "var(--dm)", background: "rgba(11,11,15,.85)", border: "1px solid var(--bd)", borderRadius: 2, padding: "4px 12px" }}>SIZES ██████ ENCRYPTED</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase" }}>
            <span style={{ color: "var(--ph)" }}>bid side</span>
            <span style={{ color: "var(--ft)" }}>shapes illustrative · depth stays sealed until match</span>
            <span style={{ color: "var(--am)" }}>ask side</span>
          </div>
        </div>
      </div>
      <p style={{ margin: 0, padding: "0 20px 14px", fontSize: 12.5, lineHeight: 1.55, color: "var(--ft)" }}>The book exists. Nobody reads it. Not even the desk. That is the product.</p>
    </div>
  );
}
