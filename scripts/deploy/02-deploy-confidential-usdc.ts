import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments, writeSepoliaDeployments } from "../utils/deployments.js";

async function main() {
  const { viem } = await connectSepolia();
  const deployments = await readSepoliaDeployments();

  if (!deployments.mockUSDC) {
    throw new Error(
      "[deploy] deployments/sepolia.json has no mockUSDC address — run " +
        "scripts/deploy/01-deploy-mock-usdc.ts first.",
    );
  }

  console.log(`[deploy] ConfidentialUSDC wrapping MockUSDC at ${deployments.mockUSDC}`);
  const cusdc = await viem.deployContract("ConfidentialUSDC", [deployments.mockUSDC]);
  console.log(`[deploy] ConfidentialUSDC (cUSDC) deployed at ${cusdc.address}`);

  await writeSepoliaDeployments({ confidentialUSDC: cusdc.address });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
