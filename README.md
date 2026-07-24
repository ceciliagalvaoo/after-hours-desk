# After Hours Desk

A confidential OTC / dark-pool settlement desk built on **Nox** (iExec's confidential
computation layer), deployed on **Ethereum Sepolia**, referencing a real public Uniswap V3 pool
for price. Built for the **iExec WTF Hackathon (Summer Edition)**.

Traders submit encrypted order sizes (client-side `encryptInput`, never a plaintext amount on
calldata). `AfterHoursDesk.sol` nets a batch's buy/sell sides entirely from composed Nox
primitives (`safeAdd`, `lt`/`select`, `safeMul`/`safeDiv`/`safeSub`) and moves real confidential
`cUSDC` balances between traders. Only the aggregate matched quantity and the execution price —
read live from a real Uniswap V3 Sepolia pool — are ever publicly decryptable; individual order
sizes and per-trader fills never are. A compliance-viewer address (the "auditor") can decrypt
every fill; each trader can only decrypt their own.

No mocked UI data anywhere in the reachable path — every number on screen is a real Sepolia
contract read or a real Nox `decrypt`/`publicDecrypt`. See `feedback.md` for the full, dated log
of Nox integration friction encountered building this, and `video-script.md` for the demo script.

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
video-script.md      4-minute demo script (filled in as the product is actually used)
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
npm test                      # unit tests, local Nox stack via Docker (16/16 passing)
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

```bash
cd frontend
npm install
npm run dev
```

Open the printed `localhost` URL with an injected wallet (MetaMask) on Ethereum Sepolia. The
public tape and Uniswap price strip render real data even before connecting a wallet; submitting
orders, triggering settlement, and the auditor panel require a connected wallet. See
`frontend/README.md` for the SDK integration details and the known single/second-account
limitation.

## Known limitations (disclosed, not hidden — see `feedback.md` for the full reasoning)

- The compliance-viewer ("auditor") role and the primary trader share the same funded Sepolia
  account in the automated E2E scripts — a testnet funds limitation, not mocked data. Genuine
  multi-account ACL isolation (auditor decrypts both fills; each trader decrypts only their own;
  a stranger decrypts neither) is proven for real in `test/unit/ViewerRegistry.test.ts` using the
  local Nox stack's free multi-account support.
- The execution price is read live from a real Uniswap V3 Sepolia pool, using spot price
  (`slot0`), not a TWAP — a deliberate, documented tradeoff (see `feedback.md`, Fase 4): the price
  is a disclosed reference value that never gates real fund movement, so single-block
  manipulation risk is low-stakes here.

## Nox integration notes

Nox is TEE-based (Intel TDX), not FHE — every `euintN` is an opaque handle, not a homomorphically
encrypted value; arithmetic happens off-chain in a TEE Runner, asynchronously. The single-Runner
architecture means every settlement is a chain of several sequential async jobs, not one atomic
call — the frontend and E2E scripts treat every post-settlement decrypt as fire-and-forget +
poll/retry, never assuming synchronous confirmation. Full details, including several
documentation-vs-shipped-code discrepancies found and worked around, are in `feedback.md`.
