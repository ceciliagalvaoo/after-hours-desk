# test/unit/

Runs against the local Nox offchain stack (Docker Compose, spun up
automatically by `@iexec-nox/nox-hardhat-plugin`'s `hardhat test` override —
`skipTestOverride: false` in `hardhat.config.ts`).

- `MockUSDC.test.ts` / `ConfidentialUSDC.test.ts` — Phase 1 (cToken).
- `AfterHoursDesk.test.ts` — Phase 2/4: composed-primitives netting (Plan A) +
  real cUSDC settlement, two distinct local accounts (buyer/seller), plus a
  Phase-4 test proving `settleBatch()` reads its (test-only `MockPriceOracle`)
  price oracle LIVE at settlement time, not once at deploy.
- `ViewerRegistry.test.ts` — Phase 3: compliance-viewer ACL wiring, FOUR
  distinct local accounts (buyer/seller/auditor/stranger) — proves the
  auditor decrypts BOTH fills, each trader decrypts only their OWN fill,
  the auditor canNOT decrypt residuals (least privilege), and a stranger
  with zero ACL decrypts NOTHING. See feedback.md, Fase 3.
- `UniswapV3PriceReader.test.ts` — Phase 4: runs against
  `network.connect("sepoliaFork")` (an EDR fork of LIVE Ethereum Sepolia),
  NOT the local Nox stack — this contract has nothing to do with encrypted
  handles, it's a plain read over a REAL, verified Uniswap V3 pool
  (WETH/USDC, 0.05% fee). Cross-checks the contract's `getReferencePrice()`
  against an independently-written TypeScript re-derivation of the same
  formula. See feedback.md, Fase 4.

`AfterHoursDesk.test.ts`/`ViewerRegistry.test.ts` use
`contracts/mocks/MockPriceOracle.sol` (TEST-ONLY, never deployed to Sepolia)
as the desk's price oracle — those suites are about netting/ACL, not
price-oracle correctness, which is `UniswapV3PriceReader.test.ts`'s job.

Run with `npx hardhat test test/unit/*.test.ts` (the glob must be
shell-expanded, NOT passed as a literal directory — see feedback.md,
"[Fase 1] Bug de scaffold da Fase 0").
