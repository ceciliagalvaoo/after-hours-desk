---
sidebar_position: 3
title: Evaluation Criteria
---

# Evaluation Criteria

How **After Hours Desk** maps onto the official **iExec WTF Hackathon (Summer Edition)** rubric —
every claim tied to a concrete, checkable artifact in this repo or on-chain, not a pitch.

![The Broker makes the case](/img/broker/talk.gif)

:::info[Read this as a checklist]

Each criterion below states the weight, what it really means, and the exact evidence a judge can
open and verify — a file, a test, a verified Sepolia address, or a live screen. Where there is a
disclosed tradeoff, it is called out here rather than hidden.

:::

## The rubric at a glance

| Criterion | Weight | Where it's proven |
|---|---|---|
| Creativity of the project | ⭐⭐⭐ | A confidential OTC **dark pool**, not a generic private swap — see [Problem & Solution](/docs/problem-and-solution) |
| Works end-to-end, **no mock data** | ⭐⭐⭐ | [Live app](https://after-hours-desk.onrender.com) · real Sepolia reads · self-serve faucet — see [User Flows](/docs/using-it/user-flows) |
| Deployed on **ETH Sepolia** | ⭐⭐ | 5 contracts verified on Etherscan · [`deployments/sepolia.json`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/deployments/sepolia.json) |
| `feedback.md` on the iExec tools | ⭐⭐ | [Dated Nox friction log](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md) |
| Demo video, **max 4 minutes** | ⭐⭐ | Focused walkthrough of the real flow on live Sepolia state |
| Technical implementation (Nox depth) | ⭐ | Settlement composed from real Nox primitives — see [Architecture](/docs/how-it-works/architecture) & [Nox Integration](/docs/how-it-works/nox-integration) |
| UX — intuitive and friendly | ⭐ | Confidential-Noir UI, self-serve onboarding, redaction motif |
| Prose criterion (clean Nox, real privacy, deployable) | — | Threads through every page below |

## Creativity ⭐⭐⭐

The obvious build for this hackathon is a "private swap" or a copy-pasted confidential vault.
After Hours Desk is neither: it's a **confidential OTC dark-pool settlement desk**. Traders submit
**encrypted order sizes**, a batch is netted buy-against-sell entirely inside Nox, and the desk
settles real confidential `cUSDC` (ERC-7984) between counterparties — while only the aggregate
matched quantity and the execution price ever become public. The persona ("The Broker"), the
redaction-bar motif, and the "after hours" framing make the privacy idea legible at a glance.

:::tip[The one-line pitch]

The transfer is public. The size is not. It's all on-chain — *except* the amount.

:::

## Works end-to-end, no mock data ⭐⭐⭐

Open [after-hours-desk.onrender.com](https://after-hours-desk.onrender.com) and use it. The public
tape and the Uniswap price strip render **real, live Sepolia data before a wallet is even
connected**. A fresh wallet can self-serve testnet `cUSDC` (faucet → approve → wrap, three real
transactions chained automatically) — no pre-funded account, no Etherscan. Every number on screen
is a real contract read or a real Nox `decrypt`/`publicDecrypt`.

:::danger[No mocks in the reachable path]

There is no fake data, dead button, or staged value anywhere a judge can reach. The only
`contracts/mocks/` artifact is a disclosed, really-deployed test ERC-20 backing `cUSDC` — never a
substitute for on-chain state. See the full walkthrough in [User Flows & UX](/docs/using-it/user-flows).

:::

## Deployed on ETH Sepolia ⭐⭐

All five contracts are live and **verified** on Etherscan, Blockscout, and Sourcify. The canonical
record is [`deployments/sepolia.json`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/deployments/sepolia.json):
`MockUSDC`, `ConfidentialUSDC` (cUSDC), `ViewerRegistry`, `UniswapV3PriceReader`, and
`AfterHoursDesk`. The [live `AfterHoursDesk` contract](https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8#code)
resolves right now with verified source. Not Arbitrum, not localhost.

## `feedback.md` on the iExec tools ⭐⭐

[`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md) is a
**dated, incremental** log of the real friction hit while integrating Nox — including several
documentation-vs-shipped-code discrepancies found and worked around — written as it happened, not
backfilled the night before submission.

## Demo video, max 4 minutes ⭐⭐

A sharp, ≤4-minute walkthrough shows the real flow on live Sepolia state: an encrypted order
submitted (MetaMask showing **"Estimated changes: No changes"** — the desk hides the size even from
the wallet), settlement, decrypting your own fill, and the public reveal of the aggregate.

## Technical implementation — Nox depth ⭐

Privacy is not cosmetic here. `AfterHoursDesk.sol` nets a batch from **composed Nox primitives**
(`safeAdd`, `lt`/`select`, `safeMul`/`safeDiv`/`safeSub`) — the matching math runs inside the TEE
on handles, never on plaintext in a corner. `cUSDC` is a real ERC-7984 confidential token;
`ViewerRegistry` enforces a real on-chain ACL (a random wallet **cannot** decrypt a fill; each
trader decrypts only their own; the compliance viewer decrypts all). The Uniswap reference is a
read-only `view`. Details in [Architecture](/docs/how-it-works/architecture) and
[Nox Integration](/docs/how-it-works/nox-integration).

:::warning[Disclosed tradeoffs, not hidden ones]

The execution price is a live Uniswap **spot** read (`slot0`), not a TWAP — a deliberate, documented
choice since the price is a disclosed reference that never gates fund movement. Pro-rata fills can
leave a small integer-division dust remainder inside the desk. Both are in
[`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md) and the [Roadmap](/docs/project/roadmap).

:::

## UX — intuitive and friendly ⭐

The Confidential-Noir interface makes the privacy model *visible*: a redaction bar (`███`) always
sits on top of a real ciphertext handle — inspect it in the DOM and the handle is genuinely there,
you simply can't read the size off it — and only a successful decrypt flips it to a number. Every
post-settlement decrypt is fire-and-forget with automatic retry, so the inherent single-Runner
async latency reads as expected progress, not a frozen screen. Onboarding is self-serve.

## The prose criterion

> *How cleanly Nox integrates, how much privacy it adds, and how close the result is to something a
> company would actually deploy.*

Nox slots in without asking users to change wallets or forcing the underlying Uniswap pool to
change — composability preserved. The privacy is structural: individual order sizes never exist in
plaintext on-chain, and disclosure is selective and enforced on-chain (trader → own fill, auditor →
all fills). A compliance-viewer role that can audit every fill without a backdoor is exactly the
shape an institutional desk needs to deploy this for real.
