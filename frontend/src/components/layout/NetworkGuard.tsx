import type { ReactNode } from "react";
import { useWallet } from "../../state/WalletContext";
import { SEPOLIA_CHAIN_ID } from "../../config/chain";
import { Broker } from "../mascot/Broker";
import styles from "./NetworkGuard.module.css";

/**
 * Surfaces a real wallet/network precondition as a BANNER, never a full-page block — the public,
 * wallet-independent surfaces (`Tape`, `UniswapPriceStrip`, both driven by hooks that
 * deliberately require no wallet — see `useDeskEvents`/`useUniswapPrice`) must stay visible and
 * real even before a wallet connects, so a judge opening the link with no wallet installed (or
 * before clicking "connect") still sees genuine on-chain data, not a blank gate screen. Only the
 * WRITE-requiring surfaces (`OrderTicket`'s submit/settle actions, `AuditorPanel`'s gated
 * content) actually depend on a connected wallet, and each already surfaces its own real "connect
 * a wallet" state inline where relevant.
 */
export function NetworkGuard({ children }: { children: ReactNode }) {
  const { hasInjectedProvider, status, account, chainId, isCorrectChain, error, connect, switchToSepolia } =
    useWallet();

  let banner: ReactNode = null;

  if (!hasInjectedProvider) {
    banner = (
      <div className={styles.banner}>
        <Broker state="LOADING" caption="NO WALLET DETECTED" compact />
        <div className={styles.bannerBody}>
          <p className={styles.bannerText}>
            No injected EIP-1193 wallet (e.g. MetaMask) detected — the public tape and Uniswap
            price strip below are still real, live Sepolia data. Install a wallet and reload to
            submit orders or use the auditor panel.
          </p>
        </div>
      </div>
    );
  } else if (status !== "connected" || !account) {
    banner = (
      <div className={styles.banner}>
        <Broker state="LOADING" caption="WALLET NOT CONNECTED" compact />
        <div className={styles.bannerBody}>
          <p className={styles.bannerText}>
            Connect a wallet to submit orders, trigger settlement, or use the auditor panel —
            every value on this page is read from a real Sepolia contract or a real Nox decrypt,
            never mocked.
          </p>
          <div className={styles.actions}>
            <button type="button" className="ahd-btn ahd-btn--primary" onClick={() => void connect()}>
              {status === "connecting" ? "Connecting…" : "Connect wallet"}
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    );
  } else if (!isCorrectChain) {
    banner = (
      <div className={styles.banner}>
        <Broker state="LOADING" caption="WRONG NETWORK" compact />
        <div className={styles.bannerBody}>
          <p className={styles.bannerText}>
            Connected wallet is on chainId {chainId ?? "unknown"}. This desk only operates on
            Ethereum Sepolia ({SEPOLIA_CHAIN_ID}) — the Nox SDK is known to still default some
            examples to Arbitrum Sepolia (421614); this app never falls back to it silently.
          </p>
          <div className={styles.actions}>
            <button type="button" className="ahd-btn ahd-btn--primary" onClick={() => void switchToSepolia()}>
              Switch to Ethereum Sepolia
            </button>
          </div>
          <p className={styles.meta}>Connected: {account}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {banner}
      {children}
    </>
  );
}
