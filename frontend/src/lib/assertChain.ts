import { SEPOLIA_CHAIN_ID } from "../config/chain";

/**
 * Defensive, redundant chain check — referenced from `config/chain.ts`'s own docstring
 * ("asserted again defensively wherever a tx is built"). `NetworkGuard` already blocks the whole
 * app UI when the wallet isn't on Sepolia, but every function that actually builds/sends a
 * transaction or calls the Nox SDK calls this too, so a future refactor that accidentally
 * renders a write-capable component outside `NetworkGuard` fails LOUDLY and immediately rather
 * than silently submitting to (or reading from) the wrong chain.
 */
export function assertConnectedToSepolia(chainId: number | null): void {
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `[assertChain] Wallet is on chainId=${chainId ?? "unknown"}, expected Ethereum Sepolia ` +
        `(${SEPOLIA_CHAIN_ID}). Refusing to submit a transaction or SDK call against the wrong network.`,
    );
  }
}
