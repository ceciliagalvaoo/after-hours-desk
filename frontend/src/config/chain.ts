import { defineChain } from "viem";

/**
 * This app targets ONE network only: Ethereum Sepolia (11155111). See
 * ground-truth rule "add a startup check that blocks/warns if the connected
 * wallet isn't on this chain" — enforced by `NetworkGuard` (components/layout)
 * and asserted again defensively wherever a tx is built (lib/assertChain.ts).
 *
 * We deliberately do NOT use viem's built-in `sepolia` chain object as-is for
 * the public client's transport default — we pin our own public RPC URL
 * below so public reads (tape, price strip) work even before a wallet is
 * connected, without requiring any API key. Wallet-originated calls (writes,
 * decrypt) always go through the CONNECTED wallet's own provider
 * (`window.ethereum`), never this RPC.
 */
export const SEPOLIA_CHAIN_ID = 11_155_111;

// Public, keyless Sepolia RPC endpoint — used ONLY for public reads (contract
// views, event logs) before/independent of any wallet connection. No secret
// is embedded here; this is the same class of "public RPC" a block explorer
// itself would use.
//
// NOT publicnode.com's endpoint, despite it being the most commonly cited free Sepolia RPC:
// confirmed LIVE in this session (direct `curl`, then a headless-browser smoke test of this
// exact app) that publicnode.com's free/anonymous tier rejects ANY `eth_getLogs` call spanning
// more than ~150 blocks (~30 minutes) with "Archive requests require a personal token" — far too
// narrow to reconstruct even this hackathon's own short history. Tested several alternatives
// live against the real, deployed `AfterHoursDesk` contract before picking this one:
// `sepolia.gateway.tenderly.co` correctly returns full results for a 30,000-block range (the
// exact window this app requests, see `lib/eventLogs.ts`'s `MAX_LOOKBACK_BLOCKS`);
// `sepolia.drpc.org` also works but caps free-tier ranges at 10,000 blocks; `rpc.sepolia.org`/
// `rpc2.sepolia.org`/Omnia's public endpoint didn't respond at all from this environment. See
// feedback.md, Fase 5.
export const PUBLIC_SEPOLIA_RPC_URL = "https://sepolia.gateway.tenderly.co";

export const sepoliaChain = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [PUBLIC_SEPOLIA_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
});
