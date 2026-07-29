# User Flows & UX

Every screenshot on this page is a real screenshot from a real, manual test session against the
live Sepolia deployment: two genuinely distinct MetaMask wallets, real transactions, real
decrypts. Nothing here was staged after the fact; this is the actual walkthrough performed to
validate the product end to end.

> [!TIP]
> This page is the screen-by-screen walkthrough. For the same flow narrated end to end, **[watch the demo video →](https://youtu.be/ahGHJuBm0xs)** (about 3 minutes).

## Before connecting a wallet

The public tape and the Uniswap price strip render real, live Sepolia data immediately, no wallet
required. A judge opening the link with no wallet installed still sees genuine on-chain proof that
the system works, not a blank gate screen.

**Image 1: The public tape and Uniswap price strip before any wallet is connected**

![Initial view, no wallet connected](../../static/img/screenshots/01-initial-no-wallet.png)

*Source: The authors (2026).*

A first-time visitor also gets a 7-step "How it works" tutorial modal automatically, covering every
flow on this page.

## Connecting and reading your confidential balance

After connecting (MetaMask, Ethereum Sepolia), the order ticket, tape, and auditor panel all become
interactive. The trader's own confidential cUSDC balance is shown redacted (`███`) by default,
sitting over a real handle already fetched from `confidentialBalanceOf`, never a placeholder for
data that doesn't exist, until the trader clicks "Decrypt." Inspect the bar in the DOM: the handle
is genuinely there, you just can't read the number off it here.

**Image 2: The connected desk with order ticket and auditor panel, balance still redacted**

![Connected: order ticket and auditor panel](../../static/img/screenshots/02-connected-order-ticket-auditor.png)

*Source: The authors (2026).*

New wallets with no cUSDC yet can use "Get testnet cUSDC," which chains three real transactions
(`faucet` → `approve` → `wrap`) automatically, no pre-funded account or Etherscan required.

Clicking "Decrypt" triggers a real MetaMask **signature request**, not a transaction, no gas, no
network fee. This is `handleClient.decrypt(handle)`: an EIP-712 `DataAccessAuthorization` proving
wallet ownership to the Handle Gateway, valid for a short window (one hour) rather than a standing
grant:

**Image 3: MetaMask signature request for a gasless decrypt authorization**

![MetaMask signature request for a decrypt call](../../static/img/screenshots/10-metamask-decrypt-signature.png)

*Source: The authors (2026).*

## Submitting an encrypted order

![The Broker: send it dark](../../static/img/broker/smirk.gif)

The trader picks Buy or Sell, enters an amount, and submits. The amount is encrypted **client-side**
via `encryptInput` before the transaction is even built: only the resulting `{handle, handleProof}`
pair is ever sent. This is visible in MetaMask's own transaction preview: its simulation reports
**"Estimated changes: No changes"**, because the calldata only carries an opaque handle and proof:
there is no plaintext transfer for MetaMask's simulator to decode:

**Image 4: MetaMask transaction preview reporting "Estimated changes: No changes" for an encrypted order**

![MetaMask transaction request showing "Estimated changes: No changes"](../../static/img/screenshots/11-metamask-order-no-changes.png)

*Source: The authors (2026).*

> [!TIP]
> **"No changes" is the proof, not a bug**
>
> MetaMask's simulator reporting **"Estimated changes: No changes"** is exactly what confidentiality
> looks like from the wallet's side: the calldata carries only a handle and a proof, so there is no
> plaintext transfer for it to decode.

The moment the transaction is sent (before it's even mined), the public tape
updates live via `watchContractEvent`. Everyone watching sees that an order landed; nobody watching
sees how big: the "pending…" entry carries the order's real handle, already redacted:

**Image 5: The public tape updating live with a redacted pending order**

![Order submitted, live tape update](../../static/img/screenshots/03-order-submitted-live-tape.png)

*Source: The authors (2026).*

Buy orders require the desk to be pre-authorized as a cUSDC operator, a real, separate
transaction, deliberately scoped to a short (15-minute) window rather than a standing grant.

## The auditor panel is a real on-chain check, not a UI lock

Connecting a wallet that is **not** the registered compliance viewer shows a real, honest "not
authorized" state: this is `ViewerRegistry.complianceViewer()` compared against the connected
address on-chain, not a cosmetic UI gate:

![The Broker: access denied](../../static/img/broker/sad.gif)

**Image 6: The auditor panel denying access to a non-compliance-viewer wallet**

![Auditor panel correctly denying access](../../static/img/screenshots/04-auditor-panel-access-denied.png)

*Source: The authors (2026).*

## Settling a batch

![The Broker: match filled](../../static/img/broker/money.gif)

Once a batch has at least one buy and one sell order, **anyone** can trigger `settleBatch()`, no
privileged keeper. After the transaction confirms, a banner shows the real result and is explicit
that fills are still computing off-chain (the single Nox Runner processes jobs sequentially, this
UI never assumes synchronous confirmation):

**Image 7: The MATCH FILLED banner after a batch is settled**

![MATCH FILLED banner](../../static/img/screenshots/05-match-filled-banner.png)

*Source: The authors (2026).*

## Decrypting your own fill

![The Broker: your fill, revealed](../../static/img/broker/smile.gif)

"Decrypt my fill" triggers a real, gasless EIP-712-signed decrypt request through the Nox SDK. In
this test session it resolved in roughly 5 seconds:

**Image 8: A trader's own fill decrypted to plaintext**

![Own fill decrypted](../../static/img/screenshots/06-decrypt-own-fill-result.png)

*Source: The authors (2026).*

## Revealing the public aggregate

The matched quantity and execution price are the *only* two values `settleBatch()` ever marks
publicly decryptable. Clicking "Reveal (publicDecrypt)" on the tape's MATCH FILLED row calls the
real `publicDecrypt`, no special authorization needed, by design, and shows the matched amount
alongside the real, live Uniswap price used for execution. This is the public half of the duality:
the batch's aggregate is provable to anyone, while the individual sizes that composed it stay sealed.

**Image 9: The public aggregate and execution price revealed via publicDecrypt**

![Public aggregate revealed via publicDecrypt](../../static/img/screenshots/07-public-decrypt-reveal.png)

*Source: The authors (2026).*

## The auditor sees everything, but only the auditor

Switching back to the wallet registered as the compliance viewer unlocks the full auditor panel:
every real fill, from every trader, listed with `View ACL` and `Decrypt Fill` actions.

**Image 10: The unlocked auditor panel listing every fill for the compliance viewer**

![Auditor panel, authorized](../../static/img/screenshots/08-auditor-panel-authorized.png)

*Source: The authors (2026).*

The auditor can decrypt a fill that belongs to a **different** trader entirely, proving the
compliance-viewer grant actually works across accounts, not just for the auditor's own orders:

**Image 11: The auditor decrypting a different trader's fill across accounts**

![Auditor decrypting another trader's fill](../../static/img/screenshots/09-auditor-decrypt-other-fill.png)

*Source: The authors (2026).*

> [!IMPORTANT]
> **Selective disclosure, enforced on-chain**
>
> The auditor decrypts *every* fill; each trader decrypts *only their own*; a stranger decrypts
> nothing. That is a real Nox ACL check, proven in `test/unit/ViewerRegistry.test.ts` with four
> genuinely distinct accounts, not a UI-layer promise.

## What this proves, end to end

A single manual session validated, with two real wallets and no mocked step: client-side
encryption → real order submission → live tape updates → real on-chain ACL denial for an
unauthorized wallet → real batch settlement → real confidential balance movement → real trader-side
decrypt → real public aggregate reveal → real cross-account auditor decrypt. Every one of those
steps is a real transaction or a real Nox SDK call against the live Sepolia deployment listed on
the [home page](../intro.md).
