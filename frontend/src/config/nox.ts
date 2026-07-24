import type { HandleClientConfig } from "@iexec-nox/handle";

/**
 * Mirrored, byte-for-byte, from `scripts/utils/handleClient.ts` (the
 * backend's own already-verified Sepolia Nox config) per the task
 * instructions ("replique esses MESMOS valores no client-side da UI"). Do
 * NOT let this drift from that file — if `@iexec-nox/handle` ever changes
 * its Sepolia network defaults, update BOTH places together and re-confirm
 * against https://docs.noxprotocol.io/llms-full.txt and the installed
 * package's `src/config/networks.ts`, exactly like the backend's Day-1 spike
 * 2 (see feedback.md, "[Fase 0] Spike 2/4") already did once.
 *
 * We still pass this explicitly on every `createViemHandleClient(...)` call
 * rather than relying on the SDK's own chain-id auto-detection, for the same
 * reason documented there: auto-detection happens to work today but the
 * public docs (llms-full.txt) still describe Ethereum Sepolia support as
 * "upcoming" for the JS SDK, and the SDK is pre-1.0 — never trust silent
 * auto-detection to keep matching Sepolia in a future release.
 */
export const SEPOLIA_NOX_CONFIG: HandleClientConfig = {
  gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
  smartContractAddress: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf",
  subgraphUrl:
    "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
};

/** `bytes32(0)` — the desk's own "not settled / not computed yet" sentinel
 * (see `AfterHoursDesk.sol`: `fill: euint256.wrap(bytes32(0))`). Never treat
 * this as a real handle to decrypt. */
export const NULL_HANDLE = `0x${"0".repeat(64)}` as const;
