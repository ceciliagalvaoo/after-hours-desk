import { useWallet } from "../../state/WalletContext";
import { SEPOLIA_CHAIN_ID } from "../../config/chain";

/**
 * Noir restyle of the old NetworkGuard — a precondition BANNER (never a full-page block) shown
 * above the desk so the public tape + price strip stay visible with no wallet. Real wallet state,
 * three variants: no wallet / not connected / wrong network.
 */
export function NetworkBanner() {
  const { hasInjectedProvider, status, account, chainId, isCorrectChain, error, connect, switchToSepolia } = useWallet();

  if (hasInjectedProvider && status === "connected" && account && isCorrectChain) return null;

  let text: string;
  let action: React.ReactNode = null;
  let meta: string | null = null;

  if (!hasInjectedProvider) {
    text = "No injected wallet (e.g. MetaMask) detected — the public tape and Uniswap price strip below are still real, live Sepolia data. Install a wallet and reload to trade or audit.";
  } else if (status !== "connected" || !account) {
    text = "Connect a wallet to submit orders, trigger settlement, or use the auditor panel — every value on this page is a real Sepolia read or a real Nox decrypt, never mocked.";
    action = (
      <button type="button" className="noir-primary" onClick={() => void connect()}>
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
    );
  } else {
    text = `Connected wallet is on chainId ${chainId ?? "unknown"}. This desk only operates on Ethereum Sepolia (${SEPOLIA_CHAIN_ID}) — it never silently falls back to Arbitrum Sepolia.`;
    action = <button type="button" className="noir-primary" onClick={() => void switchToSepolia()}>Switch to Ethereum Sepolia</button>;
    meta = `Connected: ${account}`;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 24px", borderBottom: "1px solid var(--bd)", background: "var(--rz)", flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <p style={{ margin: 0, maxWidth: "48rem", color: "var(--dm)", fontSize: 13, lineHeight: 1.5 }}>{text}</p>
        {action && <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{action}</div>}
        {meta && <p style={{ margin: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "var(--ft)" }}>{meta}</p>}
        {error && <p style={{ margin: 0, color: "var(--dg)", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
