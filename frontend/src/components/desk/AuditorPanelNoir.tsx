import { useState } from "react";
import type { ACL } from "@iexec-nox/handle";
import { useWallet } from "../../state/WalletContext";
import { useAppState } from "../../state/AppStateContext";
import { useFx } from "../../state/FxContext";
import { useAuditorAccess } from "../../hooks/useAuditorAccess";
import { useDeskEvents, type DeskTapeEvent } from "../../hooks/useDeskEvents";
import { shortAddress, shortHandle, formatUsdc } from "../../lib/format";
import type { RetryProgress } from "../../lib/retry";

export function AuditorPanelNoir() {
  const { account } = useWallet();
  const auditor = useAuditorAccess();
  const { events } = useDeskEvents();
  const fills = events.filter((e): e is Extract<DeskTapeEvent, { kind: "FILL_REGISTERED" }> => e.kind === "FILL_REGISTERED");

  return (
    <section data-tour="aud" className="noir-card">
      <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--bs)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 400, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tx)" }}>Auditor panel</h2>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, padding: "4px 10px", borderRadius: 999, border: `1px solid ${auditor.isAuditor ? "var(--ad)" : "var(--bd)"}`, color: auditor.isAuditor ? "var(--ak)" : "var(--dm)", letterSpacing: ".06em" }}>
          {auditor.isLoading ? "checking complianceViewer…" : auditor.isAuditor ? "AUTHORIZED · compliance viewer" : `compliance viewer: ${shortAddress(auditor.complianceViewer)}`}
        </span>
      </div>

      {!auditor.isAuditor ? (
        <p style={{ margin: 0, padding: "18px", color: "var(--dm)", fontSize: 13, lineHeight: 1.5 }}>
          Nice try. This desk answers to exactly one auditor — the wallet registered as{" "}
          <code style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--tx)" }}>ViewerRegistry.complianceViewer</code>. Connected wallet{" "}
          <code style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--tx)" }}>{shortAddress(account)}</code> is not that address. Real on-chain ACL check, not a UI lock.
        </p>
      ) : (
        <>
          <p style={{ margin: 0, padding: "12px 18px 0", fontSize: 12.5, color: "var(--ft)" }}>You hold the key. Everyone else holds a black bar.</p>
          <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
            {fills.length === 0 && <p style={{ padding: 32, textAlign: "center", color: "var(--ft)", fontSize: 13, margin: 0 }}>No fills registered yet.</p>}
            {fills.map((f) => <AuditorFillRow key={f.id} fillHandle={f.fillHandle} auditor={auditor} />)}
          </div>
        </>
      )}
    </section>
  );
}

function AuditorFillRow({ fillHandle, auditor }: { fillHandle: `0x${string}`; auditor: ReturnType<typeof useAuditorAccess> }) {
  const appState = useAppState();
  const fx = useFx();
  const [acl, setAcl] = useState<ACL | null>(null);
  const [isLoadingAcl, setIsLoadingAcl] = useState(false);
  const [decryptedValue, setDecryptedValue] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [progress, setProgress] = useState<RetryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleViewAcl() {
    setError(null);
    setIsLoadingAcl(true);
    try {
      setAcl(await auditor.viewFillACL(fillHandle));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingAcl(false);
    }
  }

  async function handleDecrypt() {
    setError(null);
    setIsDecrypting(true);
    setProgress(null);
    appState.enterAuditFlow(`Decrypting fill ${shortHandle(fillHandle)}…`);
    try {
      const { value } = await auditor.decryptFill(fillHandle, (p) => {
        setProgress(p);
        appState.enterAuditFlow(`Decrypting fill ${shortHandle(fillHandle)}… (attempt ${p.attempt}/${p.maxAttempts})`);
      });
      setDecryptedValue(value as bigint);
      appState.exitToReady(`Fill ${shortHandle(fillHandle)} decrypted`);
      fx.show("smile", "Told you it was real.", "Compliance holds a key. The bar was never empty.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      appState.exitToReady("Decrypt failed — not authorized or handle not ready");
    } finally {
      setIsDecrypting(false);
      setProgress(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", border: "1px solid transparent", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: "var(--dm)" }}>{shortHandle(fillHandle)}</span>
        {decryptedValue !== null ? (
          <span title="Told you it was real." style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: "var(--ph)", fontVariantNumeric: "tabular-nums" }}>${formatUsdc(decryptedValue)}</span>
        ) : (
          <span title="Real handle underneath. Go on, try." className="noir-censor">{shortHandle(fillHandle)}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <button type="button" className="noir-ghost" style={{ fontSize: 12.5, padding: "8px 12px" }} disabled={isLoadingAcl} onClick={() => void handleViewAcl()}>{isLoadingAcl ? "Loading ACL…" : "View ACL"}</button>
        <button type="button" className="noir-primary" style={{ fontSize: 12.5, padding: "8px 12px" }} disabled={isDecrypting} onClick={() => void handleDecrypt()}>{isDecrypting ? (progress ? `Computing… (${progress.attempt}/${progress.maxAttempts})` : "Decrypting…") : "Decrypt fill"}</button>
      </div>
      {acl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "var(--dm)", paddingTop: 8, borderTop: "1px solid var(--bs)" }}>
          <span>isPublic: {String(acl.isPublic)}</span>
          <span>admins: {acl.admins.length > 0 ? acl.admins.map(shortAddress).join(", ") : "—"}</span>
          <span>viewers: {acl.viewers.length > 0 ? acl.viewers.map(shortAddress).join(", ") : "—"}</span>
        </div>
      )}
      {error && <span style={{ color: "var(--dg)", fontSize: 11.5 }}>{error}</span>}
    </div>
  );
}
