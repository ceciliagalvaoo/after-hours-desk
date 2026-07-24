import { useCallback, useEffect, useState } from "react";
import type { ACL, Handle } from "@iexec-nox/handle";
import { useWallet } from "../state/WalletContext";
import { useHandleClient } from "./useHandleClient";
import { getPublicClient } from "../lib/viemClients";
import { deployments, VIEWER_REGISTRY_ABI } from "../config/contracts";
import { decryptWithRetry, type RetryProgress } from "../lib/retry";

/**
 * Gates the Auditor Panel. `ViewerRegistry.complianceViewer()` is public on-chain state (a plain
 * `view`, read with no wallet required) — the connected wallet only becomes "the auditor" for
 * this UI's purposes if its address matches that value exactly. This is the SAME address the
 * `ViewerRegistry` constructor set immutably at deploy time (see `ViewerRegistry.sol` — it is
 * NOT rotatable, deliberately, per feedback.md Fase 3), so this check can never drift from the
 * on-chain source of truth.
 *
 * `viewFillACL`/`decryptFill` both require a connected wallet's own `HandleClient` — `viewACL`
 * reads the Nox subgraph (who currently holds admin/viewer access, including whether the handle
 * is public), `decrypt` performs the actual gasless EIP-712-signed decrypt. Both throw a real
 * error (never silently return a fake value) if the connected wallet is not actually authorized.
 */
export function useAuditorAccess(): {
  complianceViewer: `0x${string}` | null;
  isAuditor: boolean;
  isLoading: boolean;
  error: string | null;
  viewFillACL: (handle: `0x${string}`) => Promise<ACL>;
  decryptFill: (
    handle: `0x${string}`,
    onProgress?: (progress: RetryProgress) => void,
  ) => Promise<{ value: bigint | boolean | string; solidityType: string }>;
} {
  const { account } = useWallet();
  const { handleClient } = useHandleClient();
  const [complianceViewer, setComplianceViewer] = useState<`0x${string}` | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getPublicClient()
      .readContract({
        address: deployments.viewerRegistry,
        abi: VIEWER_REGISTRY_ABI,
        functionName: "complianceViewer",
      })
      .then((addr) => {
        if (!cancelled) {
          setComplianceViewer(addr as `0x${string}`);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuditor = Boolean(
    account && complianceViewer && account.toLowerCase() === complianceViewer.toLowerCase(),
  );

  const viewFillACL = useCallback(
    async (handle: `0x${string}`): Promise<ACL> => {
      if (!handleClient) {
        throw new Error("Connect the compliance-viewer wallet on Sepolia first.");
      }
      return handleClient.viewACL(handle as Handle<"uint256">);
    },
    [handleClient],
  );

  const decryptFill = useCallback(
    async (handle: `0x${string}`, onProgress?: (progress: RetryProgress) => void) => {
      if (!handleClient) {
        throw new Error("Connect the compliance-viewer wallet on Sepolia first.");
      }
      // Retried — see lib/retry.ts: a fill's ciphertext may still be computing off-chain
      // (single-Runner async latency) right after settleBatch()'s "FillRegistered" event fires.
      return decryptWithRetry(() => handleClient.decrypt(handle as Handle<"uint256">), {
        onProgress,
      });
    },
    [handleClient],
  );

  return { complianceViewer, isAuditor, isLoading, error, viewFillACL, decryptFill };
}
