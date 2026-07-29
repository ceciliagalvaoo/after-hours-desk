# Feedback: Nox / iExec (After Hours Desk)

This is a living, dated log of real friction, surprises, bugs, and decisions
forced by Nox/iExec while building **After Hours Desk**, a confidential
OTC dark-pool settlement desk on Ethereum Sepolia. It was updated
throughout every phase of the build, never written all at once at the end.
Each entry carries a date, a phase, and enough context to be understood on
its own. Read top to bottom, phase by phase, in the order the product was
actually built.

## Table of contents

- [At a glance](#at-a-glance)
- [Phase 0: Foundation](#phase-0-foundation)
- [Phase 1: cToken](#phase-1-ctoken)
- [Phase 2: AfterHoursDesk.sol core](#phase-2-afterhoursdesksol-core)
- [Phase 3: ACL / Viewer](#phase-3-acl--viewer)
- [Phase 4: Uniswap composability](#phase-4-uniswap-composability)
- [Phase 5: Frontend](#phase-5-frontend)
- [Phase 6: E2E, proof, and closing gaps](#phase-6-e2e-proof-and-closing-gaps)
- [Project](#project)

---

## At a glance

Before the phase-by-phase log below, three diagrams summarize what the desk
actually does and where Nox/iExec specifically shaped the design. Everything in
them is expanded, with dates and sources, in the entries that follow. The
first two are here; the third (the redeploy coupling Phase 4 uncovered) appears
inline in its own entry.

### The confidential settlement flow

An order's amount is encrypted in the browser and never leaves the machine in
the clear; only an opaque handle is ever stored on-chain. Settlement runs
off-chain inside a hardware-attested Nox TEE, netting the batch purely from
composed primitives (`safeAdd`, `lt` + `select`, `safeSub`, `transfer`) and
moving real confidential cUSDC. Only the matched aggregate and the live Uniswap
V3 execution price go public, individual order sizes stay sealed, except to the
trader who owns a fill and to the compliance auditor through an on-chain ACL.

<div align="center">

**Image 1: The confidential settlement flow, from browser-side encryption to selective disclosure**

<img src="documentation/static/img/diagrams/01-confidential-settlement-flow.png" alt="Top-to-bottom flowchart in four stages. Stage one, in the browser: the trader types an amount, which encryptInput turns into an externalEuint256 plus a proof, and only an opaque handle leaves the machine. Stage two, on-chain on public Ethereum Sepolia: AfterHoursDesk stores the encrypted order, and once both sides are present anyone can trigger settleBatch with no privileged operator. Stage three, off-chain in a confidential Nox TEE: the batch is netted with safeAdd on the buy side and the sell side, lt plus select to take matched equals the minimum of buy and sell, safeSub twice for the residuals, and transfer to move real confidential cUSDC between the two traders. Stage four, selective disclosure after settlement lands on Sepolia: the matched aggregate and the live Uniswap V3 execution price become public (highlighted green), the trader decrypts only their own fill, the auditor decrypts every fill through the ViewerRegistry ACL, and everyone else sees individual order sizes stay sealed (highlighted red)." width="720" />

*Source: The authors (2026).*

</div>

### Where Nox shaped the build, phase by phase

This log is organized by build phase, and each phase carried its own piece of
Nox/iExec friction that changed a concrete design decision. The map below is the
short version; every node is a full, dated entry further down.

<div align="center">

**Image 2: The Nox/iExec friction that shaped each build phase**

<img src="documentation/static/img/diagrams/02-nox-friction-by-phase.png" alt="Vertical flowchart of seven build phases, each a box of notes connected top to bottom. Phase 0, Foundation: spikes prove batch netting is expressible from primitives alone, encryptInput supports five types, and the Sepolia config must be forced. Phase 1, cToken: the ERC-7984 wrapper is confirmed real, and getAddress via getAddresses index zero breaks local multi-account tests. Phase 2, Desk core: in the ACL, msg.sender is the calling contract rather than the handle's author, leading to the allowTransient pattern. Phase 3, ACL and Viewer: viewer and admin grants are irrevocable, so complianceViewer is made immutable with no half-working rotation. Phase 4, Uniswap composability: toEuint256 is always public so it is routed through add of zero, and setDesk being one-time-use forces a second redeploy. Phase 5, Frontend: the public Sepolia RPC caps eth_getLogs at fifty thousand blocks, requiring windowed queries. Phase 6, End-to-end and proof: two real wallets, in-UI faucet plus wrap onboarding, and every fill auditable." width="440" />

*Source: The authors (2026).*

</div>

---

## Phase 0: Foundation

### Phase 0: Kickoff, 2026-07-20

Repo created. Waiting on the result of the Day-1 mandatory spike from
nox-chain-architect (netting via primitives, forced Sepolia config, types
supported by `encryptInput`, single-Runner latency).

---

### Phase 0: Toolchain scaffold, 2026-07-20

**Context:** set up the Hardhat 3 + `nox-hardhat-plugin` foundation
targeting ETH Sepolia, before any production contract exists.

**What happened:** `nox-hardhat-starter` (cited in the brief) does not
exist as a separate repo: `curl https://api.github.com/repos/iExec-Nox/nox-hardhat-starter`
returns 404, and `https://api.github.com/orgs/iExec-Nox/repos` does not
list that name. The real reference repo is `iExec-Nox/nox-hardhat-plugin`,
a pnpm monorepo with two packages: `packages/plugin` (published as
`@iexec-nox/nox-hardhat-plugin`) and `packages/example-project` (the
published package's README plus the example project's integration tests
turned out to be the most reliable source for real usage patterns, more
reliable than `llms-full.txt` on some details). Another real repo used as
a product reference was `iExec-Nox/nox-product-poc` (`cVault`), the "PoC 1:
Confidential Vault cERC-7984" mentioned in the agent's ground truth, but
**this official iExec PoC also targets Arbitrum Sepolia (421614)** in its
`hardhat.config.ts` and every script (`arbitrumSepolia`), not Ethereum
Sepolia: this reinforces the Spike 2 finding below.

Versions resolved via `npm view` (07/2026): `hardhat@3.11.1` (pinned to
`^3.9.0` in package.json, the same range tested by
`nox-hardhat-plugin@0.1.0`'s own devDependency),
`@nomicfoundation/hardhat-toolbox-viem@5.0.7` (pinned `^5.0.4`),
`@iexec-nox/handle@0.1.0-beta.13`, `@iexec-nox/nox-protocol-contracts@0.2.4`,
`@iexec-nox/nox-confidential-contracts@0.2.2`,
`@iexec-nox/nox-hardhat-plugin@0.1.0`. `hardhat-toolbox-viem` declares
`@nomicfoundation/hardhat-ignition`, `hardhat-ignition-viem`,
`hardhat-keystore`, `hardhat-network-helpers`, `hardhat-node-test-runner`,
`hardhat-viem`, `hardhat-viem-assertions`, `hardhat-verify`, and
`ignition-core` as **peerDependencies**, not dependencies: they must be
installed explicitly in the project (they don't come free with the
toolbox in Hardhat 3). Solidity pinned to `0.8.35` because
`contracts/sdk/Nox.sol` (package `nox-protocol-contracts@0.2.4`) requires
`pragma solidity ^0.8.35`: any lower version fails to compile;
`nox-confidential-contracts` only requires `^0.8.28`, so it's compatible.

We chose the **viem** stack (`@nomicfoundation/hardhat-toolbox-viem`),
without installing `@nomicfoundation/hardhat-ethers` alongside it: the
same choice made by the `nox-product-poc`/cVault reference, avoiding the
ground truth's "don't install both" warning.

`npm install` reports 23 vulnerabilities (7 low/2 moderate/14 high) via
`npm audit`: not investigated in this phase (they're transitive to the
Hardhat 3 / iExec-Nox beta ecosystem, not our own code); worth revisiting
before final deploy if time allows, but non-blocking for the hackathon.

Cosmetic, non-blocking warning: `npm view`/`npm install` print
`npm error config prefix cannot be changed from project config:
/mnt/c/Users/Inteli/.npmrc` on every command (there's a Windows
user-level `.npmrc`, outside the repo, with a `prefix=...` that conflicts
with WSL's global prefix), it never blocked any install or run.

**Source:** `npm view <pkg> version|dependencies|peerDependencies` (live
registry), tarballs downloaded and inspected under
`node_modules/@iexec-nox/*` and `node_modules/encrypted-types`,
`https://api.github.com/orgs/iExec-Nox/repos`,
`raw.githubusercontent.com/iExec-Nox/nox-hardhat-plugin/main/...`,
`raw.githubusercontent.com/iExec-Nox/nox-product-poc/main/cVault/contracts/...`.

**Decision:** `hardhat.config.ts` at the repo root with
`solidity: "0.8.35"`, plugins `[hardhatToolboxViemPlugin, noxPlugin]`,
explicit `nox: { skipTestOverride: false }`, and networks
`hardhatMainnet`/`hardhatOp` (generic local EDR), `sepoliaFork` (EDR fork
of Ethereum Sepolia preserving chainId 11155111), and `sepolia` (`http`,
`chainType: "op"`, `chainId: 11155111`, RPC via
`configVariable("SEPOLIA_RPC_URL")` in the Hardhat keystore, private key
via `.env`/`DESK_OWNER_PRIVATE_KEY`). Validated for real: `npm install`
(187 packages, no errors), `npx hardhat compile` (downloads solc 0.8.35,
"No contracts to compile": expected, `contracts/` still empty by design),
and a `hardhat run` script confirming `hre.config.networks` correctly
lists `noxHost`, `noxLocal` (injected by the plugin), `hardhatMainnet`,
`hardhatOp`, `sepoliaFork`, `sepolia` with no name collisions.

---

### Phase 0: Spike 1/4: netting via composed primitives (Plan A), 2026-07-20

**Context:** confirm, before designing `AfterHoursDesk.sol`, that batch
netting (buy-side sum, sell-side sum, matched quantity, residuals) is
genuinely expressible using only the primitives available on the Runner
today: with no "custom matching function" whatsoever.

**What happened:**
- `docs.noxprotocol.io/llms-full.txt` literally confirms it: the section
  "### Custom Functions" → "::: info Coming Soon: Developers will be able
  to define their own confidential functions (e.g. swap, borrow, repay) by
  composing core primitives... :::". It does not exist today.
- The real source code of `contracts/sdk/Nox.sol`
  (`@iexec-nox/nox-protocol-contracts@0.2.4`, downloaded and read line by
  line) confirms exactly the primitive set from the agent's ground truth,
  with exact signatures:
  - `add/sub/mul/div(euintN a, euintN b) returns (euintN)`: wrapping.
  - `safeAdd/safeSub/safeMul/safeDiv(euintN a, euintN b) returns (ebool
    success, euintN result)`.
  - `eq/ne/lt/le/gt/ge(euintN a, euintN b) returns (ebool)`.
  - `select(ebool cond, euintN ifTrue, euintN ifFalse) returns (euintN)`.
  - `transfer(euint256 balanceFrom, euint256 balanceTo, euint256 amount)
    returns (ebool success, euint256 newBalanceFrom, euint256 newBalanceTo)`
   , note: it operates on **balance handles**, not on `address`; mapping
    handle→address is the calling contract's job (e.g. an
    `address => euint256` mapping in the cToken), not the `Nox` library's.
  - `mint(euint256 balanceTo, euint256 amount, euint256 totalSupply)
    returns (ebool success, euint256 newBalanceTo, euint256 newTotalSupply)`
    and symmetric `burn`: same handle-based logic, not address-based.
  - All of the above primitives exist for `ebool`, `euint16`, `euint256`,
    `eint16`, `eint256` (5 types, the same ones `encryptInput` supports —
    see Spike 3).
  - ACL: `allow/allowThis/allowTransient/disallowTransient/addViewer/
    allowPublicDecryption/isAllowed/isViewer/isPubliclyDecryptable`, and
    `publicDecrypt(handle, decryptionProof)` (on-chain proof verification,
    not the asynchronous decrypt itself).

- **Real prototyping (not just reading docs):** I wrote a throwaway
  contract, `SpikeNetting.sol`, implementing exactly the Plan A chain —
  `safeAdd` (buy-side sum), `safeAdd` (sell-side sum), `lt`+`select`
  (matched quantity = min), `safeSub`×2 (residuals): using
  `Nox.toEuint256` (trivial encryption) only to skip
  `encryptInput`/proof plumbing in this throwaway test (production uses
  `externalEuint256`+proof via `Nox.fromExternal`, never plaintext). I
  brought up the full local off-chain stack via `npx hardhat test` (which
  triggers the `nox-hardhat-plugin`'s task override: Docker Compose with
  `nox-kms`, `nox-handle-gateway`, `nox-ingestor`, `nox-runner`, `nats`,
  `minio/s3`) and ran `netTwoVsTwo(30, 50, 20, 45)`.
  - Real result decoded via `nox.publicDecrypt`: `matched = 65`
    (min(80, 65)), `buyResidual = 15` (80−65), `sellResidual = 0` (65−65)
   : the math checks out exactly, tx
    `0x915b74167aa459a20d76c7baf4b3e8aec5e6adb4a4c2c89e44b3534b3803d134`
    in ~4.07s of wall-clock time **after** the stack was already warm
    (see Spike 4).
  - A bug I lost time debugging (documented here so it doesn't repeat): the
    wrong connection matches a **misleading** error. I used plain
    `network.connect()` from Hardhat (not the plugin's `nox.connect()`) to
    do the deploy: this connects to a *different* EDR-simulated chain than
    the one the plugin boots/injects `NoxCompute` into (port 8545, network
    `noxLocal`), so the call hits an address with no real `NoxCompute`. The
    viem error doesn't say "no contract at this address": it says
    `ContractFunctionExecutionError: ... reverted ... function returned an
    unexpected amount of data`, pointing inside `Nox.toEuint256`/
    `wrapAsPublicHandle`: it looked like a bug in the primitive itself, it
    wasn't. Fixed by using `nox.connect()` (from
    `@iexec-nox/nox-hardhat-plugin` itself), which returns
    `{ viem, handleClient }` already pointed at the `noxLocal` network with
    `NoxCompute` injected. Confirmed by reading the plugin's actual
    integration tests
    (`packages/example-project/test/integration/*.test.ts` on GitHub) —
    those are the correct usage reference, not the README in isolation.
  - A second dead end along the way: `hardhat test nodejs` (calling the
    subtask directly) does **not** trigger the plugin's `test` override —
    Docker Compose only boots when the parent task `hardhat test` is
    called (without a subtask). Running `test nodejs`/`test solidity`
    directly silently skips the `nox-hardhat-plugin`'s hook (no warning),
    and later fails with `Error: [nox] Handle gateway host port is not
    set`, confusing at first glance, but that's all it is.
  - Spike files (`contracts/_SpikeNetting.sol`,
    `test/unit/_spike.netting.test.ts`) were **removed** once validated —
    Phase 0 is foundation only, the real `AfterHoursDesk.sol` comes in
    Phase 3.

**Source:** `docs.noxprotocol.io/llms-full.txt` lines ~4383-4391;
`node_modules/@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol`
(package `0.2.4`, downloaded from the registry and read in full);
`github.com/iExec-Nox/nox-hardhat-plugin` →
`packages/example-project/test/integration/{stack,nox-api,MyConfidentialToken}.test.ts`;
real local execution (Docker) in this session.

**Decision:** Plan A confirmed viable and **tested**, not just assumed.
Set for Phase 3: `AfterHoursDesk.settleBatch()` is not a single call: it's
a chain of N calls into the `Nox` library, each its own async job (see
Spike 4 on aggregate latency). To allocate per-order (pro-rata) fill
within the aggregate `matched` amount, not just the aggregate, one more
O(batch size) chain of `safeSub`/`select` per order will be needed (the
"remaining capacity" pattern, the same `Nox.le`+`Nox.select` already used
by the `cVault` PoC itself for clamps, per the `cVault` README's own
`TODO(prod)`: "Enforced reverts on encrypted comparisons are not possible;
a production vault would clamp via `Nox.le` + `Nox.select`"). Plan B
(commit-reveal) remains documented as a fallback, not the default.

---

### Phase 0: Spike 2/4: forced Sepolia config, 2026-07-20

**Context:** confirm whether the JS SDK's (`@iexec-nox/handle`) network
auto-detection can be trusted for Ethereum Sepolia (11155111), or whether
explicit config must be forced.

**What happened, the day's most important finding:** the text of
`llms-full.txt` (lines ~4243-4254) states: "Full SDK support for it
[Ethereum Sepolia] ships with an upcoming `@iexec-nox/handle` release —
until then the SDK auto-resolves configuration for Arbitrum Sepolia
(421614)." **This is outdated relative to the published code.** I
downloaded the real npm tarball (`@iexec-nox/handle@0.1.0-beta.13`, the
latest version today) and the file `src/config/networks.ts` already
contains a hardcoded `NETWORK_CONFIGS` with a full entry for `11_155_111`
(Ethereum Sepolia):
```ts
11_155_111: {
  gatewayUrl: 'https://gateway-testnets.noxprotocol.dev',
  smartContractAddress: '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf',
  subgraphUrl:
    'https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo',
},
```
In other words, auto-detection **already works correctly** for chainId
11155111 in the SDK installed today: contradicting the doc's warning.
Even so, given that (a) the public doc still warns otherwise, (b) this
behavior may have differed in earlier betas and may change again, and
(c) iExec's own official PoC (`nox-product-poc`/cVault) **does not use**
Ethereum Sepolia at all: it uses only Arbitrum Sepolia across its entire
`hardhat.config.ts`, scripts, and e2e tests: blind trust isn't warranted.
Also confirmed on the Solidity side: `Nox.sol::noxComputeContract()` has
an explicit branch for `block.chainid == 11155111` returning
`0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`: the on-chain protocol
**already supports** Ethereum Sepolia today, even though the JS SDK
documentation treats it as "upcoming."

Also confirmed: `gatewayUrl`/`smartContractAddress`/`subgraphUrl` **never
appear as a literal string anywhere in `llms-full.txt`** for any network —
they only exist hardcoded in the SDK's source code
(`src/config/networks.ts`). Without downloading and reading the package
tarball, there would be no way to discover the real
`gatewayUrl`/`subgraphUrl` values for Ethereum Sepolia from the public
docs alone: one would have to guess or ask on Discord.

**Source:** `docs.noxprotocol.io/llms-full.txt` lines ~4233-4254;
`node_modules/@iexec-nox/handle/src/config/networks.ts` (package
`0.1.0-beta.13`, downloaded from `registry.npmjs.org` and read in full);
`node_modules/@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol`
function `noxComputeContract()`;
`raw.githubusercontent.com/iExec-Nox/nox-product-poc/main/cVault/contracts/hardhat.config.ts`.

**Decision:** even though auto-detection appears functional today, we
follow the ground-truth rule: **never** trust auto-detection. Every
`handleClient` creation (Phase 2+) will pass explicit `gatewayUrl`,
`smartContractAddress`, and `subgraphUrl` with the values above, plus a
`chainId === 11155111` assertion right at the start of every script/page
that talks to Nox: so we don't silently regress if a future SDK version
changes the default again. Phase 0's `hardhat.config.ts` already forces
`chainId: 11155111` explicitly on the `sepolia` network (never lets
Hardhat infer it from the RPC).

---

### Phase 0: Spike 3/4: types supported by `encryptInput`, 2026-07-20

**Context:** confirm which Solidity types can be used for private fields
in the dark pool's order ticket.

**What happened:** the doc (`llms-full.txt` lines ~3448-3466) lists
`bool`, `address`, `bytes`/`string`, `uintN`, `intN`, `bytesN` as
"supported types," but almost all marked `(coming soon)`, with a final
note: "Only `bool`, `uint16`, `uint256`, `int16`, and `int256` are
currently supported at runtime." **Real friction found:** the code block
immediately BEFORE that note (line ~3432-3437) shows an example,
`handleClient.encryptInput('0x742d...', 'address', CONTRACT_ADDRESS)`,
with no warning at all: i.e. the doc has a code example that would throw
a runtime error today, right above the paragraph saying it would throw an
error. Confirmed by reading the real source code:
`src/methods/encryptInput.ts` (`@iexec-nox/handle@0.1.0-beta.13`) has:
```ts
const NOX_SUPPORTED_TYPES = ['bool', 'uint16', 'uint256', 'int16', 'int256'];
...
function assertNoxSupportedType(type: string): void {
  if (!NOX_SUPPORTED_TYPES_SET.has(type)) {
    throw new TypeError(`Unsupported Solidity type for encryption: ${type}. ...`);
  }
}
```
called unconditionally inside `encryptInput()` before any call to the
Gateway: `address`/`bytes`/`string`/`uint8`/etc. really do throw a
client-side `TypeError` today. Matches the agent's ground truth 100%.

**Source:** `docs.noxprotocol.io/llms-full.txt` lines ~3420-3466;
`node_modules/@iexec-nox/handle/src/methods/encryptInput.ts` (package
`0.1.0-beta.13`, read in full).

**Decision:** confirmed: no order-ticket field that needs to stay private
can be `address`/`bytes`/`string`. Amount = `uint256`, side (buy/sell) =
`bool` or a small `uint16` enum. Counterparty, order id, and any similar
metadata stay in the clear (a normal function parameter, not a handle) —
exactly as the ground truth already anticipated; no plan change needed,
just confirmation backed by source-code evidence instead of memory.

---

### Phase 0: Spike 4/4: single-Runner latency, 2026-07-20

**Context:** understand whether `settleBatch()` can be treated as
synchronous in the UI/demo, or whether it needs polling/retry.

**What happened:** `docs.noxprotocol.io/llms-full.txt`
(`/protocol/runner.md`, lines ~6705-6728) literally confirms: "The current
implementation runs a **single Runner**. In the long-term architecture,
multiple Runners will operate in parallel, coordinated by a TDX
orchestrator...", and the whole flow is async by design: `Nox.add`/
`safeAdd`/etc. only emit an on-chain event (a handle with no ciphertext
yet); the Ingestor polls blocks, publishes to NATS, the Runner pulls from
the queue, decrypts, computes, encrypts the result (ECIES), and only then
writes to the Handle Gateway: none of these steps happen within the same
transaction, nor is there a synchronous callback. The SDK
(`nox.decrypt`/`nox.publicDecrypt` in `@iexec-nox/nox-hardhat-plugin`, and
implicitly `handleClient.decrypt`/`publicDecrypt`) already embeds retry:
`RESOLVE_MAX_RETRIES = 60` × `RESOLVE_DELAY_MS = 100ms` = up to 6s of
polling in `nox-hardhat-plugin` before giving up with
`Handles not resolved after 60 attempts (6s)`.

**Real empirical data from this session** (not just docs): bringing up
the local off-chain stack via Docker Compose (`nox-kms`,
`nox-handle-gateway`, `nox-ingestor`, `nox-runner`, `nats`, `minio`)
dominates the wall-clock time of a cold `hardhat test` run (images +
health checks, tens of seconds). Once the stack is "warm," the composed
chain of **6 chained primitives** (2×`safeAdd` + 1×`lt` + 1×`select` +
2×`safeSub`, all inside a single tx in the netting spike) resolved and
publicly decrypted 3 handles end to end in **~4.07s** (tx → Ingestor →
NATS → Runner → Handle Gateway → `publicDecrypt`): i.e. every additional
async job adds perceptible latency (parallelizing inside the same tx
isn't free: the Runner processes the queue sequentially, "single
Runner"). A real `settleBatch()` with N orders per side will chain O(N)
of these jobs (Spike 1): latency tends to grow linearly with batch size,
not stay a small constant.

**Source:** `docs.noxprotocol.io/llms-full.txt` `/protocol/runner.md`
lines ~6705-6728 and `/protocol/ingestor.md`/`/protocol/nox-compute.md`
lines ~6300-6337; `node_modules/@iexec-nox/nox-hardhat-plugin/src/nox-config.ts`
(`RESOLVE_MAX_RETRIES`/`RESOLVE_DELAY_MS` constants); real local execution
(Docker) in this session, tx
`0x915b74167aa459a20d76c7baf4b3e8aec5e6adb4a4c2c89e44b3534b3803d134`.

**Decision:** the UI/demo (Phase 3+) and the video script
(`video-script.md`) must treat `settleBatch()` as fire-and-forget followed
by a loading state with poll/retry (never assume synchronous
confirmation), already noted in `video-script.md` as the 2:00–2:45 scene.
For the demo batch, keep N small (few orders per side) so the aggregate
latency comfortably fits the video's 4-minute window.

---

### Phase 0: Credentials and signer security, 2026-07-20

**Context:** obtain a Sepolia wallet/RPC/Etherscan key (an action
requiring the user's own account, not automatable) and store them safely
in the repo.

**What happened:** the original scaffold (from nox-chain-architect) had a
mismatch: `hardhat.config.ts` read `DESK_OWNER_PRIVATE_KEY` from
`process.env`/`.env` (via `dotenv-cli`), while `SEPOLIA_RPC_URL` and
`ETHERSCAN_API_KEY` already used the encrypted Hardhat keystore
(`configVariable`). That would leave the most sensitive secret (the key
that moves funds) in plaintext in a local `.env`, while "infrastructure
only" secrets were encrypted: an inverted risk priority. Fixed: all three
now resolve via `configVariable`/keystore
(`npx hardhat keystore set --dev <KEY>`), none in `.env`.

Also discovered in practice: `npx hardhat keystore set` (production
keystore) hangs with multiple sequential password prompts when stdin is
fed via a pipe (several `readline` instances on the same stream don't
coexist well): using `--dev` (development keystore, a master password
generated and stored locally, outside the repo) avoids the problem since
it only requires a single prompt (for the secret itself).

Verified end to end with real values: Alchemy's RPC connected to real
Sepolia via `network.connect("sepoliaFork")` (chainId 11155111, a real
block read); the address derived from the stored private key matches
exactly the wallet the user provided, real balance of 0.05 SepoliaETH read
on-chain via `network.connect("sepolia")`.

**Source:** `@nomicfoundation/hardhat-keystore` source code
(`src/internal/tasks/set.js`, `src/internal/hook-handlers/configuration-variables.js`,
`src/internal/keystores/password.js`) and
`hardhat/dist/src/types/config.d.ts`
(`SensitiveString = string | ConfigurationVariable`, confirming `accounts`
accepts `configVariable()` directly).

**Decision:** every secret (RPC, Etherscan, private key) lives only in the
Hardhat `--dev` keystore, never in `.env`. `.env`/`.env.example` are
reserved only for non-sensitive values (the signer's public address,
addresses of contracts deployed in later phases).

---

### Phase 0: cToken: our own test token instead of a third-party USDC, 2026-07-20

**Context:** decide the base of the `cUSDC` wrapper (Phase 1): use an
already-existing Sepolia test USDC, or create our own ERC-20 mock.

**Decision:** we chose to deploy our own mock ERC-20 (6 or 18 decimals, to
be decided in Phase 1) to serve as the base for the ERC-7984 wrapper,
instead of depending on a third-party test USDC. Reasoning: (1)
"test USDC" addresses on Sepolia vary by source, not infrequently run out
of faucet liquidity or go dark without notice: external dependency is
exactly the "demo breaks the night before" risk the latency spike above
already made us wary of; (2) full control over supply/mint makes it easy
to generate demo balances deterministically for the video and for E2E
tests, without depending on a third-party faucet; (3) nothing in the
hackathon rubric requires an "official" USDC: just a real ERC-20 on
Sepolia backing the confidential wrapper. Accepted trade-off: our own mock
is obviously "not real USDC," but that's transparent and documented, not
silently mocked: the frontend's (Phase 5) "no mock data" golden rule
refers to contract/state data shown in the UI, not to which test ERC-20
backs the wrapper.

---

## Phase 1: cToken

### Phase 1: Etherscan verification, 2026-07-21

**Context:** after the hackathon-watchdog pointed out that a real but
unverified deploy counts against the "live deploy" rubric criterion (less
auditable for a judge), we verified the two Phase 1 contracts on
Etherscan.

**What happened:** `npx hardhat verify --network sepolia <address>
<constructor-args>` worked on the first try for both contracts, with no
friction at all: the `@nomicfoundation/hardhat-verify` plugin already
verifies automatically across three services at once (Etherscan,
Blockscout, Sourcify) with a single call:
- `MockUSDC` (`0x68df20bfc035f6496e0593626579d00139aaa49c`, constructor
  arg `1000000000000` = 1,000,000 mUSDC at 6 decimals) —
  https://sepolia.etherscan.io/address/0x68df20bfc035f6496e0593626579d00139aaa49c#code
- `ConfidentialUSDC` (`0x45dd58bea3f072ce8cf704a43abc41be27337e4e`,
  constructor arg `0x68df20bfc035f6496e0593626579d00139aaa49c` = the
  underlying MockUSDC address) —
  https://sepolia.etherscan.io/address/0x45dd58bea3f072ce8cf704a43abc41be27337e4e#code

**Source:** real execution (`npx hardhat verify`) in this session;
`ETHERSCAN_API_KEY` already configured in the keystore since the
credentials setup.

**Decision:** verify each contract right after deploy, within the same
phase: don't let it pile up for the end, when constructor arguments are
no longer "fresh" in context.

---

### Phase 1: `ERC20ToERC7984Wrapper` confirmed real, not hypothetical, 2026-07-21

**Context:** Phase 0's `.env.example` had a note asking to confirm whether
`ERC20ToERC7984Wrapper` was the real name of the base contract in
`@iexec-nox/nox-confidential-contracts@0.2.2`, or a hypothetical name
inherited from the agent's ground truth.

**What happened:** confirmed by reading the installed source code in full
(not assumed): the contract exists at exactly this path —
`node_modules/@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol`
— with constructor signature
`(string name, string symbol, string contractURI, IERC20 underlying)`
(inheriting from `ERC20ToERC7984WrapperBase`, which in turn inherits
`ERC7984Base`). `wrap(address to, uint256 amount)` takes the amount in
**plaintext** (correct: the underlying ERC-20's value is already public,
only the confidential side gets `euint256`), does a
`SafeERC20.safeTransferFrom` of the underlying token and `_mint` (which
internally converts via `Nox.toEuint256(amount)` and stores the handle).
The `unwrap(from, to, euint256 amount)` overload requires
`Nox.isAllowed(amount, msg.sender)` (the caller must already hold ACL over
the handle it's passing); the `unwrap(from, to, externalEuint256, bytes
proof)` overload accepts a freshly encrypted value via `Nox.fromExternal`.
Neither accepts a plain `uint256` for the amount to unwrap: **the "amount"
is never plaintext on unwrap**, only on wrap (where it makes sense, since
that's the pure ERC-20 side coming in).

Additional finding, not anticipated by the original brief:
`confidentialTotalSupply()` on the wrapper is **decryptable by no one** —
not even the deployer, not even publicly. `_updateWithOptimizedPrimitives`'s
mint branch only calls `Nox.allowThis(newTotalSupply)` (ACL for the
contract itself only, for internal reuse in future calls), never
`Nox.allow(newTotalSupply, someExternalAddress)` nor
`Nox.allowPublicDecryption`. This differs from the `nox-hardhat-plugin`'s
own `MyConfidentialToken.sol` example (which is a native `ERC7984`, not a
wrapper, and explicitly calls
`Nox.allowPublicDecryption(confidentialTotalSupply())` in its
constructor). Tested and confirmed in
`test/unit/ConfidentialUSDC.test.ts` ("wrap()'s recipient's confidential
balance handle is not publicly decryptable...": the same ACL pattern
applies to total supply, not just individual balances).

**Source:**
`node_modules/@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol`,
`.../extensions/ERC20ToERC7984WrapperBase.sol`,
`.../token/ERC7984Base.sol` (read in full before writing
`contracts/ConfidentialUSDC.sol`).

**Decision:** `ConfidentialUSDC.sol` is a thin shell: just the
constructor, passing `("Confidential USDC", "cUSDC", "", underlying)` to
`ERC20ToERC7984Wrapper`. No custom ACL logic was added on top: the base
contract already does `allowThis`/`allow`/`allowPublicDecryption`
correctly for every handle it creates, confirmed by reading the code, not
assumed. cUSDC's total-supply confidentiality (no one decrypts it, not
even the deployer) is a property we chose to **keep**, not "fix": it's an
extra privacy feature for the dark pool (hiding even the aggregate volume
on the confidential side), documented here so it isn't mistaken for a bug
on demo/video day.

---

### Phase 1: Foundation bug: `hardhat test test/unit` doesn't expand a directory, 2026-07-21

**Context:** running `npm test` (`hardhat test test/unit`, defined in
Phase 0 before any test file existed) for the first time with real test
files.

**What happened:** `hardhat test <path>` treats every positional argument
as a **specific file** to import via ESM (delegating to native
`node:test`), not as a directory to scan: passing `test/unit` (a
directory) fails with
`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../test/unit/index.ts'`,
a message that (incorrectly) suggests a missing `index.ts` file.
Confirmed by reading
`node_modules/@nomicfoundation/hardhat-node-test-runner/dist/src/task-action.js`:
the `getTestFiles()` function only does `getAllFilesMatching()`
(recursive scan) when the `testFiles` list is **empty** (i.e. `hardhat
test` with no arguments scans all of `config.paths.tests.nodejs`); with
any argument present, each one is used literally as a module path.
`hardhat test test/unit/*.test.ts` (an **unquoted** glob, expanded by the
shell before reaching Hardhat) works; `hardhat test
"test/unit/**/*.test.ts"` (quoted, i.e. passed literally with `*` to
Hardhat) does NOT work: Hardhat does not do its own glob matching.

**Source:**
`node_modules/@nomicfoundation/hardhat-node-test-runner/dist/src/task-action.js`
(`getTestFiles`), tested live with `npx hardhat test test/unit`,
`npx hardhat test "test/unit/**/*.test.ts"`, `npx hardhat test
test/unit/*.test.ts`, and `npx hardhat test` (no argument).

**Decision:** `package.json` fixed: `"test"`/`"test:unit"` now use
`hardhat test test/unit/*.test.ts` (unquoted glob, shell-expanded)
instead of `hardhat test test/unit`; the same fix applied to
`"test:e2e:sepolia"` (`test/e2e/*.test.ts`). This assumes a POSIX shell
(bash/zsh) running `npm run`, acceptable for this project (WSL/Linux/
Mac), but noted here in case anyone tries to run it under a plain
`cmd.exe`/PowerShell on Windows without glob expansion.

---

### Phase 1: `@iexec-nox/handle`: `getAddress()` via `getAddresses()[0]` breaks local multi-account testing, 2026-07-21

**Context:** testing `confidentialTransfer` between TWO different accounts
against the local Nox stack (Docker), where each account needs its own
`handleClient` to decrypt (via `nox.decrypt`) its own resulting balance —
the second account (`recipient`) can't reuse the plugin's default
`handleClient` from `nox.connect()`, which is always bound to the FIRST
wallet client.

**What happened:** building a dedicated `handleClient` via
`createViemHandleClient(recipientWalletClient, config)` and calling
`.decrypt(recipientBalanceHandle)` failed with
`Error: Handle (...) does not exist or user (0xf39Fd6...) is not
authorized to decrypt it`, but `0xf39Fd6...` is the address of
Hardhat's FIRST default account (`sender`), not the second one
(`recipient`) that should have been decrypting! Root cause, confirmed by
reading the installed source code:
`ViemBlockchainService.WalletClientAdapter.getAddress()`
(`node_modules/@iexec-nox/handle/src/services/blockchain/ViemBlockchainService.ts`)
resolves the "connected" address via `walletClient.getAddresses()[0]` —
not via `walletClient.account.address`. Every wallet client obtained from
`viem.getWalletClients()` on the `noxLocal` network (an `http` network
with no explicit `accounts` in the config) is a viem account of type
`"json-rpc"` (just an address pointing to an already-unlocked node
account), and viem's own `getAddresses()`, for `"json-rpc"` accounts
(unlike `"local"`/private-key-based accounts), **ignores** which specific
address was passed to the client's `account:` and simply calls
`eth_accounts` on the provider: which returns the SAME full list of node
accounts, so `[0]` is always the node's very first account, no matter
which wallet client you started from.

This only affects LOCAL multi-account testing against `noxLocal`
(json-rpc accounts). The single signer used in real deploy/E2E scripts
against Sepolia (`accounts: [configVariable("DESK_OWNER_PRIVATE_KEY")]`
in `hardhat.config.ts`) is a viem `"local"` account (built directly from a
private key), for which `getAddresses()` already correctly returns
`[account.address]` without touching the provider: so no Sepolia script
is affected by this.

**Source:**
`node_modules/@iexec-nox/handle/src/services/blockchain/ViemBlockchainService.ts`
(`WalletClientAdapter.getAddress()`); viem's own `getAddresses()`/
`"json-rpc"` vs `"local"` account behavior
(`node_modules/@nomicfoundation/hardhat-viem/src/internal/{accounts,clients}.ts`
confirms `getAccounts()` returns bare addresses, and
`createWalletClient({account: <bare address>})` produces a `"json-rpc"`
account); reproduced and debugged live in
`test/unit/ConfidentialUSDC.test.ts`.

**Decision:** instead of assuming well-known Hardhat test private keys
(which would work, but would require hardcoding "well-known" keys in test
code), we wrapped the wallet client in a `Proxy` that only overrides
`getAddresses()` to return `[walletClient.account.address]` directly,
forwarding everything else (including `.extend()`, which the SDK relies on
for `readContract`/`getBlockNumber`) to the real client —
`withExplicitAddress()` in `test/unit/ConfidentialUSDC.test.ts`. This is
local-testing friction, not a production bug: no change was needed in the
contracts or in the Sepolia scripts.

---

### Phase 1: cToken deployed and tested end to end on real Sepolia, 2026-07-21

**Context:** real (not forked, not mocked) deploy of `MockUSDC` and
`ConfidentialUSDC` on Ethereum Sepolia, followed by a real E2E smoke test
(wrap + decrypt) using the account configured in the keystore
(`0x3e442e77ee3d7514ab6600b539cb76a5a73ec3b0`).

**What happened:** the 7 unit tests (`test/unit/MockUSDC.test.ts`,
`test/unit/ConfidentialUSDC.test.ts`) pass against the local Nox stack
(Docker): `npm test`. Real deploy executed with
`npx hardhat run scripts/deploy/01-deploy-mock-usdc.ts --network sepolia`
and `.../02-deploy-confidential-usdc.ts`, addresses recorded in
`deployments/sepolia.json`:
- `MockUSDC`: `0x68df20bfc035f6496e0593626579d00139aaa49c`
- `ConfidentialUSDC` (cUSDC): `0x45dd58bea3f072ce8cf704a43abc41be27337e4e`

`scripts/e2e/wrap-check.sepolia.ts` (`npm run e2e:wrap-check:sepolia`) —
faucet + approve + wrap of 25.000000 mUSDC by the signer's account, then
`handleClient.decrypt()` (with explicit Sepolia config, Spike 2) on the
resulting confidential-balance handle: run TWICE, idempotently (the
script compares the delta before/after, not the absolute balance, since
it's re-runnable). First run: the decrypted balance matched exactly the
wrapped value (25,000,000, decrypt resolved on the first attempt, no
retry needed). Second run: the confidential balance BEFORE the wrap
already decrypted to 50,000,000 (25M from the previous run + 25M from an
intermediate debugging run); after the new wrap the balance rose to
75,000,000: a delta of exactly 25,000,000, confirmed; this time
`decrypt()` needed 1 retry (`[poll] ... not ready yet (attempt 1/30)`)
before resolving: real evidence (not just the docs) that the single
Runner introduces perceptible latency even on Sepolia, exactly as
predicted by the Day-1 Spike 4. Signer balance after every deploy +
transaction this phase: ~0.0463 SepoliaETH (from 0.05 initially) —
comfortable headroom for the next phases.

**Source:** real execution in this session (deploy, approve, wrap, faucet
transactions, and real calls to
`https://gateway-testnets.noxprotocol.dev` via `handleClient.decrypt()`);
`deployments/sepolia.json`.

**Decision:** Phase 1 complete. The addresses above are the official ones
for the following phases: `AfterHoursDesk.sol` (Phase 3) will receive
`ConfidentialUSDC`'s address as its settlement cToken. No step in this
phase used mocked data: `MockUSDC`/`ConfidentialUSDC` are real contracts
deployed on real Sepolia, and the smoke test decrypts a real handle via the
real Handle Gateway.

---

## Phase 2: AfterHoursDesk.sol core

### Phase 2: Real bug: viem's `.simulate.*` ignores the bound wallet client, 2026-07-22

**Context:** while writing `test/unit/AfterHoursDesk.test.ts` (buyer/seller
multi-account netting), tests using `deskAsSeller` (a contract instance
bound to the seller's wallet client via `viem.getContractAt(...,
{ client: { wallet: withExplicitAddress(seller) } })`) consistently failed
with `InvalidProof(proof, "Owner mismatch")` when calling
`deskAsSeller.simulate.submitOrder(...)`, even with a correct
`encryptInput` proof (confirmed byte by byte: `owner` embedded in the
proof = the seller's address, `app` = the desk's address, both correct).

**What happened:** this is not a Nox bug: it's a real gotcha in viem
itself. Reading `node_modules/viem/_esm/actions/getContract.js`: a
contract's `.write.*` accessor uses the **bound wallet client**
(`getAction(walletClient, writeContract, ...)`), but `.simulate.*` uses
the **public client** (`getAction(publicClient, simulateContract, ...)`)
**without** falling back to `walletClient.account` by default, unlike
`.estimateGas`, which explicitly does
`account: options.account ?? walletClient.account`. In other words:
`deskAsSeller.simulate.submitOrder(...)` executes the `eth_call` as the
public client's default account (the buyer, in this project), not as the
seller, even though `deskAsSeller` was only created to "be" the seller.
`Nox.fromExternal` then receives `msg.sender` = buyer, which doesn't match
the `owner` = seller embedded in the proof, and reverts with "Owner
mismatch." `.write.submitOrder(...)` (the real transaction) was already
using the right account: the bug only affects the `.simulate` call used
to read the return value (`orderId`) before sending the real tx.

Diagnosing this required real prototyping, not just reading docs: a
throwaway script confirmed (a) that `tx.from` for a real write via
`deskAsSeller.write.*` was already the seller (correct), (b) manual
byte-by-byte decoding of the proof confirming `owner`/`app` were correct,
and only then (c) an isolated reproduction of `.simulate` vs. `.simulate`
with an explicit `{ account: ... }` confirmed the root cause.

**Source:** `node_modules/viem/_esm/actions/getContract.js` (lines
~80-115, direct comparison of how `contract.simulate`, `contract.write`,
and `contract.estimateGas` are built); empirical reproduction in this
session (throwaway scripts, removed after confirmation).

**Decision:** every `.simulate.<fn>(args)` call on a contract instance
bound to a non-default account MUST explicitly pass
`{ account: <wallet>.account }` as a second argument: never trust that
binding the `wallet` client in `getContractAt` is enough for `.simulate`.
Applied in `test/unit/AfterHoursDesk.test.ts` (the 3
`deskAsSeller.simulate.submitOrder(...)` calls). Applies to any future
multi-account test in this project (Phase 3+ when testing ACL between
counterparties).

---

### Phase 2: AfterHoursDesk.sol: final result, 2026-07-22

**Context:** the settlement core: `submitOrder()`/`settleBatch()` with
netting via composed primitives (Plan A from the Phase 0 spike) and real
confidential-balance movement via `cUSDC`.

**What was delivered:**
- `contracts/AfterHoursDesk.sol` +
  `contracts/interfaces/IConfidentialSettlement.sol`. Netting: chained
  `safeAdd` per side, `lt`+`select` for
  `matched = min(buySum, sellSum)`, `safeMul`+`safeDiv`+`safeSub` for
  per-order pro-rata fill/residual. Only `matched` and the execution price
  (a placeholder until Phase 4) are ever publicly decryptable, individual
  order size, never.
- A real technical finding, not documented in the ground truth, confirmed
  by reading iExec's own `cVault` reference: `cUSDC`'s
  `confidentialTransferFrom`/`confidentialTransfer` internally execute
  `Nox.transfer` from `cUSDC` ITSELF (not from `AfterHoursDesk`): so the
  `amount` handle computed by the desk needs an explicit
  `Nox.allowTransient(amount, address(cUSDC))` before calling those
  functions, or the call reverts with `NotAllowed` because the automatic
  transient ACL only covers whoever computed the handle (the desk), not
  whoever actually consumes it (cUSDC).
- ACL: only the structural minimum (each trader decrypts their own order/
  residual). `ViewerRegistry.sol`/`grantAuditorAccess` explicitly NOT
  built yet: that's Phase 3.
- Execution price: a documented public placeholder
  (`PLACEHOLDER_EXECUTION_PRICE`), not real Uniswap yet: that's Phase 4.
- Real viem bug found and fixed during multi-account testing (see entry
  above): `.simulate.*` ignores the bound wallet client.
- Real deploy: `AfterHoursDesk` at
  `0x5a3b87a57927ab415c7b368aa36bfdc2df9933f9` (Sepolia), constructor
  `cUSDCAddress = 0x45dd58bea3f072ce8cf704a43abc41be27337e4e`. Verified on
  Etherscan/Blockscout:
  https://sepolia.etherscan.io/address/0x5a3b87a57927ab415c7b368aa36bfdc2df9933f9#code
- Unit tests (local Nox stack, TWO real local accounts: genuinely
  distinct buyer and seller, real netting between them): 4/4 passing
  (rejection with no operator; buy>sell; sell>buy; buy==sell), including
  confirmation that both accounts' confidential cUSDC balances genuinely
  changed and that neither trader can decrypt the other's residual.
- Real E2E on live Sepolia (`scripts/e2e/settle-check.sepolia.ts`), with
  the known, documented limitation of ONE single funded account playing
  both legs of a trivial order (not mocked data: a genuine testnet-funds
  limitation, already covered by the Phase 2 plan's own caveat). Real
  result: `matched=6000000` (6 mUSDC), buyer residual=4000000, seller
  residual=0, the signer's confidential balance returned exactly to its
  pre-order value (75000000) after the full round trip: confirming the
  desk genuinely pulled and returned real balance via
  `confidentialTransferFrom`/`confidentialTransfer`, not loose bookkeeping.

**Pending, explicitly for the next phases:** the auditor's ACL/Viewer
(Phase 3), real Uniswap integration (Phase 4).

---

## Phase 3: ACL / Viewer

### Phase 3: Post-watchdog hardening: `ViewerRegistry.setDesk`, 2026-07-23

**Context:** the hackathon-watchdog reviewed Phase 3 and approved it, but
flagged one minor, non-blocking risk: `ViewerRegistry.registerFill` had no
declared link to `AfterHoursDesk` specifically: the only authorization
barrier was Nox's own ACL (`onlyAllowed` in NoxCompute). Functionally
safe (proven by test), but relying entirely on a newly-launched
third-party protocol's ACL layer, with zero redundancy in the contract
itself, is the kind of "single point of failure" a company's security
review would flag.

**What was done:** added `address public desk` to `ViewerRegistry.sol`,
with a one-time setter (`setDesk(address)`, reverting `DeskAlreadySet` if
already set, `ZeroDesk` for the zero address) and a
`require(msg.sender == desk)` gate (reverting `OnlyDesk`) at the start of
`registerFill`. Not a constructor argument because `AfterHoursDesk` needs
the `ViewerRegistry`'s address first (an already-established deploy order)
— `desk` can only be known afterward.
`scripts/deploy/05-deploy-after-hours-desk.ts` now calls
`viewerRegistry.write.setDesk([desk.address])` right after deploying the
desk, in the same script run.

Redeploy required (the `ViewerRegistry` bytecode changed): new addresses
`ViewerRegistry` = `0xf74d72c7b3ab70ff90e474c61c220f6c4333a180`,
`AfterHoursDesk` = `0x52b47b62cd59e1f275c9ae24cb6e1d520a6e51d4` (the
previous Phase 3 addresses are superseded, same pattern already used in
the Phase 2 → Phase 3 transition). Both verified on Etherscan and
Sourcify; Blockscout failed specifically for `AfterHoursDesk` ("Fail -
Unable to verify," probably a Blockscout quirk with multi-file/multi-import
contracts: non-blocking, Etherscan and Sourcify already confirm the
source code).

Tests: 16/16 passing (13 previous + 3 new: `setDesk` rejects the zero
address, rejects being set twice, and `registerFill` rejects a caller that
isn't the desk). Real E2E on Sepolia (`auditor-check.sepolia.ts`) re-run
against the new addresses: `settleBatch()` → `ViewerRegistry.registerFill`
→ `Nox.addViewer` executed end to end again, confirming the new gate
didn't break the real flow.

**Source:** hackathon-watchdog review (Phase 3); real execution (`npx
hardhat verify`, `npm test`, `npm run e2e:auditor-check:sepolia`) in this
session.

**Decision:** the fix was applied immediately (low cost, ~15 minutes)
following the watchdog's recommendation not to let this compete for time
with Phases 4/5: resolved before moving on, not deferred.

---

### Phase 3: Real gap: `fill` was computed and discarded, 2026-07-23

**Context:** while resuming work on Phase 3 (the auditor's ACL),
re-reading Phase 2's `AfterHoursDesk.sol` revealed that `_computeFill`
already computed `(euint256 fill, euint256 residual)` and already granted
ACL over `fill` (`Nox.allowThis(fill)` + `Nox.allow(fill, order.trader)`)
— but `fill` was never written to `Order` nor exposed by any view
function. It was only used as a local variable to move balances
(`confidentialTransferFrom`/`confidentialTransfer`) and then discarded at
the end of the function's scope.

**What happened:** this means that, even though the ACL was already
technically correct (the `fill` handle was, in theory, already decryptable
by the trader), NO ONE could actually *reach* that handle after
settlement: there was no getter, no persisted field. Only `residual`
survived. In other words, the product promised "each counterparty decrypts
their own fill" but the data was never actually accessible to decrypt.

**Decision:** added an `euint256 fill` field to `Order`, written in
`_settleBuyOrder`/`_settleSellOrder` right after `_computeFill`, exposed
via `getOrderFillHandle(uint256 orderId)` in
`IConfidentialSettlement.sol` and in the implementation. Before
settlement, it returns `bytes32(0)` (a null handle, explicit via
`euint256.wrap(bytes32(0))` when the `Order` is created in `submitOrder` —
never `Nox.toEuint256(0)`, which would create a real, publicly decryptable
public handle for no reason). Tested both locally
(`test/unit/ViewerRegistry.test.ts`) and live on Sepolia
(`scripts/e2e/auditor-check.sepolia.ts`).

---

### Phase 3: `ViewerRegistry.sol`: design decisions, 2026-07-23

**Context:** isolate the auditor's (compliance viewer) ACL logic into its
own module, separate from `AfterHoursDesk.sol` as requested, and confirm
the exact signatures of `Nox.addViewer`/`Nox.allow`/`Nox.isViewer` before
writing any code.

**What happened: signatures confirmed by reading real source code**
(`node_modules/@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol`
+ `contracts/modules/ACL.sol`, package `0.2.4`, not assumed from memory):
- `Nox.addViewer(euint256 value, address viewer) internal` → calls
  `INoxCompute.addViewer(bytes32, address)` externally.
- `Nox.allow(euint256 value, address account) internal` → same for
  `INoxCompute.allow`.
- **Critical finding that shaped the whole module's architecture:**
  `ACL.sol`'s `addViewer`/`allow`/`allowTransient` are ALL gated by
  `modifier onlyAllowed(bytes32 handle)`, which checks
  `_isAllowed(handle, msg.sender)`, and `msg.sender`, from
  `NoxCompute`'s point of view, is always whoever makes the EXTERNAL call
  to `NoxCompute`, i.e. the contract currently executing the `Nox` library
  function (not whoever originally computed the handle). This is
  **exactly** the same mechanism behind the
  `confidentialTransferFrom`/`confidentialTransfer` bug already documented
  in Phase 2, but this is its **second, independent occurrence** in this
  codebase, not an isolated case: if
  `ViewerRegistry.registerFill(fill)` called
  `Nox.addViewer(fill, complianceViewer)` with nothing else, it would
  revert with `UnauthorizedSender` because `ViewerRegistry` (not
  `AfterHoursDesk`, which is the one that actually has `allowThis(fill)`)
  is the one that, from `NoxCompute`'s point of view, is calling
  `addViewer`. Fixed with the same pattern already used for `cUSDC`:
  `AfterHoursDesk` calls
  `Nox.allowTransient(fill, address(viewerRegistry))` immediately before
  `viewerRegistry.registerFill(fill)`, granting TRANSIENT access (this tx
  only) to the registry before it calls `Nox.addViewer` itself.
- **`complianceViewer`: immutable, not rotatable.** An explicit decision,
  documented in the contract itself: since viewer/admin grants in Nox are
  IRREVOCABLE (confirmed by reading `ACL.sol`: `addViewer`/`allow` only
  ever set a mapping entry to `true`, never back to `false`), an "auditor
  rotation" feature would not genuinely revoke the old auditor's access to
  fills ALREADY registered: it would only stop granting the OLD auditor
  access to FUTURE fills, unless we also implemented and genuinely tested
  the "fresh handle" pattern
  (`Nox.add(handle, Nox.toEuint256(0))` + repointing the contract's
  storage) documented in the ground truth. Since we weren't going to
  properly test that pattern in this phase, we followed the ground
  truth's explicit instruction: don't implement a half-working rotation —
  `complianceViewer` is a plain `immutable`, set once in the constructor.
- **`allow` (admin) vs. `addViewer` (viewer): why both coexist.** Each
  trader already receives `Nox.allow(fill, order.trader)` (admin) since
  Phase 2: not duplicated here, per the task's explicit instruction. The
  `ViewerRegistry` grants exclusively `Nox.addViewer(fill,
  complianceViewer)` (viewer, decrypt-only): the auditor never needs to
  compute on top of the handle nor manage further permissions, so the
  narrower role is the correct one here.
- **No explicit "only the desk may call `registerFill`" gate.** A
  deliberate decision: since any successful call to `Nox.addViewer` inside
  `registerFill` already depends on `ViewerRegistry` ITSELF holding real
  access (transient or persistent) to the handle passed in, and that
  access only exists because `AfterHoursDesk` granted it, in the same
  transaction, right before calling `registerFill`: an unrelated caller
  passing an arbitrary handle always reverts inside `NoxCompute` itself
  (`UnauthorizedSender`), with no need for any additional `msg.sender`
  check inside `ViewerRegistry`. Tested directly in
  `test/unit/ViewerRegistry.test.ts` ("registerFill reverts when called
  directly by an address with no ACL over the handle").
- **Deploy order with no circular dependency.** `ViewerRegistry` does not
  depend on `AfterHoursDesk`'s address (its constructor only takes
  `complianceViewer`), only `AfterHoursDesk` depends on
  `ViewerRegistry`'s address (a new second constructor argument). This
  avoids what would otherwise be a circular constructor-argument
  dependency between the two contracts. Real deploy order:
  `04-deploy-viewer-registry.ts` first, then
  `05-deploy-after-hours-desk.ts`.

**Source:**
`node_modules/@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol` and
`contracts/modules/ACL.sol` (package `0.2.4`, read in full before writing
`ViewerRegistry.sol`); real local (Docker) and live (Sepolia) reproduction
in this session.

**Decision:** see `contracts/ViewerRegistry.sol` and
`contracts/interfaces/IViewerRegistry.sol` for the final implementation —
each decision above is also documented inline in the source code, not
just here.

---

### Phase 3: `AfterHoursDesk` redeploy: Phase 2 address superseded, 2026-07-23

**Context:** `AfterHoursDesk.sol`'s constructor signature changed
(`constructor(address cUSDCAddress, address viewerRegistryAddress)`, it
used to be just `cUSDCAddress`) and so did its bytecode (the
`Order.fill` field, a call to `_registerFillForCompliance` inside
`_settleBuyOrder`/`_settleSellOrder`): there is no way to "upgrade" an
already-deployed contract without a proxy, so a redeploy is unavoidable.

**What happened:** the Phase 2 address
(`0x5a3b87a57927ab415c7b368aa36bfdc2df9933f9`) stays live and keeps
working exactly as before (no `ViewerRegistry` wiring, no
`getOrderFillHandle`): it's not a broken contract, it's superseded. The
new Phase 3 deploy is
`0x020381a3d92bf97f42aa698e200b37390b908fca`, verified on
Etherscan/Blockscout:
https://sepolia.etherscan.io/address/0x020381a3d92bf97f42aa698e200b37390b908fca#code

`ViewerRegistry` (new contract, Phase 3) deployed at
`0x8bc225ca9323eb9b4cc16ee6dbb8d53a4f42ed37`, verified:
https://sepolia.etherscan.io/address/0x8bc225ca9323eb9b4cc16ee6dbb8d53a4f42ed37#code
— constructor `complianceViewer_ = 0x3e442e77ee3d7514ab6600b539cb76a5a73ec3b0`
(this repo's one funded signer, see the documented limitation below).

**Decision:** `deployments/sepolia.json` only stores the CURRENT address
(`afterHoursDesk` now points to the new one); the old one is only
documented here and in `package.json`
(`deploy:desk-v1-phase2:sepolia`, renamed from the old
`deploy:desk:sepolia`, so it's never accidentally re-run —
`05-deploy-after-hours-desk.ts` is this phase's real script, and
`deploy:desk:sepolia` now points to it).

---

### Phase 3: Unit tests: 4 real local accounts (buyer, seller, auditor, stranger), 2026-07-23

**Context:** prove genuine ACL isolation: not just that "the auditor can
decrypt," but that every role sees exactly what it should and nothing
more.

**What happened:** `test/unit/ViewerRegistry.test.ts`, 4 tests, all
passing against the local Nox stack (Docker):
1. `complianceViewer` deploys correctly with the constructor's address.
2. Deploying with `complianceViewer_ = address(0)` reverts with
   `ZeroComplianceViewer`.
3. **The central test:** buyer (100) and seller (60) submit orders,
   settlement executed by the AUDITOR's own account (proving
   `settleBatch` still has no privileged keeper even with the new
   wiring); then:
   - the auditor decrypts BOTH fills (buyer=60, seller=60: no rounding
     loss, one order per side);
   - the buyer decrypts only their own fill, is rejected on the seller's;
   - the seller decrypts only their own fill, is rejected on the buyer's;
   - **least privilege confirmed:** the auditor CANNOT decrypt either
     side's RESIDUAL: `ViewerRegistry.registerFill` is only ever called
     for `fill`, never for `residual`, so the auditor has no viewer access
     over them at all;
   - a FOURTH address ("stranger"), with no ACL over anything, is
     rejected decrypting either the fill OR the residual of either order
     (4 separate `assert.rejects`).
   - additional on-chain proof: the `ViewerRegistry.FillRegistered`
     events emitted during the `settleBatch` transaction itself match
     exactly the handles returned by `getOrderFillHandle` for both orders.
4. `registerFill` called directly (outside `AfterHoursDesk`'s real flow)
   with an external handle never validated via `fromExternal` reverts —
   confirming no explicit `msg.sender` gate is needed: Nox's own ACL
   already protects the function (see entry above).

The full suite (`npm test`, 15 tests: `MockUSDC`, `ConfidentialUSDC`,
`AfterHoursDesk`, `ViewerRegistry`) passes together, with no regression in
the already-approved Phase 1/2 tests (the only change needed was updating
`AfterHoursDesk.test.ts`'s `deployDesk()` helper to deploy
`ViewerRegistry` and pass its address to `AfterHoursDesk`'s new second
constructor argument: no pre-existing test assertion was changed).

**Source:** real execution (`npx hardhat test test/unit/*.test.ts`) in
this session, local Nox stack via Docker Compose.

**Decision:** `test/unit/ViewerRegistry.test.ts` stands as the proof of
genuine multi-account ACL isolation, the Sepolia E2E (below) proves
something else (real end-to-end execution), it doesn't replace this.

---

### Phase 3: Real E2E on live Sepolia: single-account limitation, documented, 2026-07-23

**Context:** prove, with real data (not mocked), that the chain
`AfterHoursDesk._registerFillForCompliance` -> `Nox.allowTransient` ->
`ViewerRegistry.registerFill` -> `Nox.addViewer` genuinely executes on
live Sepolia, against this phase's redeployed contracts.

**What happened:** `scripts/e2e/auditor-check.sepolia.ts`: the same
limitation already documented in Phase 2
(`settle-check.sepolia.ts`): this repo has only ONE funded Sepolia
account, and `ViewerRegistry` was deployed with that SAME account as
`complianceViewer`. This means that, in this specific run, the signer
accumulates both ADMIN access (as the trader on both legs) and VIEWER
access (as the auditor) over the same `fill` handles: successfully
decrypting alone does NOT prove the `addViewer` path genuinely fired (the
trader's own `allow` would already be sufficient by itself). Explicitly
documented in the script itself, with no attempt to hide the limitation.

To still extract a real, verifiable proof with a single account, the
script reads the `ViewerRegistry.FillRegistered` events emitted DURING
the `settleBatch()` transaction itself (via viem's
`viewerRegistry.getEvents.FillRegistered({}, {fromBlock, toBlock})`) and
confirms the emitted `fillHandle`s match exactly `getOrderFillHandle` for
each order: this is an orthogonal and stronger proof than "successfully
decrypted": it proves the call genuinely happened on-chain, without
reverting, for both legs, regardless of who has access to what.

Real execution, result:
- `AfterHoursDesk`: `0x020381a3d92bf97f42aa698e200b37390b908fca`
- `ViewerRegistry`: `0x8bc225ca9323eb9b4cc16ee6dbb8d53a4f42ed37`
- BUY 10 mUSDC, SELL 6 mUSDC, `matched = 6000000` (new batch, id 1 of the
  new desk).
- 2 `FillRegistered` events found in the `settleBatch` tx, matching
  exactly `buyFillHandle`/`sellFillHandle`.
- `decrypt(buyFillHandle) = 6000000`, `decrypt(sellFillHandle) = 6000000`
  (needed 1 polling retry before resolving: the same single-Runner
  latency already expected, see the Day-1 Spike 4).
- Signer balance before the orders: 75.000000 cUSDC (accumulated residual
  from earlier Phase 2 runs): idempotent script, no new faucet/wrap
  needed.
- Signer balance after this session: ~0.0393 SepoliaETH (down from
  ~0.0430 before).

The genuine isolation proof (auditor ≠ trader ≠ stranger) is properly
covered by the local unit tests (entry above), this E2E proves that the
REAL deploy, with REAL bytecode, executes the full chain without
reverting on real infrastructure, which the local tests (although
correct) don't prove by themselves.

**Source:** real execution (`npx hardhat run scripts/e2e/
auditor-check.sepolia.ts --network sepolia`) in this session; transaction
hashes printed in the execution log itself.

**Decision:** keep this limitation documented, not hidden, and don't try
to work around it by fabricating a fake second identity. See the next
entry on when a genuinely funded second account becomes necessary.

---

### Phase 3: On a second funded Sepolia account: not needed yet, 2026-07-23

**Context:** the user asked to be explicitly told when a genuinely funded
second account (distinct from the single one used so far) becomes
necessary, rather than leaving it implicit.

**Assessment:** for THIS PHASE'S SCOPE (contracts + unit tests + a smoke
E2E proving the chain executes in production), a second account is NOT
necessary: genuine ACL isolation (the part that actually needs distinct
identities to mean anything) is already proven for real by the 4 free
local Hardhat/EDR addresses in
`test/unit/ViewerRegistry.test.ts`, and the Sepolia E2E serves a
different, orthogonal purpose (proving the real bytecode doesn't revert
in production), which doesn't require distinct counterparties.

**When it will probably become necessary:** in the frontend/demo phase
(the 4-minute video): if the script wants to show, LIVE on real Sepolia
(not just local tests), two different wallets connected to the app (buyer
and seller, or trader and auditor) logging in via MetaMask/WalletConnect
and each decrypting only what they should see, that requires at least ONE
additional real account funded with SepoliaETH (and, ideally, also with
mUSDC via faucet). Recommendation: if the video script
(`video-script.md`) decides to demonstrate the buyer/seller/auditor
distinction LIVE instead of just citing the local unit tests as evidence,
tell the user AT THAT POINT to provide/fund a second Sepolia wallet, not
before, and don't fabricate an alternative proof instead.

---

## Phase 4: Uniswap composability

### Phase 4: Research: a real Uniswap V3 pool on Sepolia, with genuine liquidity, 2026-07-24

**Context:** before writing any price contract, confirm whether a real
Uniswap deployment (V3, most likely to have an official testnet
deployment) exists on Ethereum Sepolia, and whether any pool has genuine
liquidity: without trusting addresses from memory, since they change
across networks/time.

**What was found:**
- `WebSearch`/`WebFetch` (docs.uniswap.org/developers.uniswap.org,
  GeckoTerminal, Sepolia Etherscan) pointed to a strong candidate: a
  WETH/USDC pool, 0.05% fee, at
  `0x3289680dd4d6c10bb19b899729cda5eef58aeff1`, verified on Sepolia
  Etherscan as a `UniswapV3Pool`. The text extracted via `WebFetch`
  (which passes through a summarization model, prone to transcription
  errors on long addresses) differed slightly between two calls on the
  exact WETH address: so, instead of trusting that text, the next step
  was to read the REAL on-chain state directly.
- **Real verification, not just doc/scrape reading:** I used
  `network.connect("sepoliaFork")` (an EDR fork already configured in
  Phase 0's `hardhat.config.ts`, preserving chainId 11155111, forking from
  the real RPC via `configVariable("SEPOLIA_RPC_URL")`) to make a direct
  `eth_call` against the pool, at real Sepolia's actual current block
  (block 11337577 at test time). Real result, not doc-script output:
  - `token0()` = `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`: USDC, 6
    decimals (this is Circle's own official test-USDC address on
    Sepolia, not a third-party MockUSDC).
  - `token1()` = `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`: WETH, 18
    decimals (Sepolia's canonical WETH9).
  - `fee()` = 500 (0.05%).
  - `factory()` = `0x0227628f3F023bb0B980b67D528571c95c6DaC1c`.
  - `slot0()`: `sqrtPriceX96 = 549363126816232869131095008210736`, tick =
    176892, `observationCardinality` = 160, `unlocked` = true.
  - `liquidity()` = `15889660964205811` (non-zero, real).
  - Real pool balances in both tokens: `token0.balanceOf(pool)` =
    2,976,059.329235 USDC, `token1.balanceOf(pool)` =
    147.220536352318065010 WETH: genuine, substantial liquidity, not an
    abandoned/dust pool.
  - `observe([300, 0])` (a 300s TWAP) genuinely worked, returning real
    tickCumulatives and a 300s average tick identical to the current spot
    tick (the market was flat over those 300s): confirms TWAP IS
    technically viable on this pool, even though it wasn't used in the
    final implementation (see the spot-vs-TWAP decision below).
- Real data plus confirmed sufficient liquidity: **the real path was
  chosen** (an adapter over the real Uniswap pool), **not** the documented
  fallback (`OwnFallbackPriceOracle`): it didn't need to be built, since
  the research confirmed genuine liquidity, not an empty/unused pool.

**Source:** `WebSearch`/`WebFetch` (docs.uniswap.org →
developers.uniswap.org, GeckoTerminal, Sepolia Etherscan) to locate the
candidate; real `network.connect("sepoliaFork")` + `eth_call` (throwaway
script `scripts/_check-pool.sepolia.ts`, removed after confirmation)
against real Sepolia's live state, in this session: this is the source
of truth used to decide the implementation, not `WebFetch`'s summarized
text.

**Decision:** implement `UniswapV3PriceReader.sol` as a real, read-only
adapter over this exact pool (WETH/USDC, 0.05%), using
`baseAmount = 1e18` (1 WETH) so `getReferencePrice()` returns "USDC (6
decimals) per 1 WETH": the same 6-decimal convention the Phase 2/3
placeholder already used, with no additional conversion needed anywhere
downstream.

---

### Phase 4: Spot vs. TWAP: decision and why, 2026-07-24

**Context:** the real pool supports both a spot price
(`slot0().sqrtPriceX96`) and a real TWAP via `observe()` (confirmed
working, see entry above). We needed to decide which to use and document
why.

**What happened:** reconstructing a genuine TWAP price requires
converting the average tick (what `observe()` directly returns) back into
a `sqrtPriceX96` via `1.0001^tick`: i.e. Uniswap's own `TickMath` library
(`getSqrtRatioAtTick`). I read the real source code of
`github.com/Uniswap/v3-core/contracts/libraries/{TickMath,FullMath}.sol`
in this session: both have `pragma solidity >=0.5.0 <0.8.0` /
`>=0.4.0 <0.8.0`: **incompatible** with this project's fixed
`pragma solidity 0.8.35`. Importing them would require adding a SECOND
solc compiler version to `hardhat.config.ts` (which today only declares
`0.8.35`) just to support one read-only helper.

I also read the real body of `OracleLibrary.getQuoteAtTick`
(`github.com/Uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol`)
— the "safe squaring" logic (`ratioX192`/`ratioX128` with two branches
depending on `sqrtRatioX96 <= type(uint128).max`) doesn't depend on
`TickMath` itself: only the tick→sqrtPrice CONVERSION does. Since we
decided to use SPOT (`slot0().sqrtPriceX96` comes ready-made, no tick
conversion needed), I was able to port just that part of the logic
(using OpenZeppelin's `Math.mulDiv`, already a dependency of this
project, with semantics identical to Uniswap's `FullMath.mulDiv` —
confirmed by reading
`node_modules/@openzeppelin/contracts/utils/math/Math.sol`) without
needing any new external library or a second solc version.

**Decision (why SPOT, not TWAP):**
1. `AfterHoursDesk`'s execution price is a publicly disclosed
   REFERENCE/REPORTING value: it is never used to compute any real
   settlement amount (settlement nets cUSDC 1:1 between matched legs,
   entirely decoupled from this price; see `_computeFill`). A single-block
   spot-price manipulation cannot move real funds through this contract —
   the blast radius is "the disclosed reference number is briefly wrong,"
   not "an attacker drains the desk."
2. Given point 1, the cost of adding a second solc version just for a
   read-only helper wasn't worth it: an explicit engineering decision,
   not a silent shortcut.
3. Real numerical sanity check (not just theoretical): with the real
   `sqrtPriceX96` read above, the computed price comes out to ~20,798
   USDC/WETH (later, at the real deploy, ~20,401 USDC/WETH: the small
   difference is the pool's real price moving between the fork check and
   the live deploy, not a bug): a sane order of magnitude, no overflow,
   confirming the formula.

Validated with real tests (`test/unit/UniswapV3PriceReader.test.ts`, see
the tests entry below): an INDEPENDENT reimplementation of the same
formula in TypeScript/bigint matches exactly the value the contract
returns, read against the pool's real state via a fork.

**Source:** `github.com/Uniswap/v3-core/contracts/libraries/TickMath.sol`,
`.../FullMath.sol` (pragmas read via `curl`/`WebFetch` in this session);
`github.com/Uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol`
(full body of `getQuoteAtTick` read via `curl` in this session);
`node_modules/@openzeppelin/contracts/utils/math/Math.sol` (`mulDiv`,
read in full); `test/unit/UniswapV3PriceReader.test.ts` run against
`sepoliaFork` in this session.

**Decision:** `UniswapV3PriceReader._quoteAtSqrtPriceX96` implements the
same two-branch logic as `OracleLibrary.getQuoteAtTick`, fed directly by
`slot0().sqrtPriceX96` (spot), using OpenZeppelin's `Math.mulDiv`. TWAP is
documented as technically viable and tested (`observe()` works on this
pool) but deliberately not implemented in this phase, see the full
docstring in `UniswapV3PriceReader.sol`.

---

### Phase 4: Real friction: `Nox.toEuint256` always produces a "public" handle, even for a dynamic oracle value, 2026-07-24

**Context:** confirm whether the friction already documented in Phase 2/3
(`Nox.toEuint256(PLACEHOLDER_EXECUTION_PRICE)` always becomes a "public
handle," and `Nox.allowPublicDecryption` reverts with
`PublicHandleACLForbidden` on an already-public handle, fixed at the
time by routing through `Nox.add(..., 0)` first) still applies once the
value is no longer a compile-time constant, but a `uint256` read live from
`priceOracle.getReferencePrice()`.

**What happened:** confirmed by reading `Nox.sol` again —
`toEuint256(uint256 value)` ALWAYS calls
`_noxComputeContract().wrapAsPublicHandle(bytes32(value), TEEType.Uint256)`,
unconditionally, regardless of whether `value` is a constant or the
result of a contract/oracle call made in the same transaction: handle
derivation is purely a function of `(type, value)`. In other words, the
same `Nox.add(Nox.toEuint256(price), Nox.toEuint256(0))` sequence already
used for the placeholder remains necessary and correct for the real
Uniswap price: there was no new surprise here, just an explicit
confirmation that the pattern generalizes (as the Phase 2/3 comment had
already anticipated prospectively, but without yet testing it with a
dynamic value).

Genuinely tested: `test/unit/AfterHoursDesk.test.ts` (a new test, "Phase
4: settleBatch() reads the price oracle LIVE...") and the live Sepolia
E2E (`price-check.sepolia.ts`) confirm `allowPublicDecryption` works
without reverting even with a dynamic price coming from a real contract
call within the same `settleBatch()` tx.

**Source:**
`node_modules/@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol`
(the `toEuint256` function, grep confirming every `wrapAsPublicHandle`
call site), real execution (local + Sepolia) in this session.

**Decision:** no pattern change needed: `_executionPriceHandle()` uses
exactly the same sequence already validated in earlier phases.

---

### Phase 4: Real friction: `ViewerRegistry.setDesk`'s one-time-use design forces a SECOND redeploy every time the desk's bytecode changes, 2026-07-24

**Context:** while preparing `AfterHoursDesk`'s redeploy (Phase 4, third
constructor argument `priceOracleAddress`), I discovered the Phase 3
`ViewerRegistry` (`0xf74d72c7b3ab70ff90e474c61c220f6c4333a180`) could not
be reused.

**What happened:** `ViewerRegistry.setDesk(address)` is a one-time-use
setter: it reverts `DeskAlreadySet` if `desk != address(0)`. Phase 3's
`ViewerRegistry` already had `desk` permanently pointing to Phase 3's
`AfterHoursDesk` (`0x52b47b62cd59e1f275c9ae24cb6e1d520a6e51d4`). This
means that EVERY time `AfterHoursDesk`'s bytecode/constructor changes
(which has already happened 3 times: Phase 2→3 because of
`viewerRegistryAddress`, and now Phase 3→4 because of
`priceOracleAddress`), a NEW `ViewerRegistry` must be deployed alongside
it, not just the desk. This is a direct, real consequence of Phase 3's
design decision (a one-time setter, no rotation, see "Phase 3 —
Post-watchdog hardening"), not explicitly documented until now as a
recurring cost with every future change to the desk.

`07-deploy-after-hours-desk.ts` (this phase's new script) checks this
explicitly before proceeding: it reads `viewerRegistry.desk()` and
reverts with a clear error message if it's already set, instead of
letting the failure happen silently later, inside
`settleBatch() -> _registerFillForCompliance -> ViewerRegistry.registerFill`
(which would revert with `OnlyDesk`, a much less obvious message to
diagnose without this context).

**Decision:** re-run `04-deploy-viewer-registry.ts` (no code change
needed: the script was already generic/re-runnable) to mint a fresh,
unpaired `ViewerRegistry`, BEFORE running
`07-deploy-after-hours-desk.ts`. `UniswapV3PriceReader`, by contrast, does
NOT have this limitation: it's a "dumb," stateless contract with no
pairing state with the desk (`priceOracle` is only ever read via `view`),
so it can (and should) be reused indefinitely across future desk
redeploys, at no additional redeploy cost. If a future phase changes the
desk's constructor again, this same cost (a fresh `ViewerRegistry`) will
repeat: worth revisiting this design decision if the desk keeps changing
its signature frequently (out of scope for this phase to decide).

<div align="center">

**Image 3: The one-time-use `setDesk` coupling: why every desk redeploy forces a fresh `ViewerRegistry`**

<img src="documentation/static/img/diagrams/03-setdesk-redeploy-coupling.png" alt="Top-to-bottom decision flowchart. It starts when the AfterHoursDesk constructor changes, for example adding a new argument such as viewerRegistry then priceOracle, which forces a redeploy of AfterHoursDesk. A decision diamond asks whether to reuse the existing ViewerRegistry. Trying setDesk with the new desk address hits the guard desk not equal to address zero, which reverts with DeskAlreadySet because the setter is one-time-use (highlighted red); therefore a fresh ViewerRegistry must be minted first by re-running the re-runnable 04-deploy-viewer-registry script, and only then running 07-deploy-after-hours-desk (highlighted green). A contrasting branch notes that UniswapV3PriceReader is stateless, has no pairing with the desk, and can be reused indefinitely (highlighted blue)." width="500" />

*Source: The authors (2026).*

</div>

---

### Phase 4: Real deploy + verification + live E2E on Sepolia, 2026-07-24

**Context:** the final deploy of this phase's three new artifacts
(`UniswapV3PriceReader`, a fresh `ViewerRegistry`, `AfterHoursDesk` v3) on
real Ethereum Sepolia, followed by verification and an E2E that
cross-checks the decrypted price against an independent read of the
oracle.

**What happened:**
- `UniswapV3PriceReader` deployed at
  `0x20f68c8d394dabee5fea08a21a1596eb09c5554e` (constructor: pool
  `0x3289680dd4d6c10bb19b899729cda5eef58aeff1`, base WETH
  `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, quote USDC
  `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, `baseAmount = 1e18`).
  Sanity check in the deploy script itself: `getReferencePrice()` returned
  `20401121404` (20,401.121404 USDC/WETH): a real, live-read value,
  slightly different from the `20798889850` calculated hours earlier via
  a fork (the real pool price moved between the two reads: additional
  evidence this is real, not static/mocked, data).
  Verified: https://sepolia.etherscan.io/address/0x20f68c8d394dabee5fea08a21a1596eb09c5554e#code
- `ViewerRegistry` (fresh, unpaired) redeployed at
  `0x7f5508360b37f41a6cca6c34aca233500b6c1678` (the same
  `complianceViewer` as always: this project's one funded signer).
  Already auto-verified (identical bytecode to earlier phases).
- `AfterHoursDesk` (Phase 4) deployed at
  `0x46b72a2615de7351699dcd5a64b854746a29fdb8`, `setDesk` called on the
  fresh `ViewerRegistry` above, in the same script run.
  Verified: https://sepolia.etherscan.io/address/0x46b72a2615de7351699dcd5a64b854746a29fdb8#code
- Unit tests: 23/23 passing (`MockUSDC` 3, `ConfidentialUSDC` 4,
  `AfterHoursDesk` 5: including a new test, "Phase 4: settleBatch() reads
  the price oracle LIVE," which changes `MockPriceOracle`'s price between
  two batches and confirms each one reflects the price in effect AT THE
  MOMENT of its own settle, not a value frozen at deploy time —,
  `UniswapV3PriceReader` 6: against `sepoliaFork`, including an
  independent reimplementation of the formula in TypeScript that matches
  the contract exactly —, `ViewerRegistry` 5, updated for the desk's new
  third constructor argument).
- Real live E2E (`scripts/e2e/price-check.sepolia.ts`, the same
  single-account limitation already documented in earlier phases): BUY 4
  mUSDC + SELL 4 mUSDC (fully matched, no residual),
  `matched = 4000000` decrypted correctly. **The central result:** the
  decrypted execution price (`20401121404`) matched EXACTLY a second,
  independent, later call to `priceOracle.getReferencePrice()`: end-to-end
  proof that the publicly decryptable price genuinely came from a live
  Uniswap read, not a hardcoded value, and that the read is
  reproducible/consistent. Settle tx:
  `0x2b886237793ae81e22669e5fec90a6d8484290cafaf499dd13c4b808b074a3a7`
  (block 11337854).
- Signer balance after this session (3 deploys + 3 verifications + 3 E2E
  transactions): ~0.031 SepoliaETH (from ~0.0393 before): still
  comfortable for the next phases.

**Source:** real execution (`npx hardhat run scripts/deploy/06...ts`,
`.../07...ts`, `npx hardhat verify`, `npx hardhat run
scripts/e2e/price-check.sepolia.ts --network sepolia`, `npx hardhat test
test/unit/*.test.ts`) in this session; `deployments/sepolia.json`
updated.

**Decision:** Phase 4 complete. No mocked data anywhere in a judge's
clickable path: the Uniswap pool is real and third-party (Circle USDC +
canonical WETH9 on Sepolia), the read is always `view` (never writes to
Uniswap), and the publicly decryptable price was cross-checked against a
second, independent read of the oracle in production. This repo's only
"mock" (`contracts/mocks/MockPriceOracle.sol`) is explicitly confined to
local unit tests, never deployed to Sepolia, and exists only to decouple
the netting tests (already `AfterHoursDesk.test.ts`'s own focus) from a
network dependency on the real pool: the real oracle's correctness is
proven by `test/unit/UniswapV3PriceReader.test.ts` (against a fork) and
by the E2E above (against live Sepolia), never by the mock.

---

## Phase 5: Frontend

### Phase 5: Resuming the frontend after a session interruption, 2026-07-24

**Context:** a previous subagent (same specialty) started the frontend
(`frontend/`) and was interrupted mid-way by an account session limit,
not a project error: it had left `config/`, `lib/viemClients.ts`,
`lib/format.ts`, `state/WalletContext.tsx`, `state/AppStateContext.tsx`,
`hooks/useHandleClient.ts`, `hooks/useUniswapPrice.ts` ready and tested
(no UI hooks/screens yet). This session finished Phase 5: the three
missing hooks (`useDeskEvents`, `useCUsdcBalances`, `useAuditorAccess`,
plus two small helper hooks, `useOperatorStatus`, `useMyOrders`, to keep
each hook focused on a single responsibility, matching the existing
hooks' pattern), every required UI component (`NetworkGuard`,
`Layout`/`Header`, the `Broker` mascot, `StateBadge`, `RedactedValue`,
`OrderTicket`, `Tape`, `AuditorPanel`, `UniswapPriceStrip`), `App.tsx`/
`main.tsx`, and the global theme (`styles/theme.css` + per-component CSS
Modules: Vite already supports `*.module.css` natively, no new
dependency).

---

### Phase 5: Real friction: the public Sepolia RPC caps `eth_getLogs` at 50,000 blocks, 2026-07-24

**Context:** `useDeskEvents`/`useMyOrders` need to reconstruct the full
tape/trader-order history from real events (this project has no
subgraph/indexer of its own): testing whether a single `eth_getLogs`
with `fromBlock: 0x0, toBlock: "latest"` works against
`PUBLIC_SEPOLIA_RPC_URL` (`https://ethereum-sepolia-rpc.publicnode.com`,
already used by `lib/viemClients.ts`).

**What happened:** tested live via direct `curl` against the RPC: an
`eth_getLogs` with the full range (block 0 to "latest," current block
`0xad0b05` = 11,342,597 at test time) returns
`{"code":-32701,"message":"exceed maximum block range: 50000"}`: the
public RPC genuinely enforces a 50,000-block cap per call, this isn't
documentation, it's observed real behavior.

**Decision:** `lib/eventLogs.ts`, a new file this phase, implements
`getPastLogsChunked()`: it paginates backward from the current block in
45,000-block windows (a safety margin below the 50,000 cap), stopping at
a floor of `MAX_LOOKBACK_BLOCKS = 200_000` (~1 month of Sepolia blocks,
well beyond the age of any deploy in this hackathon, all made within the
same week, see the phase timestamps above). Explicitly documented in the
file itself that a production version would replace this with a
dedicated indexer/subgraph, not a larger constant. Confirmed working
live: `useDeskEvents`/`useMyOrders` load with no error against the real
contracts in `deployments/sepolia.json`.

---

### Phase 5: Type friction (TypeScript, not the SDK): typing the ABI as a wide `Abi` loses event `args` inference, 2026-07-24

**Context:** while writing `useDeskEvents.ts`/`useMyOrders.ts` using
`publicClient.getContractEvents`/`watchContractEvent` and viem's
`parseEventLogs` (to decode the `orderId`/`batchId` returned by
`submitOrder`/`settleBatch` right after `waitForTransactionReceipt`,
without relying on the `.simulate.*` pattern already documented as
problematic in Phase 2), `tsc --noEmit` failed with
`Property 'args' does not exist on type 'Log<...>'` at eight different
points.

**What happened:** `config/contracts.ts` (already existing, a previous
subagent's decision) exports every ABI as viem's wide `Abi` type
(`afterHoursDeskArtifact.abi as Abi`), not as a typed `const` literal.
That's great for import/reuse simplicity, but has a real side effect:
viem's `getContractEvents`/`watchContractEvent`/`parseEventLogs`
overloads can only infer each event's `args` shape when the `abi` arrives
as a literal `const`, against a wide `Abi`, viem falls back to the
generic `Log` type (no `args` field at all). This isn't a bug in viem or
the Nox SDK: it's a direct, expected consequence of the typing choice
already made in `config/contracts.ts`.

**Decision:** instead of re-typing every ABI as a literal `const` (a
larger change, touching `config/contracts.ts` and potentially every
existing hook that reads those constants), every event-decoding call site
does an explicit, localized type assertion to an arguments interface
manually verified against the real compiled ABI (`node -e
"console.log(JSON.stringify(...))"` against the artifacts, in this
session, before writing any hook): `lib/eventLogs.ts` exports
`DecodedLog<TArgs>` for this, documented inline as "the same class of
cast this codebase already uses for `readContract` results" (e.g.
`useUniswapPrice.ts`'s `result as bigint`, already written by the
previous subagent). `tsc -b --noEmit` is clean after the fix; no change
to `config/contracts.ts`.

---

### Phase 5: Decision: a short operator window (15 min), following the watchdog, 2026-07-24

**Context:** `OrderTicket.tsx` needs to call `cUSDC.setOperator(desk,
until)` before a buy order, since `settleBatch()` pulls the buyer's fill
via `confidentialTransferFrom` (see `AfterHoursDesk.sol`).
`.claude/agents/hackathon-watchdog.md` already recorded the
recommendation: "operators have no per-amount cap... prefer short,
per-batch operator windows set right before settlement", avoiding
exactly the anti-pattern a naive first draft might reach for
(`until = far future timestamp`, essentially equivalent to an infinite
allowance).

**Decision:** `OPERATOR_WINDOW_SECONDS = 15 * 60` in `OrderTicket.tsx` —
the UI always authorizes the desk for 15 minutes from the click, never
24h, never a "forever" timestamp. The trader can re-authorize at any time
(cost: one more tx), but is never left with an indefinitely open window
because of a UI choice.

---

### Phase 5: "The Broker" mascot: procedural SVG pixel art, not an image file, 2026-07-24

**Context:** the brief asks for a 100%-original mascot ("noir pixel
detective, trenchcoat, hat, glasses, terminal glow"), with the explicit
caveat that, if genuine pixel art takes too long, a minimalist,
similarly-spirited SVG/CSS treatment is acceptable, as long as it's
documented.

**Decision:** `components/mascot/Broker.tsx` builds the mascot entirely in
code: a list of rectangles (`<rect>`) positioned on a cell grid, with no
imported image asset, no third-party sprite, no external icon font. It's
deliberately blocky/minimalist ("mature pixel, not cute pixel") rather
than a fully rendered character, to avoid slipping into the cartoonish
register the brief asks to avoid. The only elements that react to
`AppStateContext`'s real state are the two glasses lenses (color/opacity
animated via Framer Motion, varying by `DeskAppState`) and a thin
"terminal glow" line on the coat's hem, restrained, contained motion, by
design.

---

### Phase 5: `npm install`/`typecheck`/`build`: result, 2026-07-24

**What happened:** `npm install` inside `frontend/` (89 packages, 0
vulnerabilities). `npm run typecheck` (`tsc -b --noEmit`) clean after the
event-typing fix above. `npm run build` (`tsc -b && vite build`)
succeeded: the only warning (not an error) is Vite's standard one about
a chunk over 500kB post-minification (`@iexec-nox/handle` + viem
combined), not addressed in this phase (bundle optimization, not
correctness). `npm run dev` comes up at `http://localhost:5173/` —
validated serving `index.html` and resolving real
`deployments/sepolia.json`/`artifacts/**` via Vite's `/@fs/...`
(confirms `vite.config.ts`'s `server.fs.allow: [".."]` still works).

**Pending, explicitly out of this session's reach (requires a real
connected wallet, not automatable by this agent):** the whole interactive
flow, connecting MetaMask, authorizing the operator, a real
`encryptInput` in the browser, real `submitOrder`/`settleBatch`,
decrypting one's own fill, the auditor's decrypt, needs to be tested live
by the main session with the two real accounts (buyer/desk-owner/auditor
and seller) via MetaMask, since this agent has no private keys and does
not control an interactive browser.

---

### Phase 5: Post-watchdog hardening: retry on post-settlement decrypt, 2026-07-24

**Context:** the hackathon-watchdog reviewed Phase 5 and found a real,
quantified risk: `settleBatch()`, even for the simplest possible batch
(1 buy × 1 sell), chains ~10-12+ sequential async Nox primitives per
order (`safeAdd`×2, `lt`+`select`, `safeMul`/`safeDiv`/`safeSub`×3 per
order in `_computeFill`, plus the internal primitives of
`confidentialTransferFrom`/`confidentialTransfer`/`registerFill`), well
beyond the JS SDK's own built-in retry ceiling
(`RESOLVE_MAX_RETRIES=60 × RESOLVE_DELAY_MS=100ms` = a fixed 6s, measured
in the Day-1 Spike 4 for a chain of only 6 primitives). The UI's three
decrypt points (`useCUsdcBalances`, `OrderTicket`'s `MyOrderRow`,
`AuditorPanel`) only relied on that internal ceiling: a judge clicking
"Decrypt" right after seeing "MATCH FILLED" had a real chance of seeing a
timeout error, reading as "broken" at the demo's most important moment.

**What was done:** `frontend/src/lib/retry.ts` —
`decryptWithRetry(fn, { maxAttempts=15, delayMs=3000, onProgress })`, an
effective ceiling of ~45s, exposing `{ attempt, maxAttempts }` so the UI
can show real progress ("Computing off-chain… (N/M)") instead of a
generic spinner or a premature error message. Wired into all three
points: the confidential balance
(`useCUsdcBalances.decryptBalance`), the order's own fill
(`OrderTicket`'s `MyOrderRow.handleDecryptFill`), and the auditor's fill
(`useAuditorAccess.decryptFill` + `AuditorPanel.handleDecrypt`). The
"MATCH FILLED" banner's text was also adjusted to make explicit that
fills are still computing off-chain and that the decrypt button will
retry automatically, instead of implying instant availability.

**Source:** hackathon-watchdog review (Phase 5); `feedback.md`'s Day-1
Spike 4/4 (the original ~4s-for-6-primitives measurement); `npx hardhat
compile`/`npm run typecheck`/`npm run build` (both clean) in this
session.

**Decision:** applied immediately (low cost, mechanical, no change to any
contract surface): resolved before moving on, following the same
pattern already used for `ViewerRegistry`'s Phase 3/4 hardening. Still
pending (out of reach for anyone without an interactive browser):
measuring the real resolution time with the two real accounts, to
calibrate `video-script.md` (still empty) with real timing instead of a
guess.

---

### Phase 5: Real browser testing (Playwright): 3 real bugs found and fixed, 2026-07-24

**Context:** I (the main session) had told the user I wouldn't be able to
test the UI in a real browser. Before accepting that, I tried anyway —
the project's `run` skill points to `chromium-cli`, which doesn't exist in
this environment, but the `playwright` package is available via npm, and
the Chromium binary downloads without needing root privileges
(`npx playwright install chromium`, without `--with-deps`). I managed to
stand up a real headless Chromium and genuinely navigate/screenshot/
inspect the console: it wasn't as hard a limitation as I had assumed.

**What happened: 3 real bugs, none of them visible from reading code in
isolation, only surfacing with the page genuinely running:**

1. **`NetworkGuard` blocked the entire page with no wallet connected** —
   contradicting the design of `useUniswapPrice`/`useDeskEvents`
   themselves (documented in the hooks: "no wallet connection required...
   a judge should be able to see the redacted tape and public price strip
   load real data even before connecting a wallet"). A judge opening the
   link without MetaMask installed would see only a blocking screen,
   never the proof of real data. **Fixed:** `NetworkGuard` now renders an
   informational banner at the top (not a full-page block) and always
   renders `{children}`: `OrderTicket`/`AuditorPanel` already had their
   own internal guards for the parts that genuinely require a wallet.

2. **Too many concurrent RPC calls on load**: `useDeskEvents` fired 4
   historical event searches (`Promise.all`) plus `getBlockTimestamps`
   (another unbounded `Promise.all`), on top of
   `useUniswapPrice`/`useCUsdcBalances`/`useOperatorStatus` all reading at
   the same time: a real burst of dozens of simultaneous requests
   against a single free public RPC, confirmed to generate 429s (rate
   limiting) in a real browser test. **Fixed:** the 4 `useDeskEvents`
   searches and `getBlockTimestamps` now run sequentially, not in
   parallel, trading load latency for not tripping the RPC's limit right
   away. Also added explicit `retryCount`/`retryDelay` to the public
   client's HTTP transport.

3. **The default public RPC (`ethereum-sepolia-rpc.publicnode.com`)
   rejects `eth_getLogs` in practice**: found via direct `curl` and
   confirmed by binary search: this provider's free/anonymous tier
   rejects any `eth_getLogs` range wider than ~150 blocks (~30 minutes)
   with "Archive requests require a personal token," **regardless of how
   recent the range is** (even ending exactly at the latest block via
   `toBlock: "latest"`, ranges of 200-1000 blocks already failed). This is
   a characteristic of this specific provider, not a general Sepolia
   limitation: I tested `sepolia.gateway.tenderly.co` live (accepts a
   full 30,000-block range with no error), `sepolia.drpc.org` (works but
   caps at 10,000 blocks on the free plan), and `rpc.sepolia.org`/
   `rpc2.sepolia.org`/Omnia's public endpoint (didn't respond from this
   environment). **Fixed:** `PUBLIC_SEPOLIA_RPC_URL` switched to
   `sepolia.gateway.tenderly.co`. `MAX_LOOKBACK_BLOCKS` also reduced from
   200,000 to 30,000 blocks (~4.2 days), more than enough for this
   project's real history (all deployed within the last ~1-2 days) and
   avoids requesting an unnecessarily wide window even on a more generous
   provider.

**Final result, confirmed by a real screenshot:** the tape shows 7 real
events (Batch 1/2 opened, BUY order #1, SELL order #2, MATCH FILLED
batch 1, 2× Fill registered for compliance viewer), each with a real
timestamp and a redaction bar (`███`) over a real handle; the Uniswap
price strip shows `$23267.29254` (a real read from
`UniswapV3PriceReader`). `npm run build` and `npm run typecheck` remain
clean after every fix.

**Source:** `npx playwright install chromium` (no `--with-deps`, no
sudo); throwaway smoke-test scripts (removed, not part of the repo);
direct `curl` against candidate RPCs in this session.

**Decision:** test in a real browser before declaring a frontend phase
done, even without a pre-configured browser-automation tool: worth
installing one on the spot, because at least 2 of the 3 bugs above (the
full `NetworkGuard` block and the unusable public RPC for `eth_getLogs`)
are exactly the kind that only surfaces with the page genuinely running
against the real network, never from just reading code or running
`tsc`/`vite build`.

---

## Phase 6: E2E, proof, and closing gaps

### Phase 6: Final audit: gaps against the subagent briefs, 2026-07-24

**Context:** before closing the project, I cross-checked the repo's real
state against the two subagent definition files' complete specs
(`.claude/agents/nox-chain-architect.md` and
`.claude/agents/confidential-noir-frontend.md`), not just against what
each phase reported doing.

**Real gaps found and fixed:**

1. **`publicDecrypt` was never called in the frontend.** The frontend
   brief lists `publicDecrypt` as one of the 5 mandatory SDK-flow steps
   ("only applies to handles explicitly marked publicly decryptable, e.g.
   an aggregate execution price"). Each batch's
   `matchedAmount`/`executionPriceHandle` ARE marked publicly decryptable
   (`Nox.allowPublicDecryption` in `settleBatch()`), but the tape only
   ever showed a fixed `███`, with no way to reveal them. Added a "Reveal
   (publicDecrypt)" button on the tape's MATCH FILLED row, which calls
   `handleClient.publicDecrypt` for real (with retry) for both handles
   and shows the real value: the product's central promise made
   clickable: only the aggregate is ever public, never the individual
   size.
2. **`test/e2e/` was empty and `npm run test:e2e:sepolia` was broken.**
   It had stayed a Phase 0 stub ("Phase 0 only") and was never revisited
  : all real E2E proof ended up living in `scripts/e2e/*.sepolia.ts`
   (run via `hardhat run`), not in `test/e2e/*.test.ts` (run via `hardhat
   test`, which is what the npm script called, against a glob that
   matched nothing). Fixed: `test:e2e:sepolia` now runs the 4 real
   scripts in sequence; `test/e2e/README.md` documents why standalone
   scripts were used instead of Hardhat test files.
3. **`scripts/verify/verify-all.ts` from the architect's brief was never
   written**: every verification up to this point was done with ad-hoc
   `npx hardhat verify` commands, one at a time. Wrote the script
   (constructor arguments inherited exactly from the real deploy
   scripts), ran it end to end against the 5 deployed contracts: all
   confirmed verified on Etherscan/Blockscout/Sourcify.

**Decisions already reviewed and kept as-is (intentional deviations from
the brief, already approved by the watchdog in their respective phases,
not gaps):** `grantAuditorAccess(address)` doesn't exist as a
function with that name: the auditor is fixed at `ViewerRegistry`'s
deploy time (immutable), not granted via a runtime function call;
`ViewerRegistry.registerFill` doesn't take `counterparty` as a
parameter: the trader's own grant is already made directly in
`AfterHoursDesk._settleBuyOrder`/`_settleSellOrder`, with no duplication.

**Source:** a full re-read of `.claude/agents/nox-chain-architect.md` and
`.claude/agents/confidential-noir-frontend.md` in this session; real
execution (`npm run verify:all:sepolia`, `npm run typecheck`, `npm run
build`, Playwright screenshots) confirming each fix.

**Decision:** all 3 gaps above were fixed directly in this session: none
were left pending for later.

---

### Phase 6: Full manual test with two real wallets, 2026-07-24

**Context:** the first genuine end-to-end test done by the user, for
real, in the browser, with MetaMask and the two real Sepolia accounts —
not a script, not a subagent, the product being used the way a hackathon
judge would use it.

**What happened: everything worked, no bug found in the flow itself
(2 cosmetic UI bugs were found and fixed BEFORE this test, see earlier
entries in this phase):**

1. Connected the primary wallet (`0x3E44...C3B0`), successfully
   decrypted its own confidential balance.
2. Submitted BUY order #3 (5 mUSDC): real transaction, fee 0.0007
   SepoliaETH, the tape updated live (`watchContractEvent`) showing
   "pending… BUY order #3" before the block timestamp even resolved.
3. Switched to the second wallet (`0x63deE78b...E188D`) directly in
   MetaMask (no need to disconnect/reconnect in the app: the
   `accountsChanged` listener worked). Submitted SELL order #4
   (3 mUSDC).
4. **The auditor panel correctly denied access** to the second wallet
   (which is not the `complianceViewer`): visual confirmation the gate
   is a real on-chain check, not just a UI lock.
5. `settleBatch()`: real transaction, fee 0.0033 SepoliaETH (pricier
   than `submitOrder`, as expected: it genuinely moves confidential
   balance).
6. **Decrypting one's own fill:** ~5 seconds between clicking "Decrypt my
   fill" and the real value ("$3") appearing, well under the 45s retry
   ceiling, and even faster than the watchdog's pessimistic estimate.
7. **`publicDecrypt` on the aggregate:** revealed "matched $3 @
   $22884.133866/WETH": the price matched exactly the live public
   Uniswap price shown alongside it.
8. Switched back to the primary wallet: the auditor panel showed
   "AUTHORIZED: compliance viewer," listed all 4 real fills (2 from the
   old batch 1 + 2 from the new batch 2). **Decrypted the second
   wallet's fill (~5s, "$3")**, confirming the auditor decrypts ANY
   trader's fill, not just their own.

**Source:** the user's real manual test session on this date, screenshots
compared by me against the expected code/contracts.

**Decision:** with real timing confirmed (~5s per decrypt in this case,
well under the worst case anticipated), `video-script.md` can be
calibrated confidently that no scene will "hang" during recording: the
45s poll/retry window is a generous safety margin, not the typical
expected time.

---

### Phase 6: Self-serve onboarding: faucet+wrap in the UI, and a tutorial, 2026-07-24

**Context:** the hackathon-judge (pre-submission review) pointed out that
a judge connecting a brand-new wallet, without this project's two
pre-funded wallets, would not be able to complete a buy order through the
UI: `faucet()` and `wrap()` already existed as real public functions on
the contracts, but nothing in the UI called them. The user separately
asked for a tutorial pop-up explaining how to use the platform.

**What was done:**
- `frontend/src/hooks/useFaucetAndWrap.ts`: chains the SAME three real
  transactions `scripts/e2e/wrap-check.sepolia.ts` already proved work
  (`MockUSDC.faucet` → `MockUSDC.approve` → `ConfidentialUSDC.wrap`), now
  triggerable directly from the browser, with visible per-step progress
  (1/3, 2/3, 3/3).
- A "New wallet? Get real testnet cUSDC" section added to the order
  ticket (`OrderTicket.tsx`), with an amount input and a single button
  that runs all 3 transactions in sequence.
- `frontend/src/state/TutorialContext.tsx` +
  `components/Tutorial/TutorialModal.tsx`: a 7-step modal ("What this
  is" → connecting a wallet → faucet/wrap → submitting an order →
  settleBatch → decrypt/publicDecrypt → the auditor panel), opened
  automatically on first visit (via `localStorage`, per browser) and
  reopenable any time via a "How it works" button in the header.
- Tested via Playwright: full navigation through the 7 steps, closing,
  and reopening via the button: no JS/React errors at all (only the
  expected rate-limit 429s under the fast automated test, unrelated to
  this change). `npm run typecheck`/`npm run build` clean.

**Source:** hackathon-judge review (pre-submission checkpoint, excluding
the video); a direct request from the user (the tutorial); real execution
(`npm run build`, `npm run typecheck`, Playwright screenshots) in this
session.

**Decision:** both resolved directly, with no dependency on any external
account/credential, unlike public hosting (pending with the user) and
git commits (the user's own decision), these two items were 100% code and
could be closed within this session.

---

## Project

Built by **Cecília Galvão** ([github.com/ceciliagalvaoo](https://github.com/ceciliagalvaoo))
and **Pablo Azevedo** ([github.com/zzaved](https://github.com/zzaved))
for the **iExec WTF Hackathon (Summer Edition)**.
