---
sidebar_position: 2
---

# Problem & Solution

## The problem: on-chain markets are radically transparent, and that's not always good

Every order on a public AMM or order book is visible the instant it hits the mempool. For retail
swaps this is a minor annoyance (some slippage, maybe a sandwich attack). For anything that looks
like **institutional-size OTC trading**, full transparency is disqualifying:

- **Front-running / MEV.** A visible large order is a free option for anyone watching the mempool
  — they can trade ahead of it and extract value from the trader who revealed their intent.
- **Information leakage.** Even *after* a trade settles, a fully public order size tells every
  counterparty, competitor, and observer exactly how large a position someone is building or
  unwinding — information that has real value and real cost when leaked.
- **No institutional path.** A trading desk that has to expose every order size to the entire
  chain before it settles is not a desk any real institution can use for size. This is precisely
  why OTC / dark-pool trading exists in traditional finance — and precisely what's missing from
  public DeFi.

The obvious "fix" — take the whole system off-chain — throws away the thing that makes DeFi
valuable in the first place: composability, verifiability, and a real settlement layer nobody
controls. What's needed is confidentiality **without** leaving the chain.

## Why this is hard

Confidentiality on a public blockchain is a genuinely hard problem, and most "solutions" cheat in
one of two ways:

1. **Move the order flow off-chain entirely** (a centralized matching engine, a permissioned relay)
   and only settle the net result on-chain. This reintroduces a trusted third party — exactly what
   a dark pool built *on* a blockchain is supposed to avoid.
2. **Encrypt on-chain data with a scheme that can't actually compute on it** — so the "confidential"
   contract still has to decrypt everything to do anything, at which point the confidentiality was
   theater.

## The solution: Nox

[Nox](https://docs.iex.ec/nox-protocol/getting-started/welcome) (iExec) takes a third path: **Trusted
Execution Environments (TEE)**, not homomorphic encryption. Order data is encrypted client-side,
submitted as an opaque 32-byte handle on-chain, and the actual arithmetic — sums, comparisons,
transfers — runs **off-chain, inside a hardware-attested enclave (Intel TDX)**, which is the only
place plaintext ever exists, and only transiently, in enclave memory. The chain never sees a
plaintext order size; the enclave never persists one either.

This lets **After Hours Desk** do something a plain smart contract cannot: net a batch of encrypted
buy and sell orders — compute `min(sum(buys), sum(sells))`, allocate pro-rata fills, move real
token balances — **without any party, including the desk operator, ever seeing an individual order
size.** Only the aggregate matched quantity and the (real, live) execution price are ever revealed,
and only after settlement, by design — the exact shape of information a dark pool is supposed to
disclose, and no more.

## Why this isn't just a private swap

The hackathon brief specifically asks builders to add privacy to **existing, public-by-design
infrastructure** without breaking its composability — not to build a closed, privacy-only silo.
After Hours Desk does this literally: its execution price is read live from a real, public,
unmodified Uniswap V3 pool on Sepolia (`UniswapV3PriceReader.sol` — a `view`-only adapter with no
mutating surface even reachable). The dark pool composes with public DeFi for pricing while
keeping its own order flow confidential — it doesn't fork Uniswap, doesn't wrap it in a privacy
shell, just reads its real, public price the same way any other contract could.

## Who this is for

- **Traders** who need to move size without broadcasting intent to the whole chain.
- **Compliance / auditors** who need a real, enforceable, on-chain guarantee that *someone*
  designated can always see everything for regulatory purposes — without that visibility extending
  to every other participant.
- **Anyone building confidential DeFi on Nox** looking for a worked example of composing Nox's
  primitive set (not a "custom confidential function," which doesn't exist yet) into a real
  settlement engine, plus the ACL patterns that make selective disclosure actually enforceable
  on-chain rather than a UI-layer promise.
