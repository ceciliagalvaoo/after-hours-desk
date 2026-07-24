import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WalletClient } from "viem";
import { PUBLIC_SEPOLIA_RPC_URL, SEPOLIA_CHAIN_ID } from "../config/chain";
import { createInjectedWalletClient, getChainIdHex, requestAccounts } from "../lib/viemClients";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

interface WalletContextValue {
  status: WalletStatus;
  account: `0x${string}` | null;
  chainId: number | null;
  isCorrectChain: boolean;
  hasInjectedProvider: boolean;
  walletClient: WalletClient | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepolia: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const SEPOLIA_CHAIN_ID_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasInjectedProvider = typeof window !== "undefined" && Boolean(window.ethereum);

  const refreshChainId = useCallback(async () => {
    try {
      const hex = await getChainIdHex();
      setChainId(Number.parseInt(hex, 16));
    } catch {
      setChainId(null);
    }
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const accounts = await requestAccounts();
      if (accounts.length === 0) {
        throw new Error("Wallet returned no accounts.");
      }
      setAccount(accounts[0]);
      await refreshChainId();
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [refreshChainId]);

  const disconnect = useCallback(() => {
    // EIP-1193 has no standard "disconnect" call for injected wallets — this
    // just clears local app state; MetaMask itself stays connected until the
    // user revokes it there.
    setAccount(null);
    setStatus("disconnected");
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      // 4902 = chain not yet added to this wallet.
      const code = (switchError as { code?: number })?.code;
      if (code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID_HEX,
              chainName: "Ethereum Sepolia",
              nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [PUBLIC_SEPOLIA_RPC_URL],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
    await refreshChainId();
  }, [refreshChainId]);

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAccount(accounts[0] as `0x${string}`);
        setStatus("connected");
      }
    };
    const handleChainChanged = () => {
      void refreshChainId();
    };
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [disconnect, refreshChainId]);

  // Silent re-connect on load if the site is already authorized (does not
  // prompt MetaMask — `eth_accounts` only returns already-approved accounts).
  useEffect(() => {
    if (!window.ethereum) return;
    (async () => {
      try {
        const accounts = (await window.ethereum!.request({ method: "eth_accounts" })) as string[];
        if (accounts.length > 0) {
          setAccount(accounts[0] as `0x${string}`);
          await refreshChainId();
          setStatus("connected");
        }
      } catch {
        // Non-fatal — user can still connect manually.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const walletClient = useMemo(() => {
    if (!account) return null;
    try {
      return createInjectedWalletClient(account);
    } catch {
      return null;
    }
  }, [account]);

  const value: WalletContextValue = {
    status,
    account,
    chainId,
    isCorrectChain: chainId === SEPOLIA_CHAIN_ID,
    hasInjectedProvider,
    walletClient,
    error,
    connect,
    disconnect,
    switchToSepolia,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
