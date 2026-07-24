import { network } from "hardhat";
import type { NetworkConnection } from "hardhat/types/network";

/**
 * Ethereum Sepolia only — the hackathon's deploy target. Never Arbitrum
 * Sepolia (421614), even though several current Nox SDK examples (including
 * iExec's own cVault PoC) default to it. See feedback.md, Day-1 spike 2/4.
 */
export const SEPOLIA_CHAIN_ID = 11_155_111;

/**
 * Connects to the `sepolia` network defined in hardhat.config.ts and asserts
 * the connection's chain id is really Ethereum Sepolia before returning.
 *
 * We deliberately hardcode the network NAME here (rather than trusting
 * whatever `--network` flag the CLI invocation happens to pass, or Hardhat's
 * default-network fallback) and then re-verify the live chain id against the
 * RPC itself. This mirrors the ground-truth rule "never rely on
 * auto-detection" for anything Nox-related: a misconfigured RPC alias or a
 * copy-pasted `--network arbitrumSepolia` should fail LOUDLY here, not
 * silently deploy/interact against the wrong chain.
 */
export async function connectSepolia(): Promise<NetworkConnection<"op">> {
  const connection = await network.connect("sepolia");

  const chainIdHex = await connection.provider.request({
    method: "eth_chainId",
    params: [],
  });
  const chainId = Number(chainIdHex as string);

  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `[after-hours-desk] Refusing to continue: connected chainId is ${chainId}, ` +
        `expected Ethereum Sepolia (${SEPOLIA_CHAIN_ID}). Never trust network ` +
        `auto-detection for Nox — see feedback.md, Day-1 spike point 2.`,
    );
  }

  return connection;
}
