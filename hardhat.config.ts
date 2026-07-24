import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import noxPlugin from "@iexec-nox/nox-hardhat-plugin";
import { configVariable, defineConfig } from "hardhat/config";

// All secrets — including the deploy/signing private key — live in the
// Hardhat keystore (`npx hardhat keystore set --dev DESK_OWNER_PRIVATE_KEY`),
// resolved lazily through `configVariable`. Nothing sensitive is read from
// `process.env`/`.env`: the encrypted keystore is strictly safer than a
// plaintext dotenv file for the one secret (the signing key) that actually
// moves funds, so we do not special-case it the way some reference projects
// (e.g. iExec's own `nox-product-poc`/cVault) do.

// ---------------------------------------------------------------------------
// Day-1 spike, point 2 (see feedback.md): the hackathon target is Ethereum
// Sepolia (chainId 11155111) ONLY — never Arbitrum Sepolia (421614), even
// though most current Nox SDK examples (including iExec's own cVault PoC)
// default to Arbitrum Sepolia. NoxCompute IS deployed on Ethereum Sepolia
// today (0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf, confirmed both in
// contracts/sdk/Nox.sol from @iexec-nox/nox-protocol-contracts@0.2.4 and in
// the @iexec-nox/handle@0.1.0-beta.13 NETWORK_CONFIGS map) — only the JS SDK's
// documentation warns it is not yet "fully" supported. We therefore always
// pass explicit `gatewayUrl` / `smartContractAddress` / `subgraphUrl` to the
// handle client at the application layer (see scripts/utils later in the
// build) instead of relying on chain-id auto-detection.
// ---------------------------------------------------------------------------

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, noxPlugin],

  // Explicit: do NOT let the offchain-stack test override silently skip
  // (build order step 1 — Docker running locally is required for `hardhat
  // test`, which boots the Nox offchain stack: KMS, ingestor, runner, handle
  // gateway, NATS, S3 — see @iexec-nox/nox-hardhat-plugin README).
  nox: {
    skipTestOverride: false,
  },

  // Nox.sol (contracts/sdk/Nox.sol in @iexec-nox/nox-protocol-contracts)
  // requires solidity ^0.8.35; @iexec-nox/nox-confidential-contracts (ERC-7984)
  // requires ^0.8.28, so 0.8.35 satisfies both.
  solidity: {
    profiles: {
      default: {
        version: "0.8.35",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.35",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  // Etherscan v2 unified API key — same key works for all supported chains
  // (mainnet, Sepolia, …). Get one at https://etherscan.io/myapikey.
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },

  networks: {
    // Plain local EDR-simulated networks (no Nox stack pre-deployed) for
    // generic, non-Nox Solidity unit tests. The plugin additionally injects
    // `noxHost` / `noxLocal` automatically (see @iexec-nox/nox-hardhat-plugin
    // src/config.ts) — those two names are reserved by the plugin and must
    // not be redefined here.
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },

    // EDR-simulated fork of Ethereum Sepolia. chainId is preserved
    // (11155111), so `Nox.noxComputeContract()` resolves to the live
    // NoxCompute deployment — lets us fork-test against real Sepolia state
    // (including the real Uniswap pool we reference for pricing) without
    // spending real gas or waiting on the live Runner.
    sepoliaFork: {
      type: "edr-simulated",
      chainType: "generic",
      chainId: 11155111,
      forking: { url: configVariable("SEPOLIA_RPC_URL") },
    },

    // Real Ethereum Sepolia deploy target. `chainType: "op"` matches every
    // real-world Nox network config we found (nox-hardhat-plugin's own
    // `noxLocal` network and iExec's cVault PoC `arbitrumSepolia` network both
    // use "op" regardless of whether the target chain is actually an OP-stack
    // rollup) — treat this as a Nox-tooling requirement, not an L2 signal.
    sepolia: {
      type: "http",
      chainType: "op",
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DESK_OWNER_PRIVATE_KEY")],
    },
  },
});
