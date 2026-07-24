# contracts/

Phase 1 (cToken, the base) is done and deployed to Ethereum Sepolia — see
`deployments/sepolia.json` for live addresses.

- `MockUSDC.sol` — our own test ERC-20 (6 decimals, USDC convention), backing
  `ConfidentialUSDC`. Deliberately NOT a third-party Sepolia test-USDC — see
  feedback.md ("Own test token instead of third-party USDC") for why. Public,
  permissionless `faucet(to, amount)` capped at `FAUCET_CAP` per call.
- `ConfidentialUSDC.sol` — ERC-7984 confidential wrapper (`cUSDC`) around
  `MockUSDC`, built on `ERC20ToERC7984Wrapper` from
  `@iexec-nox/nox-confidential-contracts@0.2.2`. Confirmed against the real
  installed source (not memory/assumption) — see the docstring in the file
  itself for the exact files read. 1:1 wrap/unwrap; no custom ACL/`_update`
  logic added on top since the base contract already handles
  `allowThis`/`allow`/`allowPublicDecryption` correctly for every handle it
  creates (mint balance -> persistent `allow` to recipient; unwrap burn
  amount -> `allowPublicDecryption`, since it's leaving the confidential
  system as a plain ERC-20 transfer).

Phase 2 (`AfterHoursDesk.sol`, the settlement core) is also done — composed-
primitives netting (Plan A), real cUSDC movement via `confidentialTransferFrom`/
`confidentialTransfer`. See feedback.md, "[Fase 2] AfterHoursDesk.sol —
resultado final".

Phase 3 (ACL/viewer module) is also done:

- `ViewerRegistry.sol` + `interfaces/IViewerRegistry.sol` — standalone
  compliance-viewer ACL module. `complianceViewer` is `immutable`, set once
  at deploy (rotation deliberately NOT built — Nox viewer/admin grants are
  irrevocable, see feedback.md, Fase 3, for why a half-working rotation
  feature was rejected). `registerFill(euint256 fill)` grants the
  compliance viewer VIEWER-role access (`Nox.addViewer`) over every fill —
  never the underlying order `amount`/`residual`. No explicit `onlyDesk`
  caller gate: Nox's own ACL layer (`onlyAllowed(handle)` inside
  `NoxCompute`) already makes an out-of-flow call fail on its own — see the
  contract-level docstring and `test/unit/ViewerRegistry.test.ts`.
- `AfterHoursDesk.sol` gained a persisted `Order.fill` field (a real gap
  found this phase — `fill` was computed and ACL'd but discarded, never
  exposed — see feedback.md, Fase 3, "gap real") and a second constructor
  argument (`viewerRegistryAddress`), which forced a redeploy — see
  `deployments/sepolia.json` for the current (Phase 3) address, and
  feedback.md for the superseded Phase 2 address.

Phase 4 (Uniswap price reference) is also done:

- Research confirmed a REAL, verified Uniswap V3 pool with genuine liquidity
  on Ethereum Sepolia — `0x3289680dd4d6c10bb19b899729cda5eef58aeff1`
  (WETH/USDC, 0.05% fee tier; ~2.98M USDC + ~147 WETH pool balances, non-zero
  `liquidity()`, confirmed via `network.connect("sepoliaFork")` against live
  Sepolia state, not documentation). Given real liquidity, the documented
  same-shaped fallback (an own-deployed contract implementing the same
  `IUniswapPriceOracle` interface) was NOT needed/built — see feedback.md,
  Fase 4.
- `interfaces/IUniswapPriceOracle.sol` — minimal, source-agnostic
  `getReferencePrice() view returns (uint256)` interface.
  `interfaces/IUniswapV3PoolMinimal.sol` — the minimal REAL Uniswap V3 pool
  ABI slice needed (`slot0`/`token0`/`token1` only — no mutating functions
  even declared, so nothing in this codebase can accidentally call one).
- `UniswapV3PriceReader.sol` — real, read-only adapter over the pool above.
  Uses CURRENT SPOT price (`slot0().sqrtPriceX96`), not a TWAP, even though
  the pool's `observe()` was confirmed to work — see the contract's
  docstring and feedback.md, Fase 4, for the full spot-vs-TWAP reasoning
  (short version: the execution price is a disclosed reference/reporting
  value that never gates settlement math, and a genuine TWAP would require
  importing Uniswap's own `TickMath`/`FullMath`, both pinned to
  `pragma solidity <0.8.0`, which would need a second solc compiler version
  added to this project for one read-only helper). The safe squaring/
  division math is a documented port of Uniswap's own
  `OracleLibrary.getQuoteAtTick` body, using OpenZeppelin's `Math.mulDiv`
  (already a dependency) instead of Uniswap's `FullMath.mulDiv` — same
  full-precision semantics, no extra dependency.
- `contracts/mocks/MockPriceOracle.sol` — TEST-ONLY `IUniswapPriceOracle`
  double, used exclusively by `test/unit/AfterHoursDesk.test.ts` /
  `test/unit/ViewerRegistry.test.ts` (which run against the local Nox
  offchain stack, not a Sepolia fork, so cannot reach the real pool). Never
  deployed to Sepolia — no entry in `deployments/sepolia.json`, no deploy
  script targets it.
- `AfterHoursDesk.sol` gained a third constructor argument
  (`priceOracleAddress`) and `_placeholderExecutionPriceHandle` was replaced
  by `_executionPriceHandle()`, which calls the real oracle — forcing
  another redeploy (and, because `ViewerRegistry.setDesk` is a one-time
  setter, a FRESH `ViewerRegistry` too — see feedback.md, Fase 4, "real
  friction" for why). Current addresses in `deployments/sepolia.json`.

`NoxCompute.sol` itself is never copied here — it's pulled from
`@iexec-nox/nox-protocol-contracts` (already deployed on Sepolia at
`0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf`) via the `Nox` Solidity library.
