import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../state/WalletContext";
import { getPublicClient } from "../lib/viemClients";
import { getPastLogsChunked } from "../lib/eventLogs";
import { deployments, AFTER_HOURS_DESK_ABI } from "../config/contracts";

export interface MyOrder {
  orderId: bigint;
  isBuy: boolean;
  batchId: bigint;
  submittedAt: number;
  settled: boolean;
}

/**
 * Reconstructs the connected trader's own order history straight from chain state — the
 * `OrderSubmitted` event (`trader` is indexed, so this is a targeted `eth_getLogs` filter, not a
 * full-tape scan) bootstraps which order ids belong to this account, then `getOrderMeta` (a
 * public view) fills in the real, current, on-chain status of each one. No local-only "fake
 * order" is ever synthesized — `addOptimisticOrder` below only ever receives an orderId decoded
 * from a REAL mined transaction receipt (see `OrderTicket.tsx`).
 */
export function useMyOrders(): {
  orders: MyOrder[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addOptimisticOrder: (order: MyOrder) => void;
} {
  const { account } = useWallet();
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account) {
      setOrders([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const client = getPublicClient();
      const logs = await getPastLogsChunked<{ orderId: bigint }>(client, {
        address: deployments.afterHoursDesk,
        abi: AFTER_HOURS_DESK_ABI,
        eventName: "OrderSubmitted",
        args: { trader: account },
      });

      const fetched = await Promise.all(
        logs.map(async (log) => {
          const orderId = log.args.orderId;
          const meta = (await client.readContract({
            address: deployments.afterHoursDesk,
            abi: AFTER_HOURS_DESK_ABI,
            functionName: "getOrderMeta",
            args: [orderId],
          })) as readonly [`0x${string}`, boolean, bigint, bigint, boolean];
          const [, isBuy, batchId, submittedAt, settled] = meta;
          return { orderId, isBuy, batchId, submittedAt: Number(submittedAt), settled } satisfies MyOrder;
        }),
      );

      fetched.sort((a, b) => (a.orderId > b.orderId ? -1 : 1));
      setOrders(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addOptimisticOrder = useCallback((order: MyOrder) => {
    setOrders((prev) => [order, ...prev.filter((o) => o.orderId !== order.orderId)]);
  }, []);

  return { orders, isLoading, error, refresh, addOptimisticOrder };
}
