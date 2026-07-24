import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../state/WalletContext";
import { getPublicClient } from "../lib/viemClients";
import { deployments, CONFIDENTIAL_USDC_ABI } from "../config/contracts";

/**
 * Whether the connected wallet has already authorized `AfterHoursDesk` as a cUSDC operator
 * (`IERC7984.isOperator`) — required before a BUY order can settle, since settlement pulls the
 * buyer's fill via `confidentialTransferFrom` (see `AfterHoursDesk.sol`'s `submitOrder`
 * precondition). A plain public boolean read — leaks nothing about balance/order size.
 */
export function useOperatorStatus(): {
  isOperator: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { account } = useWallet();
  const [isOperator, setIsOperator] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account) {
      setIsOperator(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPublicClient().readContract({
        address: deployments.confidentialUSDC,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "isOperator",
        args: [account, deployments.afterHoursDesk],
      });
      setIsOperator(Boolean(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isOperator, isLoading, error, refresh };
}
