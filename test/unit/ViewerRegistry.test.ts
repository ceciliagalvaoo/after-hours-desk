import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createViemHandleClient } from "@iexec-nox/handle";
import type { HandleClient } from "@iexec-nox/handle";
import { nox, NOX_COMPUTE_ADDRESS, handleGatewayUrl } from "@iexec-nox/nox-hardhat-plugin";
import type { GetWalletClientReturnType } from "@nomicfoundation/hardhat-viem/types";

// Runs against the local Nox offchain stack (Docker Compose, booted by the
// `nox-hardhat-plugin` `hardhat test` override — see hardhat.config.ts,
// `nox: { skipTestOverride: false }`). FOUR REAL, distinct local Hardhat
// accounts play buyer/seller/auditor/stranger throughout — this repo only
// has ONE funded Sepolia signer (see feedback.md, Fase 3, and
// scripts/e2e/auditor-check.sepolia.ts's documented limitation), but the
// local EDR network provides 20 pre-funded accounts for free, so a genuine
// 4-distinct-account ACL-isolation proof (each trader decrypts only their
// own fill; the auditor decrypts BOTH; a stranger decrypts NEITHER) is fully
// exercisable here.
//
// Same self-contained-per-file convention as ConfidentialUSDC.test.ts /
// AfterHoursDesk.test.ts (feedback.md, Fase 1/2): no shared test-helper
// module — each test file owns its own `withExplicitAddress`/
// `handleClientFor` copies.

const SIX_DECIMALS = 10n ** 6n;
const ZERO_HANDLE = `0x${"0".repeat(64)}` as const;

// Same friction/workaround as ConfidentialUSDC.test.ts / AfterHoursDesk.test.ts
// (feedback.md, Fase 1): `@iexec-nox/handle`'s `WalletClientAdapter.getAddress()`
// resolves via `walletClient.getAddresses()[0]`, which for a "json-rpc" account
// (every account from `viem.getWalletClients()` on the plugin's local `noxLocal`
// network) ignores which specific account the client was built from and always
// returns the node's full account list — so `[0]` is always the FIRST node
// account, regardless of which wallet client you started from. Wrapping in a
// Proxy that overrides only `getAddresses()` fixes this for both `encryptInput`
// (proof "owner") and `decrypt`/`publicDecrypt` (ACL "viewer") calls made on
// behalf of a non-default account.
function withExplicitAddress<T extends GetWalletClientReturnType<"op">>(walletClient: T): T {
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

const SHORT_LIVED_OPERATOR_EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);

// Phase 4 — arbitrary deterministic test price for `MockPriceOracle` (TEST-ONLY, never deployed
// to Sepolia — see `contracts/mocks/MockPriceOracle.sol`). This suite is about ACL isolation, not
// price-oracle correctness (that's `test/unit/UniswapV3PriceReader.test.ts`), so any fixed value
// is fine here.
const MOCK_PRICE = 2_000n * 10n ** 6n;

/**
 * Deploys MockUSDC -> ConfidentialUSDC -> ViewerRegistry(auditor) -> MockPriceOracle ->
 * AfterHoursDesk(cusdc, viewerRegistry, priceOracle), fresh, for one test. Also returns a
 * fourth account (`stranger`) with zero ACL over anything produced below, to
 * prove least-privilege: nobody but the trader/auditor combo can decrypt.
 */
async function deployDeskWithAuditor() {
  const { viem } = await nox.connect();
  const [buyer, seller, auditor, stranger] = await viem.getWalletClients();

  const usdc = await viem.deployContract("MockUSDC", [0n]);
  const cusdc = await viem.deployContract("ConfidentialUSDC", [usdc.address]);
  const viewerRegistry = await viem.deployContract("ViewerRegistry", [auditor.account.address]);
  const priceOracle = await viem.deployContract("MockPriceOracle", [MOCK_PRICE]);
  const desk = await viem.deployContract("AfterHoursDesk", [
    cusdc.address,
    viewerRegistry.address,
    priceOracle.address,
  ]);
  await viewerRegistry.write.setDesk([desk.address]);

  return { viem, buyer, seller, auditor, stranger, usdc, cusdc, viewerRegistry, priceOracle, desk };
}

/**
 * Funds `buyer` with `wrapAmount` confidential cUSDC and authorizes `desk` as
 * an operator over the buyer's cUSDC — the precondition `submitOrder`
 * enforces before accepting a buy order.
 */
async function fundAndAuthorizeBuyer(
  usdc: Awaited<ReturnType<typeof deployDeskWithAuditor>>["usdc"],
  cusdc: Awaited<ReturnType<typeof deployDeskWithAuditor>>["cusdc"],
  deskAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  wrapAmount: bigint,
) {
  await usdc.write.faucet([buyerAddress, wrapAmount]);
  await usdc.write.approve([cusdc.address, wrapAmount]);
  await cusdc.write.wrap([buyerAddress, wrapAmount]);
  await cusdc.write.setOperator([deskAddress, SHORT_LIVED_OPERATOR_EXPIRY]);
}

