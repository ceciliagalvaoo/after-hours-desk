import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import { createViemHandleClient } from "@iexec-nox/handle";
import type { HandleClient } from "@iexec-nox/handle";
import { nox, NOX_COMPUTE_ADDRESS, handleGatewayUrl } from "@iexec-nox/nox-hardhat-plugin";
import type { GetWalletClientReturnType } from "@nomicfoundation/hardhat-viem/types";

// Runs against the local Nox offchain stack (Docker Compose, booted by the
// `nox-hardhat-plugin` `hardhat test` override — see hardhat.config.ts,
// `nox: { skipTestOverride: false }`). Every off-chain-resolved value here
// (mint/transfer/burn handles) goes through at least one async Runner
// round-trip — see feedback.md, Day-1 spike 4 — so this file is inherently
// slower than a plain Hardhat unit test; `nox.decrypt`/`nox.publicDecrypt`
// already poll internally (the plugin's `waitForHandlesResolved`, up to 6s,
// plus the SDK's own internal retry/backoff), so we don't add extra retry
// logic on top for a single primitive op (mint/transfer/burn each resolve in
// low single-digit seconds per the spike's empirical measurement).

const SIX_DECIMALS = 10n ** 6n;

// `nox.connect()` (from the plugin) always builds its bundled `handleClient`
// bound to the FIRST wallet client returned by `viem.getWalletClients()`
// (see node_modules/@iexec-nox/nox-hardhat-plugin/src/utils/handle-client.ts).
// Any test that needs a SECOND account to decrypt ITS OWN handle (e.g. the
// recipient of a confidentialTransfer decrypting their own new balance) needs
// its own handleClient bound to that second account's wallet client — the
// proof/ACL-check flows are per-`msg.sender`/per-viewer, not swappable after
// the fact. We reuse the exact same local-stack config the plugin uses
// internally (`NOX_COMPUTE_ADDRESS`, `handleGatewayUrl()`, both re-exported
// by the plugin's public entrypoint) plus the same placeholder subgraphUrl
// the plugin itself uses for local runs (decrypt/publicDecrypt against a
// local stack never actually queries the subgraph in the paths we exercise
// here — only `viewACL()` and 404-handle-existence fallbacks do).
//
// FRICTION (logged in feedback.md, Fase 1): `@iexec-nox/handle`'s
// `ViemBlockchainService.WalletClientAdapter.getAddress()` resolves the
// "connected" address via `walletClient.getAddresses()[0]`, NOT via
// `walletClient.account.address`. For a `WalletClient` built from
// `viem.getWalletClients()` on `noxLocal` (an `http` network with no explicit
// `accounts` configured), every account is a viem "json-rpc" account, and
// viem's own `getAddresses()` for a json-rpc account ignores the specific
// `.account` bound to the client and instead calls `eth_accounts` on the
// underlying provider — which returns the SAME full account list (so index
// `[0]` is always the node's very first account) no matter which wallet
// client instance you started from. In practice this meant a handleClient
// built from the SECOND signer still resolved/authenticated as the FIRST
// signer, and every ACL/decrypt check silently ran as the wrong account.
// Confirmed by reading the installed source, not by guessing:
// node_modules/@iexec-nox/handle/src/services/blockchain/ViemBlockchainService.ts
// (`WalletClientAdapter.getAddress()`).
// This only matters for LOCAL multi-account testing against `noxLocal`
// (json-rpc accounts) — the Sepolia signer configured via
// `accounts: [configVariable("DESK_OWNER_PRIVATE_KEY")]` in hardhat.config.ts
// is a viem "local" account (constructed directly from a private key), for
// which `getAddresses()` short-circuits to `[account.address]` correctly, so
// this does not affect any single-signer Sepolia flow (Fase 1's E2E check).
// Workaround: wrap the walletClient in a `Proxy` that overrides only
// `getAddresses()` to return the specific account's address directly,
// delegating every other property/method (including `.extend()`, which the
// SDK relies on for `readContract`/`getBlockNumber`) straight through to the
// real client.
function withExplicitAddress<T extends GetWalletClientReturnType<"op">>(
  walletClient: T,
): T {
  const address = walletClient.account.address;
  return new Proxy(walletClient, {
    get(target, prop, receiver) {
      if (prop === "getAddresses") {
        return async () => [address];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function handleClientFor(
  walletClient: GetWalletClientReturnType<"op">,
): Promise<HandleClient> {
  return createViemHandleClient(withExplicitAddress(walletClient), {
    smartContractAddress: NOX_COMPUTE_ADDRESS,
    gatewayUrl: handleGatewayUrl(),
    subgraphUrl: "https://example.com/subgraphs/id/none",
  });
}

describe("ConfidentialUSDC (cUSDC) wrapping MockUSDC", () => {
  it("wrap(): mints a confidential balance equal to the wrapped plaintext amount, decryptable only by the recipient", async () => {
    const { viem } = await nox.connect();
    const [deployer] = await viem.getWalletClients();

    const usdc = await viem.deployContract("MockUSDC", [0n]);
    const cusdc = await viem.deployContract("ConfidentialUSDC", [usdc.address]);

    const wrapAmount = 1_000n * SIX_DECIMALS; // 1000.000000 mUSDC

    await usdc.write.faucet([deployer.account.address, wrapAmount]);
    await usdc.write.approve([cusdc.address, wrapAmount]);
    await cusdc.write.wrap([deployer.account.address, wrapAmount]);

    // Public, plaintext cross-check: the wrapper's own mUSDC balance grew by
    // exactly `wrapAmount` — this is intentionally public (see
    // IERC20ToERC7984Wrapper.inferredTotalSupply's docstring), unlike the
    // confidential balance/total-supply handles below.
    assert.equal(await usdc.read.balanceOf([cusdc.address]), wrapAmount);
    assert.equal(await cusdc.read.inferredTotalSupply(), wrapAmount);

    const balanceHandle = (await cusdc.read.confidentialBalanceOf([
      deployer.account.address,
    ])) as `0x${string}`;

    const { value } = await nox.decrypt(balanceHandle);
    assert.equal(value, wrapAmount);
  });

  it("wrap()'s recipient's confidential balance handle is not publicly decryptable — only the ACL'd recipient can decrypt it", async () => {
    const { viem } = await nox.connect();
    const [deployer] = await viem.getWalletClients();

    const usdc = await viem.deployContract("MockUSDC", [0n]);
    const cusdc = await viem.deployContract("ConfidentialUSDC", [usdc.address]);

    const wrapAmount = 42n * SIX_DECIMALS;
    await usdc.write.faucet([deployer.account.address, wrapAmount]);
    await usdc.write.approve([cusdc.address, wrapAmount]);
    await cusdc.write.wrap([deployer.account.address, wrapAmount]);

    const balanceHandle = (await cusdc.read.confidentialBalanceOf([
      deployer.account.address,
    ])) as `0x${string}`;

    // publicDecrypt must reject: this handle was never marked publicly
    // decryptable (ERC7984Base's mint branch only ever calls
    // `Nox.allowThis` + `Nox.allow(newToBalance, to)` — never
    // `Nox.allowPublicDecryption`). Confirmed by reading
    // node_modules/@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984Base.sol
    // rather than assuming.
    await assert.rejects(nox.publicDecrypt(balanceHandle));
  });

  it("confidentialTransfer(): moves an encrypted amount between two accounts; each side decrypts only its own resulting balance", async () => {
    const { viem } = await nox.connect();
    const [sender, recipient] = await viem.getWalletClients();

    const usdc = await viem.deployContract("MockUSDC", [0n]);
    const cusdc = await viem.deployContract("ConfidentialUSDC", [usdc.address]);

    const wrapAmount = 500n * SIX_DECIMALS;
    const transferAmount = 120n * SIX_DECIMALS;

    await usdc.write.faucet([sender.account.address, wrapAmount]);
    await usdc.write.approve([cusdc.address, wrapAmount]);
    await cusdc.write.wrap([sender.account.address, wrapAmount]);

    // Pattern A only: the transfer amount is encrypted client-side via
    // `encryptInput` BEFORE the transaction is broadcast — `confidentialTransfer`
    // never receives a plaintext amount parameter. The proof is bound to
    // (value, solidityType, applicationContract) and validated on-chain by
    // `Nox.fromExternal` against `msg.sender` == the direct caller (`sender`),
    // so the encryption must happen via a handleClient bound to `sender`'s
    // own wallet client — the plugin's default `nox.encryptInput` helper
    // already uses the first wallet client, which IS `sender` here.
    const { handle, handleProof } = await nox.encryptInput(
      transferAmount,
      "uint256",
      cusdc.address,
    );

    await cusdc.write.confidentialTransfer([recipient.account.address, handle, handleProof]);

    const senderBalanceHandle = (await cusdc.read.confidentialBalanceOf([
      sender.account.address,
    ])) as `0x${string}`;
    const recipientBalanceHandle = (await cusdc.read.confidentialBalanceOf([
      recipient.account.address,
    ])) as `0x${string}`;

    // `sender` can decrypt its own residual balance via the default
    // (first-account-bound) handleClient.
    const { value: senderBalance } = await nox.decrypt(senderBalanceHandle);
    assert.equal(senderBalance, wrapAmount - transferAmount);

    // `recipient` must use its OWN handleClient (bound to its own wallet
    // client) — the sender's handleClient has no ACL over recipient's
    // balance handle and would fail the isViewer check in `decrypt()`.
    const recipientHandleClient = await handleClientFor(recipient);
    const { value: recipientBalance } = await recipientHandleClient.decrypt(
      recipientBalanceHandle,
    );
    assert.equal(recipientBalance, transferAmount);

    // Cross-check: `sender` must NOT be able to decrypt `recipient`'s balance
    // — confirms the ACL isolation the confidential-transfer flow relies on.
    await assert.rejects(nox.decrypt(recipientBalanceHandle));
  });

  it("unwrap() + finalizeUnwrap(): burns a confidential amount and releases the equivalent plaintext mUSDC 1:1", async () => {
    const { viem } = await nox.connect();
    const [owner] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const usdc = await viem.deployContract("MockUSDC", [0n]);
    const cusdc = await viem.deployContract("ConfidentialUSDC", [usdc.address]);

    const wrapAmount = 500n * SIX_DECIMALS;
    const unwrapAmount = 200n * SIX_DECIMALS;

    await usdc.write.faucet([owner.account.address, wrapAmount]);
    await usdc.write.approve([cusdc.address, wrapAmount]);
    await cusdc.write.wrap([owner.account.address, wrapAmount]);

    const balanceAfterWrap = await usdc.read.balanceOf([owner.account.address]);
    assert.equal(balanceAfterWrap, 0n); // fully locked into the wrapper by `wrap`

    // Partial unwrap via the externalEuint256 overload — exercises
    // `Nox.fromExternal` again (Pattern A), distinct from the `euint256`
    // overload that would require the caller to already hold ACL over an
    // existing handle equal to the unwrap amount.
    const { handle, handleProof } = await nox.encryptInput(
      unwrapAmount,
      "uint256",
      cusdc.address,
    );

    const { result: unwrapRequestId } = await cusdc.simulate.unwrap([
      owner.account.address,
      owner.account.address,
      handle,
      handleProof,
    ]);
    const unwrapTxHash = await cusdc.write.unwrap([
      owner.account.address,
      owner.account.address,
      handle,
      handleProof,
    ]);
    await publicClient.waitForTransactionReceipt({ hash: unwrapTxHash });

    // `_unwrap` marks the burned-amount handle publicly decryptable
    // (`Nox.allowPublicDecryption`) — this IS the intended, documented
    // exception to "order size never public": once tokens leave the
    // confidential system back to plain ERC-20 form, the amount that left
    // is necessarily public (it becomes a plain ERC-20 transfer amount).
    const { decryptionProof } = await nox.publicDecrypt(
      unwrapRequestId as `0x${string}`,
    );

    await cusdc.write.finalizeUnwrap([unwrapRequestId, decryptionProof]);

    const balanceAfterUnwrap = await usdc.read.balanceOf([owner.account.address]);
    assert.equal(balanceAfterUnwrap, unwrapAmount);

    const remainingConfidentialBalanceHandle = (await cusdc.read.confidentialBalanceOf([
      owner.account.address,
    ])) as `0x${string}`;
    const { value: remainingConfidentialBalance } = await nox.decrypt(
      remainingConfidentialBalanceHandle,
    );
    assert.equal(remainingConfidentialBalance, wrapAmount - unwrapAmount);
  });
});
