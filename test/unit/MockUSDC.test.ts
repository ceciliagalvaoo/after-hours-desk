import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { nox } from "@iexec-nox/nox-hardhat-plugin";

// MockUSDC never touches any Nox/euint256 primitive — it's a plain ERC-20.
// We still go through `nox.connect()` (not a bare `network.connect()`) for
// consistency with every other test/unit file and to avoid the documented
// footgun in feedback.md ("[Fase 0] Spike 1/4"): a bare `network.connect()`
// lands on a different EDR-simulated chain than the one the
// `nox-hardhat-plugin` test-override boots/etches NoxCompute onto, and the
// resulting failure mode for anything Nox-related is a confusing
// `ContractFunctionExecutionError`, not an obvious "wrong network" message.
// MockUSDC doesn't need NoxCompute to exist, but there's no reason to invite
// that footgun into this file either.

const SIX_DECIMALS = 10n ** 6n;

describe("MockUSDC", () => {
  it("mints the constructor's initial supply to the deployer, at 6 decimals", async () => {
    const { viem } = await nox.connect();
    const [deployer] = await viem.getWalletClients();

    const initialSupply = 1_000_000n * SIX_DECIMALS;
    const usdc = await viem.deployContract("MockUSDC", [initialSupply]);

    assert.equal(await usdc.read.decimals(), 6);
    assert.equal(
      await usdc.read.balanceOf([deployer.account.address]),
      initialSupply,
    );
    assert.equal(await usdc.read.totalSupply(), initialSupply);
  });

  it("faucet() mints up to FAUCET_CAP to any address, for anyone", async () => {
    const { viem } = await nox.connect();
    const [, other] = await viem.getWalletClients();

    const usdc = await viem.deployContract("MockUSDC", [0n]);
    const cap = await usdc.read.FAUCET_CAP();

    await usdc.write.faucet([other.account.address, cap]);
    assert.equal(await usdc.read.balanceOf([other.account.address]), cap);
  });

  it("faucet() reverts when the requested amount exceeds FAUCET_CAP", async () => {
    const { viem } = await nox.connect();
    const [deployer] = await viem.getWalletClients();

    const usdc = await viem.deployContract("MockUSDC", [0n]);
    const cap = await usdc.read.FAUCET_CAP();

    await assert.rejects(
      usdc.write.faucet([deployer.account.address, cap + 1n]),
      /FaucetAmountTooLarge/,
    );
  });
});
