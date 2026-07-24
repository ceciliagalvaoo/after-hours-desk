# test/e2e/

Deliberately empty — the real, live-Sepolia E2E proof for this project lives in
`scripts/e2e/*.sepolia.ts` instead of `test/e2e/*.test.ts`.

**Why scripts instead of Hardhat test files:** each phase's E2E proof
(`wrap-check`, `settle-check`, `auditor-check`, `price-check`) is a standalone,
idempotent, re-runnable Node script (`hardhat run scripts/e2e/<name>.sepolia.ts
--network sepolia`) that performs real transactions, real `encryptInput`/
`decrypt`/`publicDecrypt` calls against the real Sepolia deployment, and
`throw`s on any mismatch — the same correctness guarantee a `hardhat test`
assertion would give, but runnable independently (useful for re-verifying one
phase's flow without re-running everything, and for a judge/reviewer to run
directly with `npm run e2e:<name>:sepolia`). See feedback.md, Fases 1-5, for
each script's real recorded output (transaction hashes, decrypted values).

`npm run test:e2e:sepolia` runs all four in sequence.

Expect visible latency here (Day-1 spike point 4: single Runner, sequential
job processing) — every script polls `decrypt`/`publicDecrypt` with retries
rather than assuming synchronous confirmation right after a transaction.
