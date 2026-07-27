import { useFx } from "../../state/FxContext";
import { useIdentity } from "../../state/IdentityContext";
import { useAppState } from "../../state/AppStateContext";
import { deskGlow } from "../../lib/deskState";
import { BrokerCanvas } from "../mascot/BrokerCanvas";

/**
 * Full-screen pixel-persona reaction pop, fired by real desk actions (order sent, batch closed,
 * fill decrypted). Uses the player's own Broker look, tinted by current desk state, with the
 * action's mood. Click anywhere to dismiss.
 */
export function FxOverlay() {
  const { fx, close } = useFx();
  const { look } = useIdentity();
  const { state } = useAppState();
  if (!fx) return null;
  return (
    <div
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(6,6,10,.5)", backdropFilter: "blur(16px) saturate(130%)", WebkitBackdropFilter: "blur(16px) saturate(130%)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: "ahd-pop .55s cubic-bezier(.2,1.4,.4,1) both", textAlign: "center", padding: 24 }}>
        <BrokerCanvas look={{ ...look, mood: fx.mood }} glow={deskGlow(state)} mood={fx.mood} width={216} height={216} style={{ filter: "drop-shadow(0 22px 46px rgba(0,0,0,.7))" }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, letterSpacing: ".24em", textTransform: "uppercase", color: "var(--ak)" }}>{fx.title}</span>
        <span style={{ fontSize: 14, color: "#c9c7d1", maxWidth: "40ch", lineHeight: 1.5 }}>{fx.sub}</span>
      </div>
    </div>
  );
}
