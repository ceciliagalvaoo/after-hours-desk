# scripts/

Deploy / interaction scripts, one responsibility per file, in dependency
order — following the same pattern as iExec's own `nox-product-poc` (cVault)
reference.

## `scripts/utils/`

- `network.ts` — `connectSepolia()`: connects to the `sepolia` network
  (hardcoded by name, never trusting `--network`/auto-detection) and asserts
  the live chain id is really `11155111` before returning, failing loudly
  otherwise (Day-1 spike point 2, feedback.md).
- `deployments.ts` — reads/writes `deployments/sepolia.json`, the single
  source of truth for deployed addresses. The frontend must read from this
  file instead of hardcoding addresses, so redeploys never require a
  frontend code change.
- `handleClient.ts` — `createSepoliaHandleClient()`: builds an
  `@iexec-nox/handle` client with EXPLICIT `gatewayUrl` /
  `smartContractAddress` / `subgraphUrl` for Ethereum Sepolia (values
  confirmed against the installed SDK source, see feedback.md Day-1 spike
  2/4) — never relies on chain-id auto-detection.
- `retry.ts` — `withRetries()`: generic poll/retry helper for any
  `decrypt`/`publicDecrypt` call. The Nox pipeline is asynchronous (single
  Runner, real block times on live Sepolia) — never assume synchronous
  confirmation right after a transaction (Day-1 spike point 4).

## `scripts/deploy/`

1. `01-deploy-mock-usdc.ts` — deploys `MockUSDC` (our own test ERC-20),
   mints the initial supply to the deployer, writes `mockUSDC` to
   `deployments/sepolia.json`.
2. `02-deploy-confidential-usdc.ts` — reads `mockUSDC` from
   `deployments/sepolia.json`, deploys `ConfidentialUSDC` wrapping it, writes
   `confidentialUSDC`.
3. `03-deploy-after-hours-desk.ts` — Phase 2 deploy of `AfterHoursDesk`
   (single constructor arg, `cUSDCAddress`). SUPERSEDED by step 5 below once
   Phase 3 changed the constructor signature — kept only for history/
   reference (npm alias renamed to `deploy:desk-v1-phase2:sepolia` so it is
   never run by accident). See feedback.md, Fase 3.
4. `04-deploy-viewer-registry.ts` — deploys `ViewerRegistry` (Phase 3,
   compliance-viewer ACL module). Only depends on a `complianceViewer`
   address (no dependency on `AfterHoursDesk` at all — see
   `ViewerRegistry.sol` for why), so it deploys BEFORE the desk. Writes
   `viewerRegistry` and `complianceViewer` to `deployments/sepolia.json`.
5. `05-deploy-after-hours-desk.ts` — Phase 3 (re)deploy of `AfterHoursDesk`,
   taking BOTH `confidentialUSDC` and `viewerRegistry` as constructor args.
   SUPERSEDED by step 7 below once Phase 4 added a third constructor arg —
   kept only for history (npm alias renamed to `deploy:desk-v2-phase3:sepolia`).
6. `06-deploy-uniswap-price-reader.ts` — Phase 4: deploys
   `UniswapV3PriceReader` pointed at the real, verified, liquid Uniswap V3
   WETH/USDC pool on Ethereum Sepolia (`0x3289680dd4d6c10bb19b899729cda5eef58aeff1`
   — see feedback.md, Fase 4, for the liquidity research). Writes
   `uniswapPool` and `priceOracle` to `deployments/sepolia.json`. Has NO
   dependency on any other contract here — reusable indefinitely across
   future desk redeploys.
7. `07-deploy-after-hours-desk.ts` — Phase 4 (re)deploy of `AfterHoursDesk`,
   now taking `confidentialUSDC`, `viewerRegistry`, AND `priceOracle` as
   constructor args. REQUIRES a FRESH (unpaired) `viewerRegistry` — re-run
   `04-deploy-viewer-registry.ts` first (`ViewerRegistry.setDesk` is a
   one-time setter; the Phase-3 registry is already permanently paired to
   the Phase-3 desk — see feedback.md, Fase 4, "friction real"). This
   script refuses to proceed otherwise. This is the current, authoritative
   `afterHoursDesk` address.

Run with `npx hardhat run scripts/deploy/01-deploy-mock-usdc.ts --network sepolia`,
then each subsequent script the same way, in numeric order.

Deployed today (live Ethereum Sepolia) — see `deployments/sepolia.json`
for the authoritative copy:
- `MockUSDC`: `0x68df20bfc035f6496e0593626579d00139aaa49c`
- `ConfidentialUSDC` (cUSDC): `0x45dd58bea3f072ce8cf704a43abc41be27337e4e`
- `ViewerRegistry`: `0x7f5508360b37f41a6cca6c34aca233500b6c1678`
- `UniswapV3PriceReader`: `0x20f68c8d394dabee5fea08a21a1596eb09c5554e`
  (real pool: `0x3289680dd4d6c10bb19b899729cda5eef58aeff1`, WETH/USDC 0.05%)
- `AfterHoursDesk` (Phase 4): `0x46b72a2615de7351699dcd5a64b854746a29fdb8`

## `scripts/e2e/`

- `wrap-check.sepolia.ts` — real, non-mocked Phase 1 sanity check against
  LIVE Sepolia: faucet + approve + wrap a plaintext mUSDC amount into cUSDC,
  then decrypt the resulting confidential balance via the real Handle
  Gateway and assert it matches 1:1. Run with
  `npx hardhat run scripts/e2e/wrap-check.sepolia.ts --network sepolia`.
- `settle-check.sepolia.ts` — real, non-mocked Phase 2 sanity check:
  submit BUY + SELL orders, `settleBatch()`, decrypt the matched amount and
  both residuals — against the (now-superseded) Phase 2 `AfterHoursDesk`.
- `auditor-check.sepolia.ts` — real, non-mocked Phase 3 sanity check
  against the (now-superseded) Phase 3 `AfterHoursDesk`/`ViewerRegistry`:
  submit BUY + SELL, `settleBatch()`, then prove `ViewerRegistry.registerFill`
  really executed by reading its `FillRegistered` event straight from the
  settlement transaction's own logs, and decrypt both fill handles.
  Documents, rather than hides, the single-funded-account limitation
  (trader == auditor here) — see the script's own docstring and
  feedback.md, Fase 3.
- `price-check.sepolia.ts` — real, non-mocked Phase 4 sanity check against
  the current `AfterHoursDesk`/`UniswapV3PriceReader`: submit BUY + SELL
  (fully matched), `settleBatch()`, decrypt the execution price, and cross-
  check it against a SECOND, independent, separate call to
  `priceOracle.getReferencePrice()` made after settlement — not just
  trusting the desk's own accounting. Explicitly tolerates (and flags,
  rather than silently accepting) small drift from the real pool's spot
  price moving between the settle tx and the independent check.

Every script that talks to the Nox Handle Gateway/subgraph MUST force
explicit Ethereum Sepolia config (`gatewayUrl`, `smartContractAddress`,
`subgraphUrl`) rather than relying on chain-id auto-detection — see
`feedback.md`, Day-1 spike point 2.
