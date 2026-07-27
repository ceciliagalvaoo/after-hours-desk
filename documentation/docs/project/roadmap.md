---
sidebar_position: 7
---

# Roadmap

This hackathon build proves the whole mechanism end to end on real infrastructure — public where it
should be, sealed where it must be. A production version would extend it in these directions, roughly
in priority order.

![The Broker: what's next](/img/broker/talk.gif)

:::note[Disclosed, not hidden]

Everything below is a *known* limitation of the hackathon scope, documented on purpose. Nothing here
is a surprise found after the fact — each item was a deliberate line drawn to ship a real, honest
demo on real infrastructure.

:::

## Near-term

- **TWAP execution pricing.** The current reader uses spot price (`slot0`) — a deliberate,
  disclosed hackathon-scope tradeoff. A production version would read a genuine time-weighted
  average via `observe()`, which the reference pool already supports; this needs
  `TickMath`/`FullMath`-equivalent math compatible with this project's Solidity version (the
  originals are pinned to `pragma solidity <0.8.0`).
- **Multi-order-per-side dust sweep.** Pro-rata fill allocation across more than one order per side
  can leave a small integer-division remainder inside the desk's own balance. Documented, not
  swept, in this build — a production version would reconcile it, likely by rolling the dust
  forward into the next batch.
- **Shortfall reconciliation.** `submitOrder` cannot check a buyer's real confidential balance at
  submission time (reading a plaintext balance behind an encrypted value isn't possible without its
  own async round trip) — only that the desk is authorized as an operator. If a buyer's real
  balance is short at settlement, `confidentialTransferFrom` silently moves less than expected
  (preserving the "never leak insufficient-balance via a revert" property) without reconciling the
  shortfall across matched sellers. A production version needs an explicit escrow-on-submit or
  reconciliation step.
- **A real subgraph/indexer.** The tape currently reconstructs history live via chunked
  `eth_getLogs` on every page load — fine for a hackathon's lifetime of activity, not for a
  production order book's history. A dedicated indexer (or the Nox subgraph, once general-purpose)
  replaces this without changing the on-chain contracts at all.

## Medium-term

- **Compliance-viewer rotation, done properly.** `ViewerRegistry.complianceViewer` is immutable
  today because Nox ACL grants are irrevocable — a real rotation feature needs the documented
  "fresh handle" migration pattern (`Nox.add(handle, Nox.toEuint256(0))` + repointing storage) to
  actually stop a departing auditor from decrypting *future* fills, tested properly rather than
  half-built.
- **Batching efficiency.** Every settlement today is its own chain of sequential off-chain Runner
  jobs. As Nox's own roadmap moves from a single Runner toward multiple Runners coordinated by a
  TDX orchestrator, larger batches settle with much less aggregate latency — the contract-level
  design (composed primitives, not a custom opaque function) is already positioned to benefit
  without changes once that ships.
- **Custom confidential functions.** Nox's own roadmap lists "Custom Functions" (composing
  primitives into a named, reusable confidential function) as coming soon. `settleBatch()`'s
  primitive chain is a natural candidate to become one first-class call once that's available,
  simplifying both the contract and its gas profile.

## Longer-term

- **Multi-asset dark pool.** The current desk nets a single confidential asset pair. Extending to
  arbitrary ERC-7984 pairs, with the price reference generalized beyond one hardcoded Uniswap pool,
  turns this from a proof of concept into a general confidential OTC venue.
- **Institutional onboarding.** KYC/allowlisting at the operator layer, configurable
  compliance-viewer sets (more than one auditor address, different visibility tiers), and formal
  audit of the settlement math are the standard path from "hackathon-grade" to "something a
  regulated desk actually deploys."