describe("ViewerRegistry — compliance-viewer ACL wiring (Phase 3)", () => {
  it("deploys with the immutable complianceViewer set to the constructor argument", async () => {
    const { auditor, viewerRegistry } = await deployDeskWithAuditor();
    assert.equal(
      (await viewerRegistry.read.complianceViewer()).toLowerCase(),
      auditor.account.address.toLowerCase(),
    );
  });

  it("rejects a zero complianceViewer address at deploy time", async () => {
    const { viem } = await nox.connect();
    await assert.rejects(
      viem.deployContract("ViewerRegistry", ["0x0000000000000000000000000000000000000000"]),
      /ZeroComplianceViewer/,
    );
  });

  it(
    "complianceViewer decrypts BOTH fills of a settlement; each trader decrypts ONLY their " +
      "own fill; a stranger decrypts NEITHER fill NOR residual",
    async () => {
      const { viem, buyer, seller, auditor, stranger, usdc, cusdc, viewerRegistry, desk } =
        await deployDeskWithAuditor();

      const buyAmount = 100n * SIX_DECIMALS;
      const sellAmount = 60n * SIX_DECIMALS;
      const expectedMatched = sellAmount; // min(100, 60)
      const expectedBuyResidual = buyAmount - expectedMatched; // 40
      const expectedSellResidual = 0n;
      // Single order per side => `fill` reduces exactly to `matched` for both legs (no
      // pro-rata rounding — see `_computeFill`'s docstring in AfterHoursDesk.sol).
      const expectedBuyFill = expectedMatched;
      const expectedSellFill = expectedMatched;

      await fundAndAuthorizeBuyer(
        usdc,
        cusdc,
        desk.address,
        buyer.account.address,
        1_000n * SIX_DECIMALS,
      );

      // --- buyer submits BUY order (default wallet client = buyer, matches the proof's
      // "owner" resolved by `nox.encryptInput`, which always signs for the FIRST wallet
      // client).
      const { handle: buyHandle, handleProof: buyProof } = await nox.encryptInput(
        buyAmount,
        "uint256",
        desk.address,
      );
      const { result: buyOrderId } = await desk.simulate.submitOrder([true, buyHandle, buyProof]);
      await desk.write.submitOrder([true, buyHandle, buyProof]);

      // --- seller submits SELL order — its OWN handleClient (encryptInput signs "owner" =
      // seller) and its OWN contract instance bound to seller's wallet client.
      const sellerHandleClient = await handleClientFor(seller);
      const { handle: sellHandle, handleProof: sellProof } = await sellerHandleClient.encryptInput(
        sellAmount,
        "uint256",
        desk.address,
      );
      const deskAsSeller = await viem.getContractAt("AfterHoursDesk", desk.address, {
        client: { wallet: withExplicitAddress(seller) },
      });
      // `.simulate.*` on a viem contract instance defaults to the PUBLIC client's account, not
      // the bound wallet client's — an explicit `account` override is required here (see
      // feedback.md, Fase 2, for the full writeup of this bug).
      const { result: sellOrderId } = await deskAsSeller.simulate.submitOrder(
        [false, sellHandle, sellProof],
        { account: seller.account },
      );
      await deskAsSeller.write.submitOrder([false, sellHandle, sellProof]);

      // --- settle: callable by anyone — use the auditor's account here specifically, to also
      // prove settlement (and the ViewerRegistry wiring inside it) does not require the
      // caller to be a trader, a keeper, or the auditor themselves.
      const deskAsAuditor = await viem.getContractAt("AfterHoursDesk", desk.address, {
        client: { wallet: withExplicitAddress(auditor) },
      });
      await deskAsAuditor.write.settleBatch();

      // --- fill handles: the Phase 3 gap fix (feedback.md, "gap real") — previously only a
      // local variable inside `_settleBuyOrder`/`_settleSellOrder`, now persisted + exposed.
      const buyFillHandle = (await desk.read.getOrderFillHandle([buyOrderId])) as `0x${string}`;
      const sellFillHandle = (await desk.read.getOrderFillHandle([sellOrderId])) as `0x${string}`;
      assert.notEqual(buyFillHandle, ZERO_HANDLE);
      assert.notEqual(sellFillHandle, ZERO_HANDLE);

      const buyResidualHandle = (await desk.read.getOrderResidualHandle([
        buyOrderId,
      ])) as `0x${string}`;
      const sellResidualHandle = (await desk.read.getOrderResidualHandle([
        sellOrderId,
      ])) as `0x${string}`;

      // --- real on-chain proof that `ViewerRegistry.registerFill` fired for both legs, read
      // straight from the deployed contract's own events (mirrors
      // scripts/e2e/auditor-check.sepolia.ts's live-Sepolia proof).
      const fillRegisteredEvents = await viewerRegistry.getEvents.FillRegistered({});
      const registeredHandles = fillRegisteredEvents.map((event) => event.args.fillHandle);
      assert.ok(registeredHandles.includes(buyFillHandle));
      assert.ok(registeredHandles.includes(sellFillHandle));

      const auditorHandleClient = await handleClientFor(auditor);
      const buyerHandleClient = await handleClientFor(buyer);
      const strangerHandleClient = await handleClientFor(stranger);

      // --- the compliance viewer decrypts BOTH fills — the core Phase 3 claim.
      const { value: buyFillAsAuditor } = await auditorHandleClient.decrypt(buyFillHandle);
      assert.equal(buyFillAsAuditor, expectedBuyFill);
      const { value: sellFillAsAuditor } = await auditorHandleClient.decrypt(sellFillHandle);
      assert.equal(sellFillAsAuditor, expectedSellFill);

      // --- each trader decrypts ONLY their own fill.
      const { value: buyFillAsBuyer } = await buyerHandleClient.decrypt(buyFillHandle);
      assert.equal(buyFillAsBuyer, expectedBuyFill);
      await assert.rejects(buyerHandleClient.decrypt(sellFillHandle));

      const { value: sellFillAsSeller } = await sellerHandleClient.decrypt(sellFillHandle);
      assert.equal(sellFillAsSeller, expectedSellFill);
      await assert.rejects(sellerHandleClient.decrypt(buyFillHandle));

      // --- least privilege: the auditor was granted VIEWER access on FILLS only — never on
      // the underlying RESIDUAL handles, which `ViewerRegistry.registerFill` is never called
      // with. Confirms the compliance-viewer grant is scoped exactly to what the product spec
      // requires ("the auditor decrypts every fill"), not a blanket grant over every
      // confidential field this desk manages.
      await assert.rejects(auditorHandleClient.decrypt(buyResidualHandle));
      await assert.rejects(auditorHandleClient.decrypt(sellResidualHandle));

      // --- a stranger with zero ACL over anything here decrypts NEITHER fill NOR residual,
      // for either order.
      await assert.rejects(strangerHandleClient.decrypt(buyFillHandle));
      await assert.rejects(strangerHandleClient.decrypt(sellFillHandle));
      await assert.rejects(strangerHandleClient.decrypt(buyResidualHandle));
      await assert.rejects(strangerHandleClient.decrypt(sellResidualHandle));

      // --- sanity: residuals still behave exactly as Phase 2 already proved (each trader
      // decrypts only their own), unaffected by the Phase 3 addition.
      const { value: buyResidual } = await buyerHandleClient.decrypt(buyResidualHandle);
      assert.equal(buyResidual, expectedBuyResidual);
      const { value: sellResidual } = await sellerHandleClient.decrypt(sellResidualHandle);
      assert.equal(sellResidual, expectedSellResidual);
    },
  );

  it("registerFill reverts when called directly by an address with no ACL over the handle", async () => {
    // Proves the layered defense documented in ViewerRegistry.sol: even setting the `onlyDesk`
    // gate aside, an arbitrary EOA cannot register an arbitrary handle it has no access to —
    // NoxCompute's own `onlyAllowed` check (evaluated against `msg.sender` == the caller of
    // `Nox.addViewer`, i.e. `ViewerRegistry` itself in a real flow, but here there IS no real
    // flow — we call `registerFill` directly, out of band, so `ViewerRegistry` never received a
    // transient grant for this handle at all) rejects it. In THIS call the `onlyDesk` gate (see
    // next test) actually fires first since the caller isn't `desk` either — both layers reject
    // it independently, which is the point of defense in depth.
    const { auditor, viewerRegistry } = await deployDeskWithAuditor();
    const { handle } = await nox.encryptInput(42n, "uint256", viewerRegistry.address);
    // `handle` here is an EXTERNAL handle (not yet validated via `Nox.fromExternal`) — passing
    // it straight to `registerFill(euint256)` without ever calling `fromExternal` means
    // `ViewerRegistry` never obtained even its own transient access to it, let alone anyone
    // else's — this call must revert regardless of the exact underlying Nox error.
    await assert.rejects(viewerRegistry.write.registerFill([handle]));
  });

  it("setDesk: one-time caller gate — rejects zero address, rejects being set twice, rejects a non-desk caller of registerFill", async () => {
    // Fresh registry here (not the one from deployDeskWithAuditor, which already called
    // setDesk as part of that helper) — this test exercises setDesk itself, unpaired.
    const { viem, auditor, stranger } = await deployDeskWithAuditor();
    const freshRegistry = await viem.deployContract("ViewerRegistry", [auditor.account.address]);

    await assert.rejects(
      freshRegistry.write.setDesk(["0x0000000000000000000000000000000000000000"]),
      /ZeroDesk/,
    );

    await freshRegistry.write.setDesk([stranger.account.address]);
    await assert.rejects(
      freshRegistry.write.setDesk([auditor.account.address]),
      /DeskAlreadySet/,
    );

    // A non-desk caller (even one holding real Nox ACL over the handle) is rejected by the
    // `onlyDesk` gate before Nox's own ACL layer is ever consulted.
    const { handle } = await nox.encryptInput(7n, "uint256", freshRegistry.address);
    await assert.rejects(freshRegistry.write.registerFill([handle]), /OnlyDesk/);
  });
});
