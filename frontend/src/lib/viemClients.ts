import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { PublicClient, WalletClient } from "viem";
import { PUBLIC_SEPOLIA_RPC_URL, sepoliaChain } from "../config/chain";

/**
 * ONE shared public client for every unauthenticated, wallet-independent read
 * in this app (tape events, Uniswap price strip, ACL introspection prep).
 * Deliberately independent of wallet-connection state — a judge should be
 * able to see the redacted tape and the public price strip load real data
 * even before connecting a wallet.
 */
let sharedPublicClient: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  sharedPublicClient ??= createPublicClient({
    chain: sepoliaChain,
    // Explicit retry/backoff on top of viem's own defaults — a free public RPC
    // (publicnode.com) rate-limits (429) or WAF-flags (403) bursts of concurrent
    // requests, which this app genuinely produces on first load (tape history +
    // price strip + balance + operator status all reading at once). Confirmed
    // live in this session (headless-browser smoke test hit both 403 and 429
    // against the exact same endpoint that a plain `curl` reached fine) — this
    // is a real request-volume characteristic of the public endpoint, not a
    // testing artifact, so every read-side hook also fetches sequentially
    // where it reasonably can (see `lib/eventLogs.ts`, `useDeskEvents.ts`).
    transport: http(PUBLIC_SEPOLIA_RPC_URL, { retryCount: 5, retryDelay: 800 }),
  });
  return sharedPublicClient;
}

/**
 * Builds a viem WalletClient wrapping the injected EIP-1193 provider
 * (`window.ethereum`) — the exact pattern from the Nox docs' own browser
 * example (`createWalletClient({ transport: custom(window.ethereum) })`,
 * confirmed live against https://docs.noxprotocol.io/llms-full.txt before
 * writing this file). We intentionally build this ourselves with plain viem
 * rather than adding a wallet-connection library (wagmi/RainbowKit/etc): the
 * backend already standardized on viem alone (no ethers, "don't install
 * both"), and this app's wallet needs are narrow enough (one injected
 * provider, one required chain) that a dedicated library would be pure
 * bundle weight for no behavioral gain here.
 */
export function createInjectedWalletClient(account: `0x${string}`): WalletClient {
  if (!window.ethereum) {
    throw new Error("[wallet] No injected EIP-1193 provider found (e.g. MetaMask).");
  }
  return createWalletClient({
    account,
    chain: sepoliaChain,
    transport: custom(window.ethereum),
  });
}

export async function requestAccounts(): Promise<`0x${string}`[]> {
  if (!window.ethereum) {
    throw new Error("[wallet] No injected EIP-1193 provider found (e.g. MetaMask).");
  }
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  return accounts as `0x${string}`[];
}

export async function getChainIdHex(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("[wallet] No injected EIP-1193 provider found (e.g. MetaMask).");
  }
  return (await window.ethereum.request({ method: "eth_chainId" })) as string;
}
