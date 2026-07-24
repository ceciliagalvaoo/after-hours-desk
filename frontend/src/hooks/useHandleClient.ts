import { useEffect, useState } from "react";
import { createViemHandleClient, type HandleClient } from "@iexec-nox/handle";
import { useWallet } from "../state/WalletContext";
import { SEPOLIA_NOX_CONFIG } from "../config/nox";

/**
 * Builds (and rebuilds, whenever the connected account changes) a Nox
 * `HandleClient` bound to the connected wallet — this is what
 * `encryptInput`/`decrypt`/`publicDecrypt`/`viewACL` are all called through.
 *
 * Signature confirmed against the installed `@iexec-nox/handle` package
 * source (`src/factories/createViemHandleClient.ts`) and cross-checked live
 * against https://docs.noxprotocol.io/llms-full.txt before writing this
 * hook — `createViemHandleClient(walletClient, config?)`, never the
 * auto-detect-everything `createHandleClient` (which imports both the viem
 * AND ethers adapters — avoided here exactly like the backend avoided it in
 * `hardhat.config.ts`/Day-1 scaffold, per the "don't import both" bundle-size
 * warning).
 */
export function useHandleClient(): {
  handleClient: HandleClient | null;
  isLoading: boolean;
  error: string | null;
} {
  const { walletClient, account } = useWallet();
  const [handleClient, setHandleClient] = useState<HandleClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!walletClient || !account) {
      setHandleClient(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    createViemHandleClient(walletClient, SEPOLIA_NOX_CONFIG)
      .then((client) => {
        if (!cancelled) {
          setHandleClient(client);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setHandleClient(null);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [walletClient, account]);

  return { handleClient, isLoading, error };
}
