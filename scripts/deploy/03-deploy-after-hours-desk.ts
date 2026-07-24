import { connectSepolia } from "../utils/network.js";
import { readSepoliaDeployments, writeSepoliaDeployments } from "../utils/deployments.js";

async function main() {
  const { viem } = await connectSepolia();
  const deployments = await readSepoliaDeployments();

  if (!deployments.confidentialUSDC) {
    throw new Error(
      "[deploy] deployments/sepolia.json has no confidentialUSDC address — run " +
        "scripts/deploy/02-deploy-confidential-usdc.ts first.",
    );
  }

  console.log(`[deploy] AfterHoursDesk settling against cUSDC at ${deployments.confidentialUSDC}`);
  const desk = await viem.deployContract("AfterHoursDesk", [deployments.confidentialUSDC]);
  console.log(`[deploy] AfterHoursDesk deployed at ${desk.address}`);

  await writeSepoliaDeployments({ afterHoursDesk: desk.address });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
