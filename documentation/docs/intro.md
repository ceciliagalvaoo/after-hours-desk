---
sidebar_position: 1
---

# After Hours Desk

**A confidential OTC dark-pool settlement desk, built on Nox (iExec), live on Ethereum Sepolia.**

![The Broker, explaining the desk](/img/broker/talk.gif)

Built by [Cecília Galvão](https://github.com/ceciliagalvaoo) and [Pablo Azevedo](https://github.com/zzaved)
for the **iExec WTF Hackathon (Summer Edition)**. Your host for this walkthrough is **The Broker** —
the desk's noir mascot, who shows up whenever there's something worth pointing at.

🚀 **[Try the live app →](https://after-hours-desk.onrender.com)** — no setup required, the public tape and
Uniswap price strip render real Sepolia data immediately, even without a wallet.

:::tip[Live and verified]

Every contract referenced in this documentation is deployed and verified on Ethereum Sepolia
today. Every screenshot is a real screenshot of the real application, running against those real
contracts — nothing in this documentation is mocked or staged.

:::

## What this is, in one paragraph

Traders submit encrypted order sizes — a size is encrypted **in the browser** before anything is
sent on-chain, so it never exists as plaintext on Sepolia, not even for a moment. `AfterHoursDesk.sol`
nets a batch's buy and sell sides entirely from composed [Nox](https://docs.iex.ec/nox-protocol/getting-started/welcome)
primitives, and moves real confidential `cUSDC` balances between traders. Only the *aggregate*
matched quantity and the execution price — read live from a real Uniswap V3 pool on Sepolia — ever
become publicly decryptable, and only once a batch actually settles. Individual order sizes and
per-trader fills never do. So the tape tells you a trade happened, what it cleared at, that a fill
exists — and stops there. The size behind it is not viable to read on the frontend, by design.
A designated compliance-viewer address (the "auditor") can decrypt every fill; each trader can only
ever decrypt their own.

## Live deployment

| Contract | Address |
|---|---|
| `MockUSDC` | [`0x68df2...aa49c`](https://sepolia.etherscan.io/address/0x68df20bfc035f6496e0593626579d00139aaa49c#code) |
| `ConfidentialUSDC` (cUSDC) | [`0x45dd5...37e4e`](https://sepolia.etherscan.io/address/0x45dd58bea3f072ce8cf704a43abc41be27337e4e#code) |
| `ViewerRegistry` | [`0x7f550...33f2f8`](https://sepolia.etherscan.io/address/0x7f5508360b37f41a6cca6c34aca233500b6c1678#code) |
| `UniswapV3PriceReader` | [`0x20f68...c5554e`](https://sepolia.etherscan.io/address/0x20f68c8d394dabee5fea08a21a1596eb09c5554e#code) |
| `AfterHoursDesk` | [`0x46b72...9fdb8`](https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8#code) |

## Where to go from here

- **[Problem & Solution](/docs/problem-and-solution)** — why dark pools need confidentiality, and why that's hard on a public blockchain
- **[Architecture](/docs/how-it-works/architecture)** — contracts, the Nox primitive composition, the ACL model, the frontend
- **[Nox Integration](/docs/how-it-works/nox-integration)** — what it's actually like building on Nox today, distilled from [`feedback.md`](https://github.com/ceciliagalvaoo/after-hours-desk/blob/master/feedback.md)
- **[User Flows & UX](/docs/using-it/user-flows)** — real, screenshotted walkthroughs of every screen and role
- **[Setup & Deployment](/docs/using-it/setup-and-deployment)** — run it yourself
- **[Roadmap](/docs/project/roadmap)** — what a production version looks like beyond this hackathon
- **[Team](/docs/project/team)** — who built this
