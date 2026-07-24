---
sidebar_position: 5
---

# Nox Integration

This page distills the real, hands-on findings from building on Nox for this project. The full,
dated, entry-by-entry log — including every source consulted and every decision made because of
it — lives in [`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md)
at the repo root, updated continuously across every phase of building this, not written the night
before submission.

## Nox is TEE-based, not FHE — and that changes how you think about it

The syntax (`euint256`, etc.) looks similar to fully-homomorphic-encryption toolkits, but the
semantics are different: a Nox `euintN` is an opaque 32-byte **handle** — a pointer to ciphertext
stored off-chain — not a homomorphically encrypted integer you can compute on directly on-chain.
Every arithmetic primitive (`add`, `safeAdd`, `lt`, `select`, …) emits an event on-chain and is
actually computed **later, off-chain, inside a TEE Runner** (Intel TDX). Understanding this
asynchronous, event-driven flow up front shapes almost every other design decision in this project.

## There is no "custom confidential function" yet — compose primitives instead

The Solidity SDK's "Custom Functions" section is explicitly marked "Coming Soon." A settlement
contract can't have one opaque `settleBatch()` call that runs arbitrary custom logic inside the
TEE — it has to be **composed** from the fixed primitive set: arithmetic (`add/sub/mul/div`), safe
arithmetic (`safeAdd/safeSub/safeMul/safeDiv`, which return a success `ebool` instead of ever
reverting or silently wrapping), comparisons (`eq/ne/lt/le/gt/ge`), `select` (the only branch
primitive over encrypted data), and token operations (`transfer/mint/burn`). This was verified
empirically before any production contract was written: a throwaway spike contract ran the full
`safeAdd → lt+select → safeSub` chain against the real local Nox stack and produced correct
decrypted results before `AfterHoursDesk.sol` existed at all.

## Only five types are actually usable today

`encryptInput` (and every primitive) supports exactly `bool`, `uint16`, `uint256`, `int16`, and
`int256` at runtime — confirmed by reading the SDK's own source, not assumed from the docs (which
in one place show a code sample encrypting an `address`, directly above the paragraph saying
`address` isn't supported yet — a real documentation/shipped-code mismatch). This shaped the order
schema directly: amount is a confidential `uint256`; trader address, order id, and side stay public.

## Handles leak into the void until you explicitly say otherwise

A freshly created handle is transient-only by default (valid for the current transaction, then
gone). Anything meant to survive past the current transaction, or be decryptable by a specific
account, needs an explicit `Nox.allowThis()` / `Nox.allow()` / `Nox.addViewer()` call **before the
function returns**. This is the single most common way to accidentally build something that looks
confidential but silently isn't — every new handle in this codebase is traced back to its explicit
ACL grant, and it's the first thing checked in every internal review pass.

## A non-obvious cross-contract ACL requirement

Calling `ConfidentialUSDC.confidentialTransferFrom`/`confidentialTransfer` with a handle the
*calling* contract just computed is not, on its own, enough. The token contract's internal
`Nox.transfer` call executes with the token contract itself as `msg.sender` from NoxCompute's
perspective — not the caller. The caller must explicitly grant the token contract *transient*
access to that specific handle first (`Nox.allowTransient(handle, address(token))`), immediately
before the transfer call, or it reverts deep inside the token contract with `NotAllowed`. This
pattern recurs anywhere one confidential contract hands a handle to another (it was needed a second
time, independently, wiring the compliance-viewer registry) — and was confirmed against iExec's own
reference implementation before being trusted, not invented from scratch.

## The single Runner means real, visible, sequential latency

The current Nox deployment runs one Runner, processing jobs sequentially — this is documented
roadmap-not-shipped, not a bug. A batch settlement chains multiple primitives (sums, comparisons,
pro-rata math, real transfers) — even the simplest one-buy/one-sell case is a chain of roughly
10-12 sequential off-chain jobs, not one atomic call. Every part of this project that reads a
result right after a transaction — the frontend, the E2E scripts — treats decryption as
fire-and-forget followed by poll/retry, never assuming synchronous confirmation. In practice,
measured against the live deployment, this settled in a handful of seconds per decrypt — comfortably
inside the retry budget built for it, not the pessimistic worst case originally planned for.

## Never trust chain-ID auto-detection

The SDK's own published documentation warns that full Ethereum Sepolia support is "upcoming" and
that auto-detection may still resolve to Arbitrum Sepolia. In practice, the installed SDK version
already ships a working Sepolia config — but this project never relies on that: every handle client
is constructed with an explicit `gatewayUrl`/`smartContractAddress`/`subgraphUrl`, and every script
asserts the connected chain ID at startup, so a future SDK regression can't silently redirect
activity to the wrong network.

## Public RPC providers are not interchangeable for `eth_getLogs`

A real, live debugging story: the frontend's public reads originally used a commonly-cited free
Sepolia RPC that turned out to reject almost any `eth_getLogs` call spanning more than roughly 150
blocks with "Archive requests require a personal token" — regardless of how recent the range was.
This was diagnosed with direct `curl` bisection against the real endpoint, not guessed at, and
fixed by switching to a different free provider confirmed to serve the exact range this app needs
against the real deployed contracts.

## Read the full log

This page is a distillation. The complete, dated, phase-by-phase account — including every source
URL, every package version pinned and why, every dead end investigated before being ruled out, and
every self-correction made after an internal review — is
[`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md) in the
repository root.
