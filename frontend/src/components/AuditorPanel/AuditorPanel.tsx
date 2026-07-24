import { useState } from "react";
import type { ACL } from "@iexec-nox/handle";
import { useWallet } from "../../state/WalletContext";
import { useAppState } from "../../state/AppStateContext";
import { useAuditorAccess } from "../../hooks/useAuditorAccess";
import { useDeskEvents, type DeskTapeEvent } from "../../hooks/useDeskEvents";
import { shortAddress, shortHandle, formatUsdc } from "../../lib/format";
import type { RetryProgress } from "../../lib/retry";
import { RedactedValue } from "../common/RedactedValue";
import styles from "./AuditorPanel.module.css";

/**
 * Address-gated: only meaningful when the CONNECTED wallet is the exact `complianceViewer`
 * address `ViewerRegistry` was deployed with (see `useAuditorAccess`). Every fill listed here is
 * a real `FillRegistered` event read off the deployed `ViewerRegistry` (via `useDeskEvents`) —
 * the ACL list and the decrypted value are both fetched live through the Nox SDK
 * (`handleClient.viewACL` / `.decrypt`), never fabricated.
 */
export function AuditorPanel() {
  const { account } = useWallet();
  const auditor = useAuditorAccess();
  const { events } = useDeskEvents();

  const fills = events.filter(
    (e): e is Extract<DeskTapeEvent, { kind: "FILL_REGISTERED" }> => e.kind === "FILL_REGISTERED",
  );

  return (
    <section className={`${styles.panel} ahd-panel`}>
      <div className={styles.head}>
        <h2>Auditor panel</h2>
        <span className={`${styles.tag} ${auditor.isAuditor ? styles.tagAuditor : ""} mono`}>
          {auditor.isLoading
            ? "checking complianceViewer…"
            : auditor.isAuditor
              ? "AUTHORIZED — compliance viewer"
              : `compliance viewer: ${shortAddress(auditor.complianceViewer)}`}
        </span>
      </div>

      {!auditor.isAuditor ? (
        <p className={styles.locked}>
          This panel only functions for the wallet registered as <code>ViewerRegistry.complianceViewer</code>{" "}
          on-chain. Connected wallet <code>{shortAddress(account)}</code> is not that address —
          this is a real, on-chain ACL check, not a UI-only lock. Connect the compliance-viewer
          wallet to view/decrypt fills.
        </p>
      ) : (
        <div className={styles.body}>
          {fills.length === 0 && <p className={styles.empty}>No fills registered yet.</p>}
          {fills.map((fill) => (
            <AuditorFillRow key={fill.id} fillHandle={fill.fillHandle} auditor={auditor} />
          ))}
        </div>
      )}
    </section>
  );
}

function AuditorFillRow({
  fillHandle,
  auditor,
}: {
  fillHandle: `0x${string}`;
  auditor: ReturnType<typeof useAuditorAccess>;
}) {
  const appState = useAppState();
  const [acl, setAcl] = useState<ACL | null>(null);
  const [isLoadingAcl, setIsLoadingAcl] = useState(false);
  const [decryptedValue, setDecryptedValue] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptProgress, setDecryptProgress] = useState<RetryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleViewAcl() {
    setError(null);
    setIsLoadingAcl(true);
    try {
      const result = await auditor.viewFillACL(fillHandle);
      setAcl(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingAcl(false);
    }
  }

  async function handleDecrypt() {
    setError(null);
    setIsDecrypting(true);
    setDecryptProgress(null);
    appState.enterAuditFlow(`Decrypting fill ${shortHandle(fillHandle)}…`);
    try {
      // Retried — see lib/retry.ts and feedback.md (Fase 5 watchdog review): right after
      // "FillRegistered" fires, the fill's ciphertext is very likely still computing off-chain
      // (single-Runner async latency across a real settleBatch()'s primitive chain).
      const { value } = await auditor.decryptFill(fillHandle, (progress) => {
        setDecryptProgress(progress);
        appState.enterAuditFlow(
          `Decrypting fill ${shortHandle(fillHandle)}… (computing off-chain, attempt ${progress.attempt}/${progress.maxAttempts})`,
        );
      });
      setDecryptedValue(value as bigint);
      appState.exitToReady(`Fill ${shortHandle(fillHandle)} decrypted`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      appState.exitToReady("Decrypt failed — not authorized or handle not ready");
    } finally {
      setIsDecrypting(false);
      setDecryptProgress(null);
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className="mono">{shortHandle(fillHandle)}</span>
        <RedactedValue
          revealed={decryptedValue !== null}
          revealedText={decryptedValue !== null ? `$${formatUsdc(decryptedValue)}` : ""}
          underlyingHandleText={shortHandle(fillHandle)}
        />
      </div>
      <div className={styles.rowActions}>
        <button type="button" className="ahd-btn ahd-btn--ghost" disabled={isLoadingAcl} onClick={() => void handleViewAcl()}>
          {isLoadingAcl ? "Loading ACL…" : "View ACL (who holds the key)"}
        </button>
        <button
          type="button"
          className="ahd-btn ahd-btn--primary"
          disabled={isDecrypting}
          onClick={() => void handleDecrypt()}
        >
          {isDecrypting
            ? decryptProgress
              ? `Computing off-chain… (${decryptProgress.attempt}/${decryptProgress.maxAttempts})`
              : "Decrypting…"
            : "Decrypt fill"}
        </button>
      </div>
      {acl && (
        <div className={styles.acl}>
          <span>isPublic: {String(acl.isPublic)}</span>
          <span>admins: {acl.admins.length > 0 ? acl.admins.map(shortAddress).join(", ") : "—"}</span>
          <span>viewers: {acl.viewers.length > 0 ? acl.viewers.map(shortAddress).join(", ") : "—"}</span>
        </div>
      )}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
