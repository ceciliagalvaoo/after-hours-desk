import { useCallback, useEffect, useState } from "react";
import type { Handle } from "@iexec-nox/handle";
import { useWallet } from "../state/WalletContext";
import { useHandleClient } from "./useHandleClient";
import { getPublicClient } from "../lib/viemClients";
import { deployments, CONFIDENTIAL_USDC_ABI } from "../config/contracts";
import { isNullHandle } from "../lib/format";
import { decryptWithRetry, type RetryProgress } from "../lib/retry";

/**
 * The connected trader's own confidential cUSDC balance. `confidentialBalanceOf` is a plain
 * public `view` (the HANDLE pointer is public — that is how ERC-7984 works, see
 * `ConfidentialUSDC.sol`'s docstring), fetched via the shared public client with no wallet
 * required. Only the underlying VALUE is confidential — revealing it requires the connected
 * wallet to actually call `HandleClient.decrypt`, which itself requires the wallet to already
 * hold ACL (admin/viewer) access; `ERC20ToERC7984Wrapper`'s `wrap()` grants that automatically to
 * its own recipient (see `ConfidentialUSDC.sol`), so any account that has ever wrapped mUSDC can
 * decrypt its own balance here.
 */
export function useCUsdcBalances(): {
  handle: `0x${string}` | null;
  isLoadingHandle: boolean;
  handleError: string | null;
  decryptedValue: bigint | null;
  isDecrypting: boolean;
  decryptError: string | null;
  decryptProgress: RetryProgress | null;
  decryptBalance: () => Promise<void>;
  refreshHandle: () => Promise<void>;
} {
  const { account } = useWallet();
  const { handleClient } = useHandleClient();
  const [handle, setHandle] = useState<`0x${string}` | null>(null);
  const [isLoadingHandle, setIsLoadingHandle] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptProgress, setDecryptProgress] = useState<RetryProgress | null>(null);

  const refreshHandle = useCallback(async () => {
    if (!account) {
      setHandle(null);
      return;
    }
    setIsLoadingHandle(true);
    setHandleError(null);
    try {
      const raw = await getPublicClient().readContract({
        address: deployments.confidentialUSDC,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "confidentialBalanceOf",
        args: [account],
      });
      const nextHandle = raw as `0x${string}`;
      // A refreshed handle invalidates any previously decrypted value (the underlying balance
      // may have changed — never show a stale plaintext number next to a new handle).
      setHandle((prev) => {
        if (prev !== nextHandle) setDecryptedValue(null);
        return nextHandle;
      });
    } catch (err) {
      setHandleError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingHandle(false);
    }
  }, [account]);

  useEffect(() => {
    void refreshHandle();
  }, [refreshHandle]);

  const decryptBalance = useCallback(async () => {
    if (!handleClient) {
      setDecryptError("Connect a wallet on Sepolia first.");
      return;
    }
    if (!handle || isNullHandle(handle)) {
      setDecryptError("No confidential balance handle to decrypt yet.");
      return;
    }
    setIsDecrypting(true);
    setDecryptError(null);
    setDecryptProgress(null);
    try {
      // Wrapped in retry — see lib/retry.ts: a fresh balance handle right after wrap/settle may
      // not have resolved ciphertext yet (single-Runner async latency, Day-1 spike 4), and the
      // SDK's own internal retry ceiling (6s) is tuned for one primitive, not a real settlement.
      const { value } = await decryptWithRetry(
        () => handleClient.decrypt(handle as Handle<"uint256">),
        { onProgress: setDecryptProgress },
      );
      setDecryptedValue(value as bigint);
    } catch (err) {
      // Real "not authorized"/gateway-error surface — never a silent fallback to a fake number.
      setDecryptError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDecrypting(false);
      setDecryptProgress(null);
    }
  }, [handleClient, handle]);

  return {
    handle,
    isLoadingHandle,
    handleError,
    decryptedValue,
    isDecrypting,
    decryptError,
    decryptProgress,
    decryptBalance,
    refreshHandle,
  };
}
