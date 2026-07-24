import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createViemHandleClient } from "@iexec-nox/handle";
import type { HandleClient } from "@iexec-nox/handle";
import { nox, NOX_COMPUTE_ADDRESS, handleGatewayUrl } from "@iexec-nox/nox-hardhat-plugin";
import type { GetWalletClientReturnType } from "@nomicfoundation/hardhat-viem/types";

// Runs against the local Nox offchain stack (Docker Compose, booted by the
// `nox-hardhat-plugin` `hardhat test` override — see hardhat.config.ts,
// `nox: { skipTestOverride: false }`). Two REAL, distinct local Hardhat
// accounts play buyer/seller throughout (never the same account twice) —
// see feedback.md for why: this repo only has ONE funded Sepolia signer, but
// the local EDR network provides 20 pre-funded accounts for free, so
// multi-account netting is fully exercisable here without any funds
// limitation.

const SIX_DECIMALS = 10n ** 6n;

// Same friction/workaround as ConfidentialUSDC.test.ts (feedback.md, Fase 1):
// `@iexec-nox/handle`'s `WalletClientAdapter.getAddress()` resolves via
// `walletClient.getAddresses()[0]`, which for a "json-rpc" account (every
// account from `viem.getWalletClients()` on the plugin's local `noxLocal`
// network) ignores which specific account the client was built from and
// always returns the node's full account list — so `[0]` is always the
// FIRST node account, regardless of which wallet client you started from.
// Wrapping in a Proxy that overrides only `getAddresses()` fixes this for
// both `encryptInput` (proof "owner") and `decrypt`/`publicDecrypt` (ACL
// "viewer") calls made on behalf of a non-default account.
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

// Phase 4 — arbitrary deterministic test price (2000.000000 USDC per WETH, 6-decimal
// convention). This is `MockPriceOracle`'s injected value — a TEST-ONLY double (see
// `contracts/mocks/MockPriceOracle.sol`), never deployed to Sepolia. The REAL, live-pool-backed
// `UniswapV3PriceReader` is exercised for real in `test/unit/UniswapV3PriceReader.test.ts`
// (against a Sepolia fork) — this local Nox-stack suite has nothing to do with price-oracle
// correctness, only with `AfterHoursDesk` genuinely reading whatever oracle it was given.
const MOCK_PRICE = 2_000n * 10n ** 6n;

/**
 * Deploys MockUSDC -> ConfidentialUSDC -> ViewerRegistry -> MockPriceOracle -> AfterHoursDesk,
 * fresh, for one test. `AfterHoursDesk`'s constructor gained a second argument in Phase 3
 * (`viewerRegistryAddress` — see feedback.md, Fase 3) and a third in Phase 4
 * (`priceOracleAddress` — see feedback.md, Fase 4) — a third local wallet client (`auditor`)
 * plays the compliance viewer here purely so this deploy helper stays valid; ACL/auditor-specific
 * assertions live in `test/unit/ViewerRegistry.test.ts`, not here.
 */
async function deployDesk() {
  const { viem } = await nox.connect();
  const [buyer, seller, auditor] = await viem.getWalletClients();

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

  return { viem, buyer, seller, auditor, usdc, cusdc, viewerRegistry, priceOracle, desk };
}

/**
 * Funds `buyer` with `wrapAmount` confidential cUSDC and authorizes `desk` as
 * an operator over the buyer's cUSDC — the precondition `submitOrder`
 * enforces (in plaintext, leaking nothing) before accepting a buy order,
 * since settlement later pulls funds via `confidentialTransferFrom` on the
 * buyer's behalf ("operators, not allowances" — see AfterHoursDesk.sol).
 */
async function fundAndAuthorizeBuyer(
  usdc: Awaited<ReturnType<typeof deployDesk>>["usdc"],
  cusdc: Awaited<ReturnType<typeof deployDesk>>["cusdc"],
  deskAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  wrapAmount: bigint,
) {
  await usdc.write.faucet([buyerAddress, wrapAmount]);
  await usdc.write.approve([cusdc.address, wrapAmount]);
  await cusdc.write.wrap([buyerAddress, wrapAmount]);
  await cusdc.write.setOperator([deskAddress, SHORT_LIVED_OPERATOR_EXPIRY]);
}

