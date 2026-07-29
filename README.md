<p align="center">
  <img src="documentation/static/img/broker/talk.gif" alt="The Broker, explaining the desk" height="104" />
  &nbsp;&nbsp;&nbsp;
  <img src="documentation/static/img/broker/money.gif" alt="The Broker, settling a batch" height="104" />
</p>

<h1 align="center">After Hours Desk</h1>

<div align="center">

**The transfer is public. The size is not.**

A confidential OTC dark-pool settlement desk, built on Nox (iExec), live on Ethereum Sepolia.

*iExec WTF Hackathon (Summer Edition) · Confidential DeFi on Nox*

[**📖 Full documentation**](https://ceciliagalvaoo.github.io/after-hours-desk/) · [Problem & Solution](https://ceciliagalvaoo.github.io/after-hours-desk/docs/problem-and-solution) · [Architecture](https://ceciliagalvaoo.github.io/after-hours-desk/docs/how-it-works/architecture) · [Nox Integration](https://ceciliagalvaoo.github.io/after-hours-desk/docs/how-it-works/nox-integration) · [Evaluation Criteria](https://ceciliagalvaoo.github.io/after-hours-desk/docs/evaluation-criteria)

### [🎬 Watch the demo](https://youtu.be/ahGHJuBm0xs) · [🚀 Live app](https://after-hours-desk.onrender.com) · [🖼️ Screen-by-screen](https://ceciliagalvaoo.github.io/after-hours-desk/docs/using-it/user-flows) · [🧾 feedback.md](feedback.md) · [𝕏 @AfterHoursDesk](https://x.com/AfterHoursDesk)

<a href="https://youtu.be/ahGHJuBm0xs"><img src="https://img.youtube.com/vi/ahGHJuBm0xs/maxresdefault.jpg" alt="Watch the After Hours Desk demo on YouTube: a 3-minute walkthrough of the confidential dark pool" width="640" /></a>

</div>

---

## What this is

Traders submit **encrypted order sizes**: a size is encrypted **in the browser** (`encryptInput`) before anything is sent, so only a `{handle, proof}` pair ever lands on calldata, never a plaintext amount, not even for a moment. [`AfterHoursDesk.sol`](contracts/AfterHoursDesk.sol) nets a batch's buy and sell sides entirely from composed [Nox](https://docs.iex.ec/nox-protocol/getting-started/welcome) primitives (`safeAdd`, `lt`/`select`, `safeMul`/`safeDiv`/`safeSub`) running on opaque handles inside a TEE, and moves real confidential `cUSDC` balances (ERC-7984) between traders.

Only the **aggregate** matched quantity and the execution price (read live from a real Uniswap V3 pool on Sepolia) ever become publicly decryptable, and only once a batch actually settles. Individual order sizes and per-trader fills never do. A designated **compliance-viewer** address (the "auditor") can decrypt every fill; each trader can only ever decrypt their own.

Your host for the walkthrough is **The Broker**, the desk's noir mascot.

| | Public, decryptable by anyone | Sealed, never on-chain in plaintext |
|---|---|---|
| **Aggregate matched quantity** | ✅ after a batch settles | |
| **Execution price** (live Uniswap V3 Sepolia read) | ✅ always | |
| **That a fill exists** | ✅ | |
| **Individual order sizes** | | 🔒 encrypted client-side, only a `{handle, proof}` on calldata |
| **Per-trader fills** | | 🔒 trader decrypts only their own; auditor decrypts all |

No mocked UI data anywhere in the reachable path: every number on screen is a real Sepolia contract read or a real Nox `decrypt` / `publicDecrypt`.

### 📖 Documentation

- **[Full docs site](https://ceciliagalvaoo.github.io/after-hours-desk/)**, a themed Docusaurus site (Confidential-Noir, matching the app) with the complete walkthrough: problem, architecture, the Nox primitive composition, the ACL model, screenshotted user flows, and setup. *(A GitHub-readable Markdown mirror of the whole docs lives at [`documentation/markdown/`](documentation/markdown/README.md) for reading straight on GitHub.)*
- **[Nox Integration](https://ceciliagalvaoo.github.io/after-hours-desk/docs/how-it-works/nox-integration)**, the hands-on findings distilled from [`feedback.md`](feedback.md), including several documentation-versus-shipped-code discrepancies found and worked around.

### Evaluation criteria

How the desk answers each line of the official iExec WTF rubric. Every claim points at something you can open and verify. The full criterion-by-criterion write-up is on the **[Evaluation Criteria](https://ceciliagalvaoo.github.io/after-hours-desk/docs/evaluation-criteria)** page.

- **Creativity**: not a private swap or a copy-pasted confidential vault, but a confidential OTC dark-pool settlement desk where encrypted orders are netted buy-against-sell inside Nox. See [Problem & Solution](https://ceciliagalvaoo.github.io/after-hours-desk/docs/problem-and-solution).
- **Works end-to-end, no mock data**: open [the live app](https://after-hours-desk.onrender.com); the public tape and Uniswap price strip render real Sepolia data before a wallet is even connected, and a fresh wallet can self-serve testnet `cUSDC` (faucet, approve, wrap). See [User Flows & UX](https://ceciliagalvaoo.github.io/after-hours-desk/docs/using-it/user-flows).
- **Deployed on ETH Sepolia**: all five contracts are live and verified on Etherscan, Blockscout, and Sourcify, canonical record in [`deployments/sepolia.json`](deployments/sepolia.json).
- **`feedback.md` on the iExec tools**: [`feedback.md`](feedback.md) is a dated, incremental log of the real friction hit while integrating Nox, written as it happened.
- **Demo video**: a focused walkthrough of the real flow on live Sepolia state (encrypted order, MetaMask showing "Estimated changes: No changes", settlement, decrypting your own fill, the public aggregate reveal). Screen-by-screen in [User Flows & UX](https://ceciliagalvaoo.github.io/after-hours-desk/docs/using-it/user-flows).
- **Technical implementation, Nox depth**: [`AfterHoursDesk.sol`](contracts/AfterHoursDesk.sol) nets a batch from composed Nox primitives running on handles inside the TEE, and [`ViewerRegistry`](contracts/ViewerRegistry.sol) enforces a real on-chain ACL over every fill. See [Architecture](https://ceciliagalvaoo.github.io/after-hours-desk/docs/how-it-works/architecture) and [Nox Integration](https://ceciliagalvaoo.github.io/after-hours-desk/docs/how-it-works/nox-integration).
- **UX, intuitive and friendly**: the Confidential-Noir interface makes the privacy model visible, a redaction bar (`███`) over a real ciphertext handle flips to a number only on a successful decrypt, and onboarding is fully self-serve. See [User Flows & UX](https://ceciliagalvaoo.github.io/after-hours-desk/docs/using-it/user-flows).

## Live deployment (Ethereum Sepolia, chainId 11155111)

Canonical, machine-readable source: [`deployments/sepolia.json`](deployments/sepolia.json). All five contracts below are verified on Etherscan, Blockscout, and Sourcify.

| Contract | Address |
|---|---|
| `MockUSDC` (test ERC-20 backing cUSDC) | [`0x68df20bfc035f6496e0593626579d00139aaa49c`](https://sepolia.etherscan.io/address/0x68df20bfc035f6496e0593626579d00139aaa49c#code) |
| `ConfidentialUSDC` (cUSDC, ERC-7984) | [`0x45dd58bea3f072ce8cf704a43abc41be27337e4e`](https://sepolia.etherscan.io/address/0x45dd58bea3f072ce8cf704a43abc41be27337e4e#code) |
| `ViewerRegistry` (auditor ACL module) | [`0x7f5508360b37f41a6cca6c34aca233500b6c1678`](https://sepolia.etherscan.io/address/0x7f5508360b37f41a6cca6c34aca233500b6c1678#code) |
| `UniswapV3PriceReader` (read-only price adapter) | [`0x20f68c8d394dabee5fea08a21a1596eb09c5554e`](https://sepolia.etherscan.io/address/0x20f68c8d394dabee5fea08a21a1596eb09c5554e#code) |
| `AfterHoursDesk` (settlement core) | [`0x46b72a2615de7351699dcd5a64b854746a29fdb8`](https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8#code) |

Uniswap reference pool (real, third-party, read-only): WETH/USDC 0.05%, [`0x3289680dd4d6c10bb19b899729cda5eef58aeff1`](https://sepolia.etherscan.io/address/0x3289680dd4d6c10bb19b899729cda5eef58aeff1).

## Repository layout

```
after-hours-desk/
├── contracts/            # Solidity: AfterHoursDesk, ConfidentialUSDC, MockUSDC,
│                         #   ViewerRegistry, UniswapV3PriceReader, interfaces/, mocks/ (test-only)
├── frontend/             # Vite + React + TypeScript + viem client (see frontend/README.md)
├── documentation/        # Docusaurus docs site (deployed to GitHub Pages) + Markdown mirror
│                         #   and the Broker persona assets (static/img/broker/)
├── scripts/
│   ├── deploy/           # ordered deploy scripts, real Sepolia
│   ├── e2e/              # standalone, re-runnable E2E proof scripts against LIVE Sepolia
│   ├── verify/           # verify-all.ts, re-verifies every deployed contract in one run
│   └── utils/            # shared helpers (network guard, Nox config, deployments I/O, retry)
├── test/
│   ├── unit/             # unit tests against the local Nox offchain stack (Docker)
│   └── e2e/              # see test/e2e/README.md, real E2E proof lives in scripts/e2e/
├── deployments/          # sepolia.json, canonical deployed-address record
└── feedback.md           # dated, ongoing log of Nox integration friction (read this for the "why")
```

## Running locally

Requires Node 22+, Docker running locally (for local unit tests, the Nox offchain stack boots in containers), and a Sepolia wallet with testnet ETH if you plan to deploy or run the live E2E scripts.

**Frontend** (fastest way to see the desk):

```bash
cd frontend
npm install
npm run dev
```

Open the printed `localhost` URL with an injected wallet (MetaMask) on Ethereum Sepolia. The public tape and Uniswap price strip render real data even before connecting a wallet; submitting orders, triggering settlement, and the auditor panel require a connected wallet. A "Get testnet cUSDC" control in the order ticket lets any fresh wallet self-serve (faucet + wrap, chained automatically). No setup at all is needed to use the already-deployed instance at **[after-hours-desk.onrender.com](https://after-hours-desk.onrender.com)**.

**Contracts** (test, deploy, verify):

```bash
npm install

# Secrets live in the Hardhat keystore, never in a .env file:
npx hardhat keystore set --dev SEPOLIA_RPC_URL
npx hardhat keystore set --dev ETHERSCAN_API_KEY
npx hardhat keystore set --dev DESK_OWNER_PRIVATE_KEY

npm test                      # unit tests, local Nox stack via Docker (23/23 passing)
npm run test:e2e:sepolia      # real E2E against LIVE Sepolia, costs real testnet gas
```

Deploy your own instance (order matters, later scripts read earlier addresses from `deployments/sepolia.json`):

```bash
npm run deploy:mock-usdc:sepolia
npm run deploy:cusdc:sepolia
npm run deploy:viewer-registry:sepolia
npm run deploy:price-reader:sepolia
npm run deploy:desk:sepolia          # wires cUSDC + ViewerRegistry + price oracle together
npm run verify:all:sepolia           # re-verifies every deployed contract, safe to re-run
```

Full instructions are in [Setup & Deployment](https://ceciliagalvaoo.github.io/after-hours-desk/docs/using-it/setup-and-deployment).

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (Node.js 22), Solidity 0.8.35 |
| Confidential compute | Nox (iExec), TEE-based (Intel TDX), `@iexec-nox/*` handle + contracts |
| Contracts framework | Hardhat 3, viem, Hardhat Ignition, keystore-based secrets |
| Confidential token | `ConfidentialUSDC` (cUSDC), ERC-7984, over OpenZeppelin contracts |
| Pricing | live read from a real, unmodified Uniswap V3 Sepolia pool (`view`-only adapter) |
| Frontend | Vite + React + TypeScript + viem, Confidential-Noir UI |
| Docs | Docusaurus, deployed to GitHub Pages, with a GitHub-readable Markdown mirror |
| Network | Ethereum Sepolia (chainId 11155111) |

## The Nox integration log, `feedback.md`

[`feedback.md`](feedback.md) is a scored hackathon deliverable: a dated, incremental log of the real friction hit while integrating Nox, written as it happened rather than backfilled after the fact. It records several documentation-versus-shipped-code discrepancies found and worked around, and the reasoning behind every non-obvious decision (spot price vs TWAP, pro-rata dust, the single-Runner async settlement model). It is distilled into the [Nox Integration](https://ceciliagalvaoo.github.io/after-hours-desk/docs/how-it-works/nox-integration) page in the docs.

## Validated end-to-end, not just in theory

Every claim here has a real Sepolia transaction behind it, not a unit test against a mock. All five contracts are deployed and verified today; the E2E scripts (`wrap-check`, `settle-check`, `auditor-check`, `price-check`) each run a real, standalone, idempotent flow against the live deployment, faucet through settlement through decrypt, spending real testnet gas. The only `contracts/mocks/` artifact is a disclosed, really-deployed test ERC-20 backing `cUSDC`, never a substitute for on-chain state. Disclosed tradeoffs (Uniswap spot price rather than TWAP, integer-division dust on pro-rata fills) are named, not hidden, in [`feedback.md`](feedback.md) and the [Roadmap](https://ceciliagalvaoo.github.io/after-hours-desk/docs/project/roadmap).

## Team

<table>
  <tr>
    <td align="center" width="50%">
      <img src="documentation/static/img/team/Cecilia.png" width="150" alt="Cecília Galvão" /><br/><br/>
      <b>Cecília Galvão</b><br/>
      <sub>Smart Contracts · Backend · Blockchain</sub>
      <br/><br/>
      <a href="https://www.linkedin.com/in/ceciliagalvaoo/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
      <a href="https://github.com/ceciliagalvaoo"><img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
      <img src="https://img.shields.io/badge/Discord-ceciliabtriz-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord: ceciliabtriz" />
    </td>
    <td align="center" width="50%">
      <img src="documentation/static/img/team/Pablo.png" width="150" alt="Pablo Azevedo" /><br/><br/>
      <b>Pablo Azevedo</b><br/>
      <sub>Full-Stack · Frontend · Product</sub>
      <br/><br/>
      <a href="https://www.linkedin.com/in/pabloazevedo"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
      <a href="https://github.com/zzaved"><img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
      <img src="https://img.shields.io/badge/Discord-zzaved-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord: zzaved" />
    </td>
  </tr>
</table>

## License

MIT, see [LICENSE](LICENSE).

<sub>Built for the iExec WTF Hackathon (Summer Edition). Repository: <a href="https://github.com/ceciliagalvaoo/after-hours-desk">github.com/ceciliagalvaoo/after-hours-desk</a>.</sub>
