# Nox Integration

This page distills the real, hands-on findings from building on Nox for this project. The full,
dated, entry-by-entry log, including every source consulted and every decision made because of
it, lives in [`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md)
at the repo root, updated continuously across every phase of building this.

## Nox is TEE-based, not FHE, and that changes how you think about it

The syntax (`euint256`, etc.) looks similar to fully-homomorphic-encryption toolkits, but the
semantics are different: a Nox `euintN` is an opaque 32-byte **handle**, a pointer to ciphertext
stored off-chain, not a homomorphically encrypted integer you can compute on directly on-chain.
Every arithmetic primitive (`add`, `safeAdd`, `lt`, `select`, …) emits an event on-chain and is
actually computed **later, off-chain, inside a TEE Runner** (Intel TDX). Understanding this
asynchronous, event-driven flow up front shapes almost every other design decision in this project.

![The Broker walks through Nox](../../static/img/broker/talk.gif)

> [!IMPORTANT]
> **TEE, not FHE**
>
> A Nox `euintN` is a pointer to ciphertext held off-chain, not a homomorphically encrypted integer you
> compute on directly. The math runs inside a hardware-attested enclave, the one place plaintext ever
> materializes, and only transiently.

## What actually happens between a transaction and a decrypted result

Six components sit behind every primitive call in the [architecture diagram](./architecture.md),
and understanding the pipeline between them explains why a handle can exist on-chain with no
ciphertext behind it yet, seconds after the transaction that created it:

1. **Input.** `encryptInput`, run client-side, has the Handle Gateway ECIES-encrypt the value with
   the KMS's public key and return `{handle, handleProof}`. The transaction that follows validates
   the proof via `Nox.fromExternal`, computes a *deterministic* handle for the result, grants
   transient ACL on it, and emits an event, and that's the whole transaction. It's mined. The
   result's ciphertext does not exist anywhere yet.
2. **Compute.** The **Ingestor** (Rust, TDX) polls new blocks, groups events by transaction, and
   publishes each as a job to **NATS JetStream**. The **Runner** (Rust, inside an Intel TDX
   enclave, currently a single instance, processing jobs strictly sequentially) pulls the job,
   fetches the encrypted operands from the **Handle Gateway** via a KMS decryption delegation,
   decrypts them *only inside enclave memory*, executes the primitive, re-encrypts the result, and
   acknowledges the job.
3. **Output.** A `decrypt`/`publicDecrypt` call checks the on-chain ACL against the requester's
   address, and the **KMS** performs a decryption delegation: it computes a shared secret and
   RSA-OAEP-encrypts it to the requester's ephemeral key. The KMS itself never sees plaintext at
   any point in this pipeline; only the Runner's enclave memory ever does, and only transiently.

This is exactly why every part of this project that reads a result right after a transaction, the
frontend, the E2E scripts, treats decryption as fire-and-forget followed by poll/retry rather than
assuming synchronous confirmation: a chain of primitives (sums, comparisons, pro-rata math, real
transfers, as in `settleBatch()`) is a chain of *sequential round-trips through this exact pipeline*,
not one atomic in-transaction computation.

## Client-side encryption is the only safe pattern: Pattern A, never Pattern B

There are two ways a private value could reach a contract, and only one of them is actually
private, even though both can look identical if you only glance at the Solidity parameter type.

- **Pattern A (used everywhere in this project).** The value is encrypted client-side via
  `handleClient.encryptInput()` *before* the transaction is even built. Only the resulting
  `{handle, handleProof}` pair ever appears in calldata; the contract validates it with
  `Nox.fromExternal()`. The plaintext never exists outside the browser and, later, the Runner's
  enclave memory.
- **Pattern B (a real leak, not a style nit).** A raw plaintext value is passed as a normal function
  argument and the contract calls `Nox.toEuint256()` (or the equivalent for its type) on it
  internally. The function signature can look exactly as "confidential" as Pattern A's, same
  `euint256` storage, same downstream primitives, but the plaintext already sat in calldata,
  visible to anyone watching the mempool, before the contract ever touched it. `Nox.toEuint256()`
  and its siblings exist for wrapping *constants* and already-public state, not for laundering a
  value that was supposed to stay private.

Every field in this project that must stay private, order amount, is checked against this
distinction specifically, not just typed as `euint256` and assumed safe on the strength of the type
alone.

> [!CAUTION]
> **Pattern B looks confidential and isn't**
>
> Passing a raw plaintext value and calling `Nox.toEuint256()` inside the contract yields the same
> `euint256` storage and the same downstream primitives, but the plaintext already sat in calldata,
> visible to the whole mempool, before the contract ran. Same-looking signature, real leak.

## There is no "custom confidential function" yet: compose primitives instead

The Solidity SDK's "Custom Functions" section is explicitly marked "Coming Soon." A settlement
contract can't have one opaque `settleBatch()` call that runs arbitrary custom logic inside the
TEE, it has to be **composed** from the fixed primitive set: arithmetic (`add/sub/mul/div`), safe
arithmetic (`safeAdd/safeSub/safeMul/safeDiv`, which return a success `ebool` instead of ever
reverting or silently wrapping), comparisons (`eq/ne/lt/le/gt/ge`), `select` (the only branch
primitive over encrypted data), and token operations (`transfer/mint/burn`). This was verified
empirically before any production contract was written: a throwaway spike contract ran the full
`safeAdd → lt+select → safeSub` chain against the real local Nox stack and produced correct
decrypted results before `AfterHoursDesk.sol` existed at all.

This composed-primitives design (call it **Plan A**) was the default target, but not the only one
on the table going in: a **Plan B**, commit-reveal fallback, orders commit as encrypted handles,
settlement reveals only the aggregate clearing price via `allowPublicDecryption`, never individual
sizes, was kept as a documented fallback in case chaining that many sequential primitive calls
(each its own async round-trip through the [three-phase pipeline](#what-actually-happens-between-a-transaction-and-a-decrypted-result))
proved too slow or too expensive per settlement against the single-Runner deployment. It never had
to be used, the spike above confirmed Plan A settles in seconds, comfortably inside budget, but
the decision to keep it as a fallback, evaluated and *not* built, rather than silently assumed away,
is itself the point: Plan A is closer to "the match actually happens inside the TEE," which
commit-reveal alone wouldn't guarantee on its own.

## Only five types are actually usable today

`encryptInput` (and every primitive) supports exactly `bool`, `uint16`, `uint256`, `int16`, and
`int256` at runtime, confirmed by reading the SDK's own source, not assumed from the docs (which
in one place show a code sample encrypting an `address`, directly above the paragraph saying
`address` isn't supported yet, a real documentation/shipped-code mismatch). This shaped the order
schema directly: amount is a confidential `uint256`; trader address, order id, and side stay public.

## Handles leak into the void until you explicitly say otherwise

A freshly created handle is transient-only by default (valid for the current transaction, then
gone). Anything meant to survive past the current transaction, or be decryptable by a specific
account, needs an explicit `Nox.allowThis()` / `Nox.allow()` / `Nox.addViewer()` call **before the
function returns**. Sealed is the default; readable is the exception you deliberately grant, that
asymmetry is the whole confidentiality model, not an accident of the SDK. This is the single most
common way to accidentally build something that looks
confidential but silently isn't: every new handle in this codebase is traced back to its explicit
ACL grant, and it's the first thing checked in every internal review pass.

## A non-obvious cross-contract ACL requirement

Calling `ConfidentialUSDC.confidentialTransferFrom`/`confidentialTransfer` with a handle the
*calling* contract just computed is not, on its own, enough. The token contract's internal
`Nox.transfer` call executes with the token contract itself as `msg.sender` from NoxCompute's
perspective, not the caller. The caller must explicitly grant the token contract *transient*
access to that specific handle first (`Nox.allowTransient(handle, address(token))`), immediately
before the transfer call, or it reverts deep inside the token contract with `NotAllowed`. This
pattern recurs anywhere one confidential contract hands a handle to another (it was needed a second
time, independently, wiring the compliance-viewer registry), and was confirmed against iExec's own
reference implementation before being trusted, not invented from scratch.

## The single Runner means real, visible, sequential latency

The current Nox deployment runs one Runner, processing jobs sequentially, this is documented
roadmap-not-shipped, not a bug. A batch settlement chains multiple primitives (sums, comparisons,
pro-rata math, real transfers): even the simplest one-buy/one-sell case is a chain of roughly
10-12 sequential off-chain jobs, not one atomic call. Every part of this project that reads a
result right after a transaction, the frontend, the E2E scripts, treats decryption as
fire-and-forget followed by poll/retry, never assuming synchronous confirmation. In practice,
measured against the live deployment, this settled in a handful of seconds per decrypt, comfortably
inside the retry budget built for it, not the pessimistic worst case originally planned for.

![The Broker: the batch clears](../../static/img/broker/money.gif)

> [!WARNING]
> **Treat every decrypt as async**
>
> One Runner, jobs strictly sequential. A single one-buy/one-sell settlement is ~10–12 sequential
> off-chain jobs, not one atomic call. The frontend and E2E scripts fire decrypts and poll/retry:
> they never assume synchronous confirmation.

## Never trust chain-ID auto-detection

The SDK's own published documentation warns that full Ethereum Sepolia support is "upcoming" and
that auto-detection may still resolve to Arbitrum Sepolia. In practice, the installed SDK version
already ships a working Sepolia config, but this project never relies on that: every handle client
is constructed with an explicit `gatewayUrl`/`smartContractAddress`/`subgraphUrl`, and every script
asserts the connected chain ID at startup, so a future SDK regression can't silently redirect
activity to the wrong network.

## Public RPC providers are not interchangeable for `eth_getLogs`

A real, live debugging story: the frontend's public reads originally used a commonly-cited free
Sepolia RPC that turned out to reject almost any `eth_getLogs` call spanning more than roughly 150
blocks with "Archive requests require a personal token", regardless of how recent the range was.
This was diagnosed with direct `curl` bisection against the real endpoint, not guessed at, and
fixed by switching to a different free provider confirmed to serve the exact range this app needs
against the real deployed contracts.