describe("AfterHoursDesk — composed-primitives netting (Plan A) + real cUSDC settlement", () => {
  it("rejects a buy order when the buyer has not authorized the desk as a cUSDC operator", async () => {
    const { viem, desk } = await deployDesk();

    const { handle, handleProof } = await nox.encryptInput(
      10n * SIX_DECIMALS,
      "uint256",
      desk.address,
    );

    await assert.rejects(
      desk.write.submitOrder([true, handle, handleProof]),
      /BuyerMustSetDeskAsOperator/,
    );
  });

  it("buy > sell: seller fully filled, buyer left with a viewer-decryptable residual", async () => {
    const { viem, buyer, seller, usdc, cusdc, priceOracle, desk } = await deployDesk();

    const buyAmount = 100n * SIX_DECIMALS;
    const sellAmount = 60n * SIX_DECIMALS;
    const expectedMatched = sellAmount; // min(100, 60)
    const expectedBuyResidual = buyAmount - expectedMatched; // 40
    const expectedSellResidual = 0n;

    await fundAndAuthorizeBuyer(
      usdc,
      cusdc,
      desk.address,
      buyer.account.address,
      1_000n * SIX_DECIMALS,
    );

    // --- buyer submits BUY order (default wallet client = buyer, matches the
    // proof's "owner" resolved by `nox.encryptInput`, which always signs for
    // the FIRST wallet client).
    const { handle: buyHandle, handleProof: buyProof } = await nox.encryptInput(
      buyAmount,
      "uint256",
      desk.address,
    );
    const { result: buyOrderId } = await desk.simulate.submitOrder([true, buyHandle, buyProof]);
    await desk.write.submitOrder([true, buyHandle, buyProof]);

    // --- seller submits SELL order — needs ITS OWN handleClient (encryptInput
    // signs "owner" = seller) and its OWN contract instance bound to seller's
    // wallet client (msg.sender must be the seller for `Nox.fromExternal` to
    // validate).
    const sellerHandleClient = await handleClientFor(seller);
    const { handle: sellHandle, handleProof: sellProof } = await sellerHandleClient.encryptInput(
      sellAmount,
      "uint256",
      desk.address,
    );
    const deskAsSeller = await viem.getContractAt("AfterHoursDesk", desk.address, {
      client: { wallet: withExplicitAddress(seller) },
    });
    // `.simulate.*` on a viem contract instance defaults to the PUBLIC
    // client's account, not the bound wallet client's — only `.write.*`
    // respects `client.wallet`. An explicit `account` override is required
    // here or this eth_call runs as the wrong sender and `Nox.fromExternal`'s
    // proof-owner check reverts with "Owner mismatch" (confirmed by reading
    // viem's own `getContract.js`; see feedback.md).
    const { result: sellOrderId } = await deskAsSeller.simulate.submitOrder(
      [false, sellHandle, sellProof],
      { account: seller.account },
    );
    await deskAsSeller.write.submitOrder([false, sellHandle, sellProof]);

    // --- settle: anyone can call this (no privileged keeper) — use the
    // default (buyer) account for no particular reason.
    const { result: batchId } = await desk.simulate.settleBatch();
    await desk.write.settleBatch();
    assert.equal(batchId, 1n);

    // --- aggregate matched quantity + placeholder execution price are the
    // ONLY publicly decryptable handles this produces.
    const matchedHandle = await desk.read.getBatchMatchedAmountHandle([batchId]);
    const { value: matched } = await nox.publicDecrypt(matchedHandle as `0x${string}`);
    assert.equal(matched, expectedMatched);

    // Phase 4: the execution price is a REAL read from `priceOracle` at settlement time (via
    // `AfterHoursDesk._executionPriceHandle`), not a hardcoded constant — cross-checked here two
    // ways: against the known `MOCK_PRICE` this test deployed the oracle with, AND against a
    // fresh, independent `priceOracle.read.getReferencePrice()` call (mirroring the same
    // independent-oracle-read cross-check the live Sepolia E2E script performs).
    const priceHandle = await desk.read.getBatchExecutionPriceHandle([batchId]);
    const { value: price } = await nox.publicDecrypt(priceHandle as `0x${string}`);
    assert.equal(price, MOCK_PRICE);
    assert.equal(price, await priceOracle.read.getReferencePrice());

    // --- residuals: each trader decrypts only their OWN.
    const buyResidualHandle = await desk.read.getOrderResidualHandle([buyOrderId]);
    const { value: buyResidual } = await nox.decrypt(buyResidualHandle as `0x${string}`);
    assert.equal(buyResidual, expectedBuyResidual);

    const sellResidualHandle = await desk.read.getOrderResidualHandle([sellOrderId]);
    const { value: sellResidual } = await sellerHandleClient.decrypt(
      sellResidualHandle as `0x${string}`,
    );
    assert.equal(sellResidual, expectedSellResidual);

    // --- real confidential balance movement: buyer's cUSDC balance dropped
    // by exactly `matched`, seller's grew by exactly `matched`.
    const buyerBalanceHandle = await cusdc.read.confidentialBalanceOf([buyer.account.address]);
    const { value: buyerBalanceAfter } = await nox.decrypt(buyerBalanceHandle as `0x${string}`);
    assert.equal(buyerBalanceAfter, 1_000n * SIX_DECIMALS - expectedMatched);

    const sellerBalanceHandle = await cusdc.read.confidentialBalanceOf([seller.account.address]);
    const { value: sellerBalanceAfter } = await sellerHandleClient.decrypt(
      sellerBalanceHandle as `0x${string}`,
    );
    assert.equal(sellerBalanceAfter, expectedMatched);
  });

  it("sell > buy: buyer fully filled, seller left with a viewer-decryptable residual", async () => {
    const { viem, buyer, seller, usdc, cusdc, desk } = await deployDesk();

    const buyAmount = 50n * SIX_DECIMALS;
    const sellAmount = 90n * SIX_DECIMALS;
    const expectedMatched = buyAmount; // min(50, 90)
    const expectedBuyResidual = 0n;
    const expectedSellResidual = sellAmount - expectedMatched; // 40

    await fundAndAuthorizeBuyer(
      usdc,
      cusdc,
      desk.address,
      buyer.account.address,
      1_000n * SIX_DECIMALS,
    );

    const { handle: buyHandle, handleProof: buyProof } = await nox.encryptInput(
      buyAmount,
      "uint256",
      desk.address,
    );
    const { result: buyOrderId } = await desk.simulate.submitOrder([true, buyHandle, buyProof]);
    await desk.write.submitOrder([true, buyHandle, buyProof]);

    const sellerHandleClient = await handleClientFor(seller);
    const { handle: sellHandle, handleProof: sellProof } = await sellerHandleClient.encryptInput(
      sellAmount,
      "uint256",
      desk.address,
    );
    const deskAsSeller = await viem.getContractAt("AfterHoursDesk", desk.address, {
      client: { wallet: withExplicitAddress(seller) },
    });
    // `.simulate.*` on a viem contract instance defaults to the PUBLIC
    // client's account, not the bound wallet client's — only `.write.*`
    // respects `client.wallet`. An explicit `account` override is required
    // here or this eth_call runs as the wrong sender and `Nox.fromExternal`'s
    // proof-owner check reverts with "Owner mismatch" (confirmed by reading
    // viem's own `getContract.js`; see feedback.md).
    const { result: sellOrderId } = await deskAsSeller.simulate.submitOrder(
      [false, sellHandle, sellProof],
      { account: seller.account },
    );
    await deskAsSeller.write.submitOrder([false, sellHandle, sellProof]);

    const { result: batchId } = await desk.simulate.settleBatch();
    await desk.write.settleBatch();

    const matchedHandle = await desk.read.getBatchMatchedAmountHandle([batchId]);
    const { value: matched } = await nox.publicDecrypt(matchedHandle as `0x${string}`);
    assert.equal(matched, expectedMatched);

    const buyResidualHandle = await desk.read.getOrderResidualHandle([buyOrderId]);
    const { value: buyResidual } = await nox.decrypt(buyResidualHandle as `0x${string}`);
    assert.equal(buyResidual, expectedBuyResidual);

    const sellResidualHandle = await desk.read.getOrderResidualHandle([sellOrderId]);
    const { value: sellResidual } = await sellerHandleClient.decrypt(
      sellResidualHandle as `0x${string}`,
    );
    assert.equal(sellResidual, expectedSellResidual);

    const buyerBalanceHandle = await cusdc.read.confidentialBalanceOf([buyer.account.address]);
    const { value: buyerBalanceAfter } = await nox.decrypt(buyerBalanceHandle as `0x${string}`);
    assert.equal(buyerBalanceAfter, 1_000n * SIX_DECIMALS - expectedMatched);

    const sellerBalanceHandle = await cusdc.read.confidentialBalanceOf([seller.account.address]);
    const { value: sellerBalanceAfter } = await sellerHandleClient.decrypt(
      sellerBalanceHandle as `0x${string}`,
    );
    assert.equal(sellerBalanceAfter, expectedMatched);
  });

  it("buy == sell: both sides fully filled, both residuals are zero", async () => {
    const { viem, buyer, seller, usdc, cusdc, desk } = await deployDesk();

    const buyAmount = 70n * SIX_DECIMALS;
    const sellAmount = 70n * SIX_DECIMALS;
    const expectedMatched = 70n * SIX_DECIMALS;

    await fundAndAuthorizeBuyer(
      usdc,
      cusdc,
      desk.address,
      buyer.account.address,
      1_000n * SIX_DECIMALS,
    );

    const { handle: buyHandle, handleProof: buyProof } = await nox.encryptInput(
      buyAmount,
      "uint256",
      desk.address,
    );
    const { result: buyOrderId } = await desk.simulate.submitOrder([true, buyHandle, buyProof]);
    await desk.write.submitOrder([true, buyHandle, buyProof]);

    const sellerHandleClient = await handleClientFor(seller);
    const { handle: sellHandle, handleProof: sellProof } = await sellerHandleClient.encryptInput(
      sellAmount,
      "uint256",
      desk.address,
    );
    const deskAsSeller = await viem.getContractAt("AfterHoursDesk", desk.address, {
      client: { wallet: withExplicitAddress(seller) },
    });
    // `.simulate.*` on a viem contract instance defaults to the PUBLIC
    // client's account, not the bound wallet client's — only `.write.*`
    // respects `client.wallet`. An explicit `account` override is required
    // here or this eth_call runs as the wrong sender and `Nox.fromExternal`'s
    // proof-owner check reverts with "Owner mismatch" (confirmed by reading
    // viem's own `getContract.js`; see feedback.md).
    const { result: sellOrderId } = await deskAsSeller.simulate.submitOrder(
      [false, sellHandle, sellProof],
      { account: seller.account },
    );
    await deskAsSeller.write.submitOrder([false, sellHandle, sellProof]);

    const { result: batchId } = await desk.simulate.settleBatch();
    await desk.write.settleBatch();

    const matchedHandle = await desk.read.getBatchMatchedAmountHandle([batchId]);
    const { value: matched } = await nox.publicDecrypt(matchedHandle as `0x${string}`);
    assert.equal(matched, expectedMatched);

    const buyResidualHandle = await desk.read.getOrderResidualHandle([buyOrderId]);
    const { value: buyResidual } = await nox.decrypt(buyResidualHandle as `0x${string}`);
    assert.equal(buyResidual, 0n);

    const sellResidualHandle = await desk.read.getOrderResidualHandle([sellOrderId]);
    const { value: sellResidual } = await sellerHandleClient.decrypt(
      sellResidualHandle as `0x${string}`,
    );
    assert.equal(sellResidual, 0n);

    const buyerBalanceHandle = await cusdc.read.confidentialBalanceOf([buyer.account.address]);
    const { value: buyerBalanceAfter } = await nox.decrypt(buyerBalanceHandle as `0x${string}`);
    assert.equal(buyerBalanceAfter, 1_000n * SIX_DECIMALS - expectedMatched);

    const sellerBalanceHandle = await cusdc.read.confidentialBalanceOf([seller.account.address]);
    const { value: sellerBalanceAfter } = await sellerHandleClient.decrypt(
      sellerBalanceHandle as `0x${string}`,
    );
    assert.equal(sellerBalanceAfter, expectedMatched);

    // Cross-check ACL isolation: neither trader can decrypt the OTHER's
    // residual — confirms `_settleBuyOrder`/`_settleSellOrder` grant `allow`
    // only to each order's OWN trader.
    await assert.rejects(sellerHandleClient.decrypt(buyResidualHandle as `0x${string}`));
    await assert.rejects(nox.decrypt(sellResidualHandle as `0x${string}`));
  });

  it("Phase 4: settleBatch() reads the price oracle LIVE at settlement time, not once at deploy", async () => {
    // Proves `_executionPriceHandle()` genuinely calls `priceOracle.getReferencePrice()` inside
    // `settleBatch()` every time, rather than reading/caching a value fixed at construction —
    // change the mock oracle's price BETWEEN two batches and confirm each batch's decrypted
    // execution price tracks the value the oracle reported AT THAT BATCH's settlement time.
    const { buyer, seller, usdc, cusdc, priceOracle, desk } = await deployDesk();

    const firstAmount = 10n * SIX_DECIMALS;
    await fundAndAuthorizeBuyer(
      usdc,
      cusdc,
      desk.address,
      buyer.account.address,
      1_000n * SIX_DECIMALS,
    );

    // --- batch 1, settled while the oracle still reports MOCK_PRICE (the deploy-time value).
    const { handle: buyHandle1, handleProof: buyProof1 } = await nox.encryptInput(
      firstAmount,
      "uint256",
      desk.address,
    );
    await desk.write.submitOrder([true, buyHandle1, buyProof1]);

    const sellerHandleClient = await handleClientFor(seller);
    const { handle: sellHandle1, handleProof: sellProof1 } = await sellerHandleClient.encryptInput(
      firstAmount,
      "uint256",
      desk.address,
    );
    const { viem } = await nox.connect();
    const deskAsSeller = await viem.getContractAt("AfterHoursDesk", desk.address, {
      client: { wallet: withExplicitAddress(seller) },
    });
    await deskAsSeller.write.submitOrder([false, sellHandle1, sellProof1]);

    const { result: firstBatchId } = await desk.simulate.settleBatch();
    await desk.write.settleBatch();

    const firstPriceHandle = await desk.read.getBatchExecutionPriceHandle([firstBatchId]);
    const { value: firstPrice } = await nox.publicDecrypt(firstPriceHandle as `0x${string}`);
    assert.equal(firstPrice, MOCK_PRICE);

    // --- change the oracle's price, then settle a SECOND batch.
    const updatedPrice = 3_141n * 10n ** 6n;
    await priceOracle.write.setPrice([updatedPrice]);
    assert.equal(await priceOracle.read.getReferencePrice(), updatedPrice);

    const { handle: buyHandle2, handleProof: buyProof2 } = await nox.encryptInput(
      firstAmount,
      "uint256",
      desk.address,
    );
    await desk.write.submitOrder([true, buyHandle2, buyProof2]);

    const { handle: sellHandle2, handleProof: sellProof2 } = await sellerHandleClient.encryptInput(
      firstAmount,
      "uint256",
      desk.address,
    );
    await deskAsSeller.write.submitOrder([false, sellHandle2, sellProof2]);

    const { result: secondBatchId } = await desk.simulate.settleBatch();
    await desk.write.settleBatch();
    assert.notEqual(secondBatchId, firstBatchId);

    const secondPriceHandle = await desk.read.getBatchExecutionPriceHandle([secondBatchId]);
    const { value: secondPrice } = await nox.publicDecrypt(secondPriceHandle as `0x${string}`);
    assert.equal(secondPrice, updatedPrice);

    // --- and the FIRST batch's already-settled price handle must remain exactly what it was —
    // proves settlement snapshots the oracle's price at settlement time, it doesn't re-resolve
    // stale handles against the oracle's CURRENT (now-changed) price after the fact.
    const { value: firstPriceStillAfter } = await nox.publicDecrypt(firstPriceHandle as `0x${string}`);
    assert.equal(firstPriceStillAfter, MOCK_PRICE);
  });
});
