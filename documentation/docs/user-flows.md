---
sidebar_position: 4
---

# User Flows & UX

Every screenshot on this page is a real screenshot from a real, manual test session against the
live Sepolia deployment — two genuinely distinct MetaMask wallets, real transactions, real
decrypts. Nothing here was staged after the fact; this is the actual walkthrough performed to
validate the product end to end.

## Before connecting a wallet

The public tape and the Uniswap price strip render real, live Sepolia data immediately — no wallet
required. A judge opening the link with no wallet installed still sees genuine on-chain proof that
the system works, not a blank gate screen.

![Initial view, no wallet connected](/img/screenshots/01-initial-no-wallet.png)

A first-time visitor also gets a 7-step "How it works" tutorial modal automatically, covering every
flow on this page.

## Connecting and reading your confidential balance

After connecting (MetaMask, Ethereum Sepolia), the order ticket, tape, and auditor panel all become
interactive. The trader's own confidential cUSDC balance is shown redacted (`███`) by default —
sitting over a real handle already fetched from `confidentialBalanceOf`, never a placeholder for
data that doesn't exist — until the trader clicks "Decrypt."

![Connected: order ticket and auditor panel](/img/screenshots/02-connected-order-ticket-auditor.png)

New wallets with no cUSDC yet can use "Get testnet cUSDC," which chains three real transactions
(`faucet` → `approve` → `wrap`) automatically — no pre-funded account or Etherscan required.

Clicking "Decrypt" triggers a real MetaMask **signature request**, not a transaction — no gas, no
network fee. This is `handleClient.decrypt(handle)`: an EIP-712 `DataAccessAuthorization` proving
wallet ownership to the Handle Gateway, valid for a short window (one hour) rather than a standing
grant:

![MetaMask signature request for a decrypt call](/img/screenshots/10-metamask-decrypt-signature.png)

## Submitting an encrypted order

The trader picks Buy or Sell, enters an amount, and submits. The amount is encrypted **client-side**
via `encryptInput` before the transaction is even built — only the resulting `{handle, handleProof}`
pair is ever sent. This is visible in MetaMask's own transaction preview: its simulation reports
**"Estimated changes: No changes"**, because the calldata only carries an opaque handle and proof —
there is no plaintext transfer for MetaMask's simulator to decode:

![MetaMask transaction request showing "Estimated changes: No changes"](/img/screenshots/11-metamask-order-no-changes.png)

The moment the transaction is sent (before it's even mined), the public tape
updates live via `watchContractEvent`, showing a "pending…" entry with the order's real handle
already redacted:

![Order submitted, live tape update](/img/screenshots/03-order-submitted-live-tape.png)

Buy orders require the desk to be pre-authorized as a cUSDC operator — a real, separate
transaction, deliberately scoped to a short (15-minute) window rather than a standing grant.

## The auditor panel is a real on-chain check, not a UI lock

Connecting a wallet that is **not** the registered compliance viewer shows a real, honest "not
authorized" state — this is `ViewerRegistry.complianceViewer()` compared against the connected
address on-chain, not a cosmetic UI gate:

![Auditor panel correctly denying access](/img/screenshots/04-auditor-panel-access-denied.png)

## Settling a batch

Once a batch has at least one buy and one sell order, **anyone** can trigger `settleBatch()` — no
privileged keeper. After the transaction confirms, a banner shows the real result and is explicit
that fills are still computing off-chain (the single Nox Runner processes jobs sequentially — this
UI never assumes synchronous confirmation):

![MATCH FILLED banner](/img/screenshots/05-match-filled-banner.png)

## Decrypting your own fill

"Decrypt my fill" triggers a real, gasless EIP-712-signed decrypt request through the Nox SDK. In
this test session it resolved in roughly 5 seconds:

![Own fill decrypted](/img/screenshots/06-decrypt-own-fill-result.png)

## Revealing the public aggregate

The matched quantity and execution price are the *only* two values `settleBatch()` ever marks
publicly decryptable. Clicking "Reveal (publicDecrypt)" on the tape's MATCH FILLED row calls the
real `publicDecrypt` — no special authorization needed, by design — and shows the matched amount
alongside the real, live Uniswap price used for execution:

![Public aggregate revealed via publicDecrypt](/img/screenshots/07-public-decrypt-reveal.png)

## The auditor sees everything, but only the auditor

Switching back to the wallet registered as the compliance viewer unlocks the full auditor panel:
every real fill, from every trader, listed with `View ACL` and `Decrypt Fill` actions.

![Auditor panel, authorized](/img/screenshots/08-auditor-panel-authorized.png)

The auditor can decrypt a fill that belongs to a **different** trader entirely — proving the
compliance-viewer grant actually works across accounts, not just for the auditor's own orders:

![Auditor decrypting another trader's fill](/img/screenshots/09-auditor-decrypt-other-fill.png)

## What this proves, end to end

A single manual session validated, with two real wallets and no mocked step: client-side
encryption → real order submission → live tape updates → real on-chain ACL denial for an
unauthorized wallet → real batch settlement → real confidential balance movement → real trader-side
decrypt → real public aggregate reveal → real cross-account auditor decrypt. Every one of those
steps is a real transaction or a real Nox SDK call against the live Sepolia deployment listed on
the [home page](/).
