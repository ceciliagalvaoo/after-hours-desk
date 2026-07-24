import { connectSepolia } from "../utils/network.js";
import { writeSepoliaDeployments } from "../utils/deployments.js";

// 1,000,000.000000 mUSDC (6 decimals) minted to the deployer at construction
// time — plenty for demo/E2E use without relying on the public faucet.
const INITIAL_SUPPLY_TO_DEPLOYER = 1_000_000n * 10n ** 6n;

async function main() {
  const { viem } = await connectSepolia();
  const [deployer] = await viem.getWalletClients();

  console.log(`[deploy] MockUSDC — deployer ${deployer.account.address}`);
  const mockUsdc = await viem.deployContract("MockUSDC", [INITIAL_SUPPLY_TO_DEPLOYER]);
  console.log(`[deploy] MockUSDC deployed at ${mockUsdc.address}`);

  await writeSepoliaDeployments({ mockUSDC: mockUsdc.address });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
