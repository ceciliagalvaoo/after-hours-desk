# Evaluation Criteria

How **After Hours Desk** answers each line of the official **iExec WTF Hackathon (Summer Edition)**
rubric. Every claim points at something you can open and verify: a live screen, a file, a test, or a
verified Sepolia address. No pitch, no score inflation.

![The Broker makes the case](../static/img/broker/talk.gif)

> [!IMPORTANT]
> **Read this as a map, not a scorecard**
>
> Each criterion below is one or two sentences on what the desk actually does for it, and a pointer to
> where the full story lives. Where there is a disclosed tradeoff, it is named, not hidden.

## Creativity

Not a private swap or a copy-pasted confidential vault: a **confidential OTC dark-pool settlement
desk**, where encrypted orders are netted buy-against-sell inside Nox and only the aggregate ever
becomes public. The Broker persona, the redaction-bar motif, and the "after hours" framing make the
privacy idea legible at a glance.

For this criterion, read [Problem & Solution](./problem-and-solution.md).

## Works end-to-end, no mock data

Open [the live app](https://after-hours-desk.onrender.com) and use it: the public tape and Uniswap
price strip render real Sepolia data before a wallet is even connected, and a fresh wallet can
self-serve testnet `cUSDC` (faucet, approve, wrap) with no pre-funded account. Every number on
screen is a real contract read or a real Nox decrypt, never a staged value.

> [!CAUTION]
> **No mocks in the reachable path**
>
> The only `contracts/mocks/` artifact is a disclosed, really-deployed test ERC-20 backing `cUSDC`,
> never a substitute for on-chain state. The full walkthrough is in [User Flows & UX](./using-it/user-flows.md).

## Deployed on ETH Sepolia

All five contracts are live and **verified** on Etherscan, Blockscout, and Sourcify, with the
canonical record in [`deployments/sepolia.json`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/deployments/sepolia.json).
The [live `AfterHoursDesk` contract](https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8#code)
resolves right now with verified source. Not Arbitrum, not localhost.

For this criterion, see the address table on the [home page](./intro.md).

## `feedback.md` on the iExec tools

[`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md) is a
dated, incremental log of the real friction hit while integrating Nox, including several
documentation-versus-shipped-code discrepancies, written as it happened rather than backfilled after the fact.

For this criterion, read [Nox Integration](./how-it-works/nox-integration.md), which distills it.

## Demo video

A sharp, focused walkthrough of the real flow on live Sepolia state: an encrypted order submitted
(MetaMask showing **"Estimated changes: No changes"**), settlement, decrypting your own fill, and
the public reveal of the aggregate.

For this criterion, the screen-by-screen version is in [User Flows & UX](./using-it/user-flows.md).

## Technical implementation, Nox depth

`AfterHoursDesk.sol` nets a batch from **composed Nox primitives** (`safeAdd`, `lt`/`select`,
`safeMul`/`safeDiv`/`safeSub`) running on handles inside the TEE, never on plaintext, and
`ViewerRegistry` enforces a real on-chain ACL over every fill. The matching math is genuinely
confidential, not cosmetic.

For this criterion, read [Architecture](./how-it-works/architecture.md) and
[Nox Integration](./how-it-works/nox-integration.md).

## UX, intuitive and friendly

The Confidential-Noir interface makes the privacy model *visible*: a redaction bar (`███`) sits over
a real ciphertext handle you can inspect in the DOM, flipping to a number only on a successful
decrypt, and onboarding is fully self-serve. Post-settlement decrypts are fire-and-forget with
automatic retry, so the single-Runner async latency reads as expected progress, not a frozen screen.

For this criterion, see [User Flows & UX](./using-it/user-flows.md).

## The prose criterion

> *How cleanly Nox integrates, how much privacy it adds, and how close the result is to something a
> company would actually deploy.*

Nox slots in without asking traders to change wallets or forcing the underlying Uniswap pool to
change, composability preserved. The privacy is structural (individual order sizes never exist in
plaintext on-chain) and disclosure is selective and enforced on-chain (trader to own fill, auditor
to all fills), which is exactly the shape an institutional desk needs to deploy this for real.

> [!WARNING]
> **Disclosed tradeoffs, not hidden ones**
>
> The execution price is a live Uniswap **spot** read (`slot0`), not a TWAP, since it is a disclosed
> reference that never gates fund movement; pro-rata fills can leave a small integer-division dust
> remainder. Both are documented in
> [`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md) and the
> [Roadmap](./project/roadmap.md).
