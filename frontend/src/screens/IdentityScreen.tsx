import { useScreen } from "../state/ScreenContext";
import { useAppState } from "../state/AppStateContext";
import { useIdentity, IDENTITY_OPTIONS } from "../state/IdentityContext";
import { deskGlow, deskLabel } from "../lib/deskState";
import { BrokerCanvas, CROP_HEAD, CROP_BUST } from "../components/mascot/BrokerCanvas";
import type { BrokerLook } from "../lib/brokerGrid";

const GROUPS: { field: "hat" | "coat" | "eyes" | "trim"; title: string; note: string; crop: typeof CROP_HEAD }[] = [
  { field: "hat", title: "Hat", note: "Silhouette reads first at 32px.", crop: CROP_HEAD },
  { field: "coat", title: "Coat", note: "Black overcoat is the house cut.", crop: CROP_BUST },
  { field: "eyes", title: "Eyewear", note: "The redaction bar is the desk’s own mark.", crop: CROP_HEAD },
  { field: "trim", title: "Trim", note: "Hat band and lapel pin. Muted by house rule.", crop: CROP_HEAD },
];

export function IdentityScreen() {
  const { go } = useScreen();
  const { state } = useAppState();
  const { identity, look, setPart, setAlias, randomize } = useIdentity();
  const glow = deskGlow(state);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--tx)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "13px 32px", borderBottom: "1px solid var(--bs)", background: "var(--rz)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <BrokerCanvas look={look} glow={glow} crop={CROP_HEAD} width={26} height={29} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--tx)" }}>After Hours Desk</span>
        </div>
        <button type="button" className="noir-ghost" onClick={() => go("intro")}>Back</button>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "52px 32px 72px", display: "grid", gridTemplateColumns: "minmax(0,340px) minmax(0,1fr)", gap: 56, alignItems: "start" }}>

        {/* Sticky preview */}
        <div style={{ position: "sticky", top: 32, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ position: "relative", border: "1px solid transparent", borderRadius: 12, background: "#08080b", boxShadow: "var(--shp)", padding: "30px 24px 26px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "56%", pointerEvents: "none", background: `radial-gradient(60% 100% at 50% 100%, ${glow}22, transparent 72%)` }} />
            <BrokerCanvas look={look} glow={glow} width={264} height={264} style={{ position: "relative" }} />
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, letterSpacing: ".14em", color: "var(--tx)" }}>{identity.alias || "BROKER"}</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--ft)" }}>{deskLabel(state)}</span>
            </div>
          </div>
          <button type="button" className="noir-ghost" onClick={randomize}>Randomize</button>
        </div>

        {/* Controls */}
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem,3.4vw,2.7rem)", lineHeight: 1.06, letterSpacing: "-.028em", fontWeight: 300, color: "var(--tx)" }}>Create your Broker.</h1>
          <p style={{ margin: "18px 0 0", fontSize: 15, lineHeight: 1.68, color: "var(--dm)", maxWidth: "56ch" }}>Cosmetic only. Stored locally, shown beside your orders, and never once touching an order, a key, or a fill. The lens and hem glow answer to desk state, not to you, so those two aren’t yours to pick.</p>

          <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 34 }}>
            {GROUPS.map((g) => (
              <div key={g.field}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--dm)" }}>{g.title}</span>
                  <span style={{ fontSize: 13, color: "var(--ft)" }}>{g.note}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(124px,1fr))", gap: 12 }}>
                  {(IDENTITY_OPTIONS[g.field] as readonly (readonly [string, string])[]).map(([key, label]) => {
                    const optLook: BrokerLook = { ...look, [g.field]: key };
                    const selected = identity[g.field] === key;
                    return (
                      <div key={key} style={{ position: "relative" }}>
                        <button type="button" onClick={() => setPart(g.field, key as never)} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 10px", border: "1px solid transparent", borderRadius: 8, background: "var(--rz)", cursor: "pointer" }}>
                          <div style={{ background: "var(--bg)", border: "1px solid transparent", borderRadius: 6, padding: "7px 12px" }}>
                            <BrokerCanvas look={optLook} glow={glow} crop={g.crop} width={66} height={g.crop === CROP_BUST ? 66 : 73} />
                          </div>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--dm)" }}>{label}</span>
                        </button>
                        {selected && <div style={{ position: "absolute", inset: 0, border: "1px solid var(--ak)", borderRadius: 8, background: "rgba(245,197,24,.06)", pointerEvents: "none" }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Alias */}
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--dm)", marginBottom: 12 }}>Desk alias</div>
              <input value={identity.alias} onChange={(e) => setAlias(e.target.value)} maxLength={18} style={{ width: 280, padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", fontFamily: "'JetBrains Mono',monospace", fontSize: 14, letterSpacing: ".1em" }} />
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ft)", lineHeight: 1.5 }}>Shown on the tape next to your truncated address. Not an on-chain name.</p>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--bs)", marginTop: 6, paddingTop: 28 }}>
              <button type="button" className="noir-primary" style={{ padding: "14px 26px" }} onClick={() => go("desk")}>Confirm identity</button>
              <button type="button" className="noir-ghost" style={{ padding: "14px 26px" }} onClick={() => go("desk")}>Skip for now</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
