---
sidebar_position: 6
---

# Setup & Deployment

Everything below runs the real project: the same contracts and frontend already live on Sepolia.

## Prerequisites

- Node 22+
- Docker running locally (only needed for local unit tests, the Nox offchain stack boots in
  containers on first run)
- A Sepolia wallet with testnet ETH, if you plan to deploy or run the live E2E scripts yourself

## Install

```bash
git clone https://github.com/ceciliagalvaoo/after-hours-desk.git
cd after-hours-desk
npm install
```

## Secrets

Every secret (RPC URL, Etherscan API key, deploy/signing private key) lives in the Hardhat
keystore, never in a plaintext `.env` file:

```bash
npx hardhat keystore set --dev SEPOLIA_RPC_URL
npx hardhat keystore set --dev ETHERSCAN_API_KEY
npx hardhat keystore set --dev DESK_OWNER_PRIVATE_KEY
```

`.env` (see `.env.example`) is reserved for non-secret values only: public addresses, already
deployed contract addresses (mirrors `deployments/sepolia.json` for convenience).

## Run the unit tests

```bash
npm test
```

![The Broker: green across the board](/img/broker/smile.gif)

23/23 tests pass against the local Nox offchain stack (Docker Compose: KMS, Ingestor, Runner,
Handle Gateway, NATS, S3-compatible storage, booted automatically by the `nox-hardhat-plugin`
test override). This includes real multi-account ACL isolation tests: a compliance viewer that
decrypts every fill, traders that decrypt only their own, and a stranger account that decrypts
nothing.

## Run the E2E proof against live Sepolia

```bash
npm run test:e2e:sepolia
```

:::warning[Real gas, real network]

The E2E scripts run against the live Sepolia deployment, every step is a real transaction and
spends real testnet gas. Fund the wallet you configured before running them.

:::

This runs four real, standalone, idempotent scripts in sequence against the actual live
deployment, real gas is spent:

```bash
npm run e2e:wrap-check:sepolia      # faucet → approve → wrap, decrypt the resulting balance
npm run e2e:settle-check:sepolia    # submitOrder (both sides) → settleBatch → decrypt the fill
npm run e2e:auditor-check:sepolia   # same flow, proving ViewerRegistry.registerFill fired for real
npm run e2e:price-check:sepolia     # settlement using the real live Uniswap execution price
```

## Deploy your own instance

Order matters: later scripts read earlier ones' addresses from `deployments/sepolia.json` and
write their own back automatically:

```bash
npm run deploy:mock-usdc:sepolia
npm run deploy:cusdc:sepolia
npm run deploy:viewer-registry:sepolia
npm run deploy:price-reader:sepolia
npm run deploy:desk:sepolia          # wires cUSDC + ViewerRegistry + the price oracle together
npm run verify:all:sepolia           # verifies every deployed contract on Etherscan/Blockscout/Sourcify
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed `localhost` URL with an injected wallet (MetaMask) on Ethereum Sepolia. The public
tape and Uniswap price strip work immediately, with no wallet connected, public by design, while
the size behind every order stays sealed regardless of who's looking. A "Get testnet cUSDC"
control in the order ticket lets any fresh wallet self-serve real testnet funds (faucet + wrap,
chained automatically) without touching Etherscan directly.

See [`frontend/README.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/frontend/README.md)
in the repository for the full SDK integration details.
