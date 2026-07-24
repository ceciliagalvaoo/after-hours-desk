# After Hours Desk — frontend

Confidential-Noir client for the After Hours Desk dark pool, built on the Nox (iExec) SDK.
Every number on screen is either a real Ethereum Sepolia contract read or a real Nox
`HandleClient.decrypt`/`publicDecrypt` call — nothing on this screen is mocked. See
`../feedback.md` for the full, dated log of SDK friction and design decisions (search
"[Fase 5]" for this frontend's own entries).

## Run it

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173` (or the next free port). The public tape and Uniswap price
strip render real Sepolia data with no wallet at all — `NetworkGuard` only shows a dismissible
banner (never a full-page block) when no wallet is connected or the wrong network is active, so
that public content stays visible. Submitting orders, triggering settlement, and the auditor
panel all require an injected EIP-1193 wallet (MetaMask or similar) on Ethereum Sepolia.

Other scripts:

```bash
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
npm run preview     # serve the production build locally
```

## Network / contracts

This app only operates on **Ethereum Sepolia** (chain id `11155111`). `NetworkGuard`
(`src/components/layout/NetworkGuard.tsx`) blocks the whole UI and offers a "switch network"
button if the connected wallet is on any other chain (including Arbitrum Sepolia — some Nox
SDK examples/defaults still point there; this app never falls back to it silently).

Public reads (before/independent of any wallet) go through `sepolia.gateway.tenderly.co`, not
the more commonly cited `publicnode.com` — confirmed live in this session that publicnode's free
tier rejects almost any `eth_getLogs` call wider than ~150 blocks with "Archive requests require
a personal token," regardless of how recent the range is. See `config/chain.ts` and
`feedback.md`, Fase 5, for the full debugging story (several alternative public RPCs tested live
against this project's real deployed contracts before picking this one).

Contract addresses and ABIs are never hand-copied: `src/config/contracts.ts` imports
`../../deployments/sepolia.json` (the repo's own canonical deployment record) and the
compiled Hardhat artifacts under `../../artifacts/contracts/**` directly. If you redeploy any
contract, re-run `npx hardhat compile` and update `deployments/sepolia.json` at the repo
root — the frontend picks up the change automatically on next build, with no manual ABI sync
step.

## Known limitation: two wallets, not more

This repo has exactly two real, funded Sepolia accounts available for interactive testing:

- **Principal** — buyer + desk owner + `ViewerRegistry.complianceViewer` (the auditor), all
  the same address. This is a real limitation carried over from earlier phases (see
  `feedback.md`), not a frontend shortcut: this repo only ever funded one Sepolia account
  through most of its history, so the same address had to play buyer, owner, and auditor in
  earlier E2E scripts. The Auditor Panel's gating check is still a REAL on-chain check
  (`ViewerRegistry.complianceViewer()` compared against the connected wallet) — it just
  happens that, with this one account, "authorized trader" and "authorized auditor" are the
  same wallet.
- **Second (seller)** — a second funded account used to demonstrate the other side of an
  order and to show that ACL isolation is real (a wallet that is *not* the compliance viewer
  correctly gets a real "not authorized" state from the Auditor Panel, and cannot decrypt the
  other trader's fill).

No private key ever lives in this repository. Both wallets are operated interactively via
MetaMask by whoever is testing the live app — this frontend never holds or requests a raw
private key, only `window.ethereum` (EIP-1193) interactions.

## What every screen actually reads/writes

- **Order ticket** (`src/components/OrderTicket`): trader enters an amount + side, the amount
  is encrypted client-side via `HandleClient.encryptInput(amount, 'uint256',
  afterHoursDesk)` — only the resulting `{handle, handleProof}` pair is ever sent in the
  `submitOrder` transaction, never the plaintext amount. Buy orders require the desk to
  already be an authorized cUSDC operator (`setOperator`, deliberately scoped to a short
  15-minute window — see `feedback.md`, Fase 5, "operator window" entry — never a long-lived
  grant). Also exposes "attempt settleBatch()" (callable by anyone) and, once an order
  settles, a real "decrypt my fill" action for that order's own trader. A "Get testnet cUSDC"
  control (`src/hooks/useFaucetAndWrap.ts`) chains three real transactions
  (`MockUSDC.faucet` → `.approve` → `ConfidentialUSDC.wrap`) so a brand-new wallet — not just
  this repo's two pre-funded ones — can reach a confidential balance without Etherscan.
- **Tape** (`src/components/Tape`): a real, live feed of `OrderSubmitted` / `BatchOpened` /
  `BatchSettled` (from `AfterHoursDesk`) and `FillRegistered` (from `ViewerRegistry`) events,
  historical logs fetched sequentially (not in parallel — see `feedback.md`, Fase 5, on why) in
  a 30,000-block window, live updates via `watchContractEvent`. Every redacted (`███`) value sits
  over a real handle fetched via `getOrderHandle`/`getBatchMatchedAmountHandle`/
  `getBatchExecutionPriceHandle` — this tape never auto-decrypts anything, EXCEPT the "Reveal
  (publicDecrypt)" button on a settled batch's row, which calls the real
  `HandleClient.publicDecrypt` (no ACL required — `Nox.allowPublicDecryption` was already called
  for these two handles in `settleBatch()`) to show the real matched quantity and execution
  price. That button is the one place this app exercises `publicDecrypt`.
- **Auditor panel** (`src/components/AuditorPanel`): gated by a real on-chain check
  (connected wallet address === `ViewerRegistry.complianceViewer()`). Lists every real
  `FillRegistered` fill, offers `viewACL` (who currently holds admin/viewer access, from the
  Nox subgraph) and `decrypt` (the actual gasless EIP-712 decrypt) per fill.
- **Uniswap price strip** (`src/components/PriceStrip`): a public `view` read against
  `UniswapV3PriceReader.getReferencePrice()`, polled every 15s — explicitly labeled as public
  reference data, visually distinct (phosphor green, never redacted) from the dark pool's own
  confidential values.

## Tutorial

A 7-step "How it works" modal (`src/components/Tutorial/TutorialModal.tsx`,
`src/state/TutorialContext.tsx`) opens automatically on first visit (per-browser, via
`localStorage`) and is reachable any time via the "How it works" button in the header. Covers,
in order: what the product is, connecting a wallet, getting testnet cUSDC, submitting an order,
settling a batch, decrypting results, and the auditor panel.

## Aesthetic

Confidential-Noir: near-black/charcoal background, iExec yellow (`#F5C518`) as the only
action color, phosphor green reserved for live/public data. JetBrains Mono / Space Grotesk
(Google Fonts, licensed for this use) for every number/heading. "The Broker" mascot
(`src/components/mascot/Broker.tsx`) is 100% original — built procedurally from SVG `<rect>`
cells in code, no imported sprite/image/third-party IP of any kind. Styling is plain CSS
Modules (`*.module.css`, supported natively by Vite — no Tailwind/CSS-in-JS dependency
added) plus one global theme file (`src/styles/theme.css`) for palette/typography variables.
