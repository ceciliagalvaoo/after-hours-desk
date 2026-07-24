import { useState } from "react";
import { useWallet } from "../state/WalletContext";
import { getPublicClient } from "../lib/viemClients";
import { assertConnectedToSepolia } from "../lib/assertChain";
import { deployments, MOCK_USDC_ABI, CONFIDENTIAL_USDC_ABI } from "../config/contracts";

/**
 * Self-serve onboarding for a judge/reviewer connecting a BRAND-NEW wallet — not one of this
 * repo's two pre-funded testnet accounts. `MockUSDC.faucet()` and `ConfidentialUSDC.wrap()` are
 * both real, public, unpermissioned functions already deployed on Sepolia (see
 * `contracts/MockUSDC.sol`/`ConfidentialUSDC.sol`) — this hook just chains the same three real
 * transactions `scripts/e2e/wrap-check.sepolia.ts` already proved work, from the browser, so a
 * fresh wallet can reach a confidential cUSDC balance without touching Etherscan directly.
 */
export type FaucetStep = "idle" | "faucet" | "approve" | "wrap" | "done" | "error";

export function useFaucetAndWrap(): {
  step: FaucetStep;
  error: string | null;
  lastTxHash: `0x${string}` | null;
  faucetAndWrap: (amount: bigint) => Promise<void>;
} {
  const { walletClient, account, chainId } = useWallet();
  const [step, setStep] = useState<FaucetStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  async function faucetAndWrap(amount: bigint) {
    if (!walletClient || !account) {
      setError("Connect a wallet on Sepolia first.");
      setStep("error");
      return;
    }
    setError(null);
    const publicClient = getPublicClient();
    try {
      assertConnectedToSepolia(chainId);

      setStep("faucet");
      const faucetHash = await walletClient.writeContract({
        address: deployments.mockUSDC,
        abi: MOCK_USDC_ABI,
        functionName: "faucet",
        args: [account, amount],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      setLastTxHash(faucetHash);
      await publicClient.waitForTransactionReceipt({ hash: faucetHash });

      setStep("approve");
      const approveHash = await walletClient.writeContract({
        address: deployments.mockUSDC,
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        args: [deployments.confidentialUSDC, amount],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      setLastTxHash(approveHash);
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setStep("wrap");
      const wrapHash = await walletClient.writeContract({
        address: deployments.confidentialUSDC,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "wrap",
        args: [account, amount],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      setLastTxHash(wrapHash);
      await publicClient.waitForTransactionReceipt({ hash: wrapHash });

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  return { step, error, lastTxHash, faucetAndWrap };
}
