<div align="center">

# After Hours Desk

**A confidential OTC dark-pool settlement desk, built on Nox (iExec), live on Ethereum Sepolia.**

[![Live app](https://img.shields.io/badge/live%20app-after--hours--desk.onrender.com-46b72a)](https://after-hours-desk.onrender.com)
[![Network](https://img.shields.io/badge/network-Ethereum%20Sepolia-8c7ae6)](https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8)
[![Solidity](https://img.shields.io/badge/solidity-0.8.35-363636)](contracts/)
[![Hackathon](https://img.shields.io/badge/iExec-WTF%20Hackathon-F5C518)](https://dorahacks.io/hackathon/iexec-wtf)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

🚀 [**Live app**](https://after-hours-desk.onrender.com) · 📖 [Full documentation](#documentation) · 🧾 [`feedback.md`](feedback.md) · 🖥️ [Frontend source](frontend/)

</div>

---

Traders submit encrypted order sizes — client-side `encryptInput`, never a plaintext amount on
calldata. `AfterHoursDesk.sol` nets a batch's buy/sell sides entirely from composed Nox primitives
(`safeAdd`, `lt`/`select`, `safeMul`/`safeDiv`/`safeSub`) and moves real confidential `cUSDC`
balances between traders. Only the aggregate matched quantity and the execution price — read live
from a real Uniswap V3 Sepolia pool — are ever publicly decryptable; individual order sizes and
per-trader fills never are. A compliance-viewer address (the "auditor") can decrypt every fill;
each trader can only decrypt their own.

No mocked UI data anywhere in the reachable path — every number on screen is a real Sepolia
contract read or a real Nox `decrypt`/`publicDecrypt`. See [`feedback.md`](feedback.md) for the
full, dated log of Nox integration friction encountered building this.

Built by **[Cecília Galvão](https://github.com/ceciliagalvaoo)** and **[Pablo Azevedo](https://github.com/zzaved)** for the **iExec WTF Hackathon (Summer Edition)**.

## Table of contents

- [Live deployment](#live-deployment-ethereum-sepolia-chainid-11155111)
- [Repo layout](#repo-layout)
- [Setup](#setup)
- [Testing](#testing)
- [Deploying](#deploying-ethereum-sepolia)
- [Running the frontend](#running-the-frontend)
- [Known limitations](#known-limitations-disclosed-not-hidden)
- [Nox integration notes](#nox-integration-notes)
- [Documentation](#documentation)
- [License](#license)

## Live deployment (Ethereum Sepolia, chainId 11155111)

Canonical, machine-readable source: [`deployments/sepolia.json`](deployments/sepolia.json). All
five contracts below are verified on Etherscan, Blockscout, and Sourcify.

| Contract | Address | Etherscan |
|---|---|---|
| `MockUSDC` (test ERC-20 backing cUSDC) | `0x68df20bfc035f6496e0593626579d00139aaa49c` | [link](https://sepolia.etherscan.io/address/0x68df20bfc035f6496e0593626579d00139aaa49c#code) |
| `ConfidentialUSDC` (cUSDC, ERC-7984) | `0x45dd58bea3f072ce8cf704a43abc41be27337e4e` | [link](https://sepolia.etherscan.io/address/0x45dd58bea3f072ce8cf704a43abc41be27337e4e#code) |
| `ViewerRegistry` (auditor ACL module) | `0x7f5508360b37f41a6cca6c34aca233500b6c1678` | [link](https://sepolia.etherscan.io/address/0x7f5508360b37f41a6cca6c34aca233500b6c1678#code) |
| `UniswapV3PriceReader` (read-only price adapter) | `0x20f68c8d394dabee5fea08a21a1596eb09c5554e` | [link](https://sepolia.etherscan.io/address/0x20f68c8d394dabee5fea08a21a1596eb09c5554e#code) |
| `AfterHoursDesk` (settlement core) | `0x46b72a2615de7351699dcd5a64b854746a29fdb8` | [link](https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8#code) |

Uniswap reference pool (real, third-party, read-only): WETH/USDC 0.05% —
`0x3289680dd4d6c10bb19b899729cda5eef58aeff1`.

## Repo layout

```
contracts/          Solidity — MockUSDC, ConfidentialUSDC, AfterHoursDesk, ViewerRegistry,
                     UniswapV3PriceReader, interfaces/, mocks/ (test-only, never deployed)
test/unit/           Unit tests against the local Nox offchain stack (Docker)
test/e2e/            See test/e2e/README.md — real E2E proof lives in scripts/e2e/ instead
scripts/deploy/      Ordered deploy scripts, real Sepolia
scripts/e2e/         Standalone, re-runnable E2E proof scripts against LIVE Sepolia
scripts/verify/      verify-all.ts — re-verifies every deployed contract in one run
scripts/utils/       Shared helpers (network guard, Nox Sepolia config, deployments.json I/O, retry)
frontend/            Vite + React + TypeScript + viem client — see frontend/README.md
deployments/         sepolia.json — canonical deployed-address record
feedback.md          Dated, ongoing log of Nox integration friction (read this for the "why")
```

## Setup

Requires Node 22+, Docker running locally (for local unit tests — the Nox offchain stack boots
in containers), and a Sepolia wallet with testnet ETH.

```bash
npm install
```

All secrets (RPC URL, Etherscan API key, deploy/signing private key) live in the Hardhat keystore
— never in a `.env` file:

```bash
npx hardhat keystore set --dev SEPOLIA_RPC_URL
npx hardhat keystore set --dev ETHERSCAN_API_KEY
npx hardhat keystore set --dev DESK_OWNER_PRIVATE_KEY
```

`.env` (see `.env.example`) holds only non-secret values: public addresses, already-deployed
contract addresses (mirrors `deployments/sepolia.json` for convenience).

## Testing

```bash
npm test                      # unit tests, local Nox stack via Docker (23/23 passing)
npm run test:e2e:sepolia      # real E2E against LIVE Sepolia — costs real testnet gas
```

Each `test:e2e:sepolia` step is also runnable standalone (`npm run e2e:wrap-check:sepolia`,
`e2e:settle-check:sepolia`, `e2e:auditor-check:sepolia`, `e2e:price-check:sepolia`) — useful for
re-verifying one phase's flow without re-running everything.

## Deploying (Ethereum Sepolia)

Order matters — later scripts depend on earlier ones' addresses (read from
`deployments/sepolia.json`, written back automatically):

```bash
npm run deploy:mock-usdc:sepolia
npm run deploy:cusdc:sepolia
npm run deploy:viewer-registry:sepolia
npm run deploy:price-reader:sepolia
npm run deploy:desk:sepolia          # wires cUSDC + ViewerRegistry + price oracle together
npm run verify:all:sepolia           # re-verifies every deployed contract, safe to re-run
```

## Running the frontend

Live, already-deployed instance — no setup required: **[after-hours-desk.onrender.com](https://after-hours-desk.onrender.com)**.

To run it locally instead:

```bash
cd frontend
npm install
npm run dev
```

Open the printed `localhost` URL with an injected wallet (MetaMask) on Ethereum Sepolia. The
public tape and Uniswap price strip render real data even before connecting a wallet; submitting
orders, triggering settlement, and the auditor panel require a connected wallet. A "Get testnet
cUSDC" control in the order ticket lets any fresh wallet self-serve (faucet + wrap, chained
automatically) — no pre-funded account or Etherscan required. See [`frontend/README.md`](frontend/README.md)
for the SDK integration details.

## Known limitations (disclosed, not hidden)

- The execution price is read live from a real Uniswap V3 Sepolia pool, using spot price
  (`slot0`), not a TWAP — a deliberate, documented tradeoff (see `feedback.md`): the price is a
  disclosed reference value that never gates real fund movement, so single-block manipulation
  risk is low-stakes here.
- Pro-rata fill allocation across more than one order per side may leave a small integer-division
  dust remainder inside the desk's own balance — documented, not swept, in this hackathon build.

Full reasoning for every non-obvious decision is in [`feedback.md`](feedback.md).

## Nox integration notes

Nox is TEE-based (Intel TDX), not FHE — every `euintN` is an opaque handle, not a homomorphically
encrypted value; arithmetic happens off-chain in a TEE Runner, asynchronously. The single-Runner
architecture means every settlement is a chain of several sequential async jobs, not one atomic
call — the frontend and E2E scripts treat every post-settlement decrypt as fire-and-forget +
poll/retry, never assuming synchronous confirmation. Full details, including several
documentation-vs-shipped-code discrepancies found and worked around, are in [`feedback.md`](feedback.md).

## Documentation

The full documentation site — problem, solution, architecture, user flows, roadmap, and setup
guides — is published at **[ceciliagalvaoo.github.io/after-hours-desk](https://ceciliagalvaoo.github.io/after-hours-desk/)**.

## License

MIT — see [LICENSE](LICENSE).
