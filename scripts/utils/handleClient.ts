import { createViemHandleClient } from "@iexec-nox/handle";
import type { HandleClient, HandleClientConfig } from "@iexec-nox/handle";
import type { WalletClient } from "viem";

/**
 * Day-1 spike point 2 (feedback.md, "[Fase 0] Spike 2/4"): never rely on the
 * `@iexec-nox/handle` SDK's chain-id auto-detection for Ethereum Sepolia —
 * always pass `gatewayUrl` / `smartContractAddress` / `subgraphUrl`
 * explicitly. Values below confirmed by reading the installed source of
 * `@iexec-nox/handle@0.1.0-beta.13`
 * (`node_modules/@iexec-nox/handle/src/config/networks.ts`,
 * `NETWORK_CONFIGS[11_155_111]`), not copied from documentation or memory.
 */
export const SEPOLIA_NOX_CONFIG: HandleClientConfig = {
  gatewayUrl: "https://gateway-testnets.noxprotocol.dev",
  smartContractAddress: "0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf",
  subgraphUrl:
    "https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo",
};

export async function createSepoliaHandleClient(
  walletClient: WalletClient,
): Promise<HandleClient> {
  return createViemHandleClient(walletClient, SEPOLIA_NOX_CONFIG);
}
