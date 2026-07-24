import { useEffect, useRef, useState } from "react";
import { getPublicClient } from "../lib/viemClients";
import { getBlockTimestamps, getPastLogsChunked, type DecodedLog } from "../lib/eventLogs";
import { deployments, AFTER_HOURS_DESK_ABI, VIEWER_REGISTRY_ABI } from "../config/contracts";

/**
 * Real, on-chain-only feed for the public tape/ticker. Every event here is read from the actual
 * deployed `AfterHoursDesk`/`ViewerRegistry` contracts on Sepolia (historical via chunked
 * `eth_getLogs`, live via `watchContractEvent`, which viem polls over the public HTTP transport)
 * — never a synthetic tape entry. `OrderSubmitted`/`BatchOpened`/`BatchSettled` carry only public
 * metadata by contract design (see `AfterHoursDesk.sol`'s own docstring: order size is NEVER
 * emitted in an event); `FillRegistered` carries only the fill's `bytes32` handle pointer, never
 * a plaintext amount. The redaction motif (`███`) rendered by `Tape.tsx` sits on top of a real
 * handle fetched separately (`getOrderHandle`/`getBatchMatchedAmountHandle`), never over a value
 * this hook never actually fetched.
 */
export type DeskTapeEvent =
  | {
      id: string;
      kind: "ORDER_SUBMITTED";
      blockNumber: bigint;
      blockTimestamp: number | null;
      transactionHash: `0x${string}`;
      orderId: bigint;
      trader: `0x${string}`;
      isBuy: boolean;
      batchId: bigint;
    }
  | {
      id: string;
      kind: "BATCH_OPENED";
      blockNumber: bigint;
      blockTimestamp: number | null;
      transactionHash: `0x${string}`;
      batchId: bigint;
    }
  | {
      id: string;
      kind: "BATCH_SETTLED";
      blockNumber: bigint;
      blockTimestamp: number | null;
      transactionHash: `0x${string}`;
      batchId: bigint;
      buyOrderCount: bigint;
      sellOrderCount: bigint;
    }
  | {
      id: string;
      kind: "FILL_REGISTERED";
      blockNumber: bigint;
      blockTimestamp: number | null;
      transactionHash: `0x${string}`;
      fillHandle: `0x${string}`;
    };

// Argument shapes cross-checked against the compiled artifact ABIs (see feedback.md, Fase 5 —
// printed directly from `artifacts/contracts/{AfterHoursDesk,ViewerRegistry}.sol/*.json` before
// this file was written), not assumed from the Solidity source alone.
interface OrderSubmittedArgs {
  orderId: bigint;
  trader: `0x${string}`;
  isBuy: boolean;
  batchId: bigint;
}
interface BatchOpenedArgs {
  batchId: bigint;
}
interface BatchSettledArgs {
  batchId: bigint;
  buyOrderCount: bigint;
  sellOrderCount: bigint;
}
interface FillRegisteredArgs {
  fillHandle: `0x${string}`;
}

function sortDescending(events: DeskTapeEvent[]): DeskTapeEvent[] {
  return [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
    return a.id > b.id ? -1 : 1;
  });
}

export function useDeskEvents(): {
  events: DeskTapeEvent[];
  isLoading: boolean;
  error: string | null;
} {
  const [events, setEvents] = useState<DeskTapeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  function addEvents(next: DeskTapeEvent[]) {
    const fresh = next.filter((event) => !seenIds.current.has(event.id));
    if (fresh.length === 0) return;
    for (const event of fresh) seenIds.current.add(event.id);
    setEvents((prev) => sortDescending([...prev, ...fresh]));
  }

  useEffect(() => {
    let cancelled = false;
    const client = getPublicClient();

    async function loadHistory() {
      setIsLoading(true);
      setError(null);
      try {
        // Sequential, not Promise.all — a free public RPC (publicnode.com) rate-limits/WAF-flags
        // bursts of concurrent requests (confirmed live in this session: a headless-browser smoke
        // test hit both 403 and 429 against this exact endpoint on first load, while a plain
        // `curl` to the same URL succeeded). Four historical log fetches plus the price/balance/
        // operator reads elsewhere already add up; running these one at a time trades a bit of
        // load latency for not tripping the rate limiter on the very first paint.
        const orderLogs = await getPastLogsChunked<OrderSubmittedArgs>(client, {
          address: deployments.afterHoursDesk,
          abi: AFTER_HOURS_DESK_ABI,
          eventName: "OrderSubmitted",
        });
        const openedLogs = await getPastLogsChunked<BatchOpenedArgs>(client, {
          address: deployments.afterHoursDesk,
          abi: AFTER_HOURS_DESK_ABI,
          eventName: "BatchOpened",
        });
        const settledLogs = await getPastLogsChunked<BatchSettledArgs>(client, {
          address: deployments.afterHoursDesk,
          abi: AFTER_HOURS_DESK_ABI,
          eventName: "BatchSettled",
        });
        const fillLogs = await getPastLogsChunked<FillRegisteredArgs>(client, {
          address: deployments.viewerRegistry,
          abi: VIEWER_REGISTRY_ABI,
          eventName: "FillRegistered",
        });

        const allBlockNumbers = [orderLogs, openedLogs, settledLogs, fillLogs]
          .flat()
          .map((log) => log.blockNumber)
          .filter((b): b is bigint => b !== null);
        const timestamps = await getBlockTimestamps(client, allBlockNumbers);

        const mapped: DeskTapeEvent[] = [
          ...orderLogs.map(
            (log): DeskTapeEvent => ({
              id: `order-${log.transactionHash}-${log.logIndex}`,
              kind: "ORDER_SUBMITTED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: log.blockNumber ? timestamps.get(log.blockNumber) ?? null : null,
              transactionHash: log.transactionHash ?? "0x0",
              orderId: log.args.orderId,
              trader: log.args.trader,
              isBuy: log.args.isBuy,
              batchId: log.args.batchId,
            }),
          ),
          ...openedLogs.map(
            (log): DeskTapeEvent => ({
              id: `opened-${log.transactionHash}-${log.logIndex}`,
              kind: "BATCH_OPENED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: log.blockNumber ? timestamps.get(log.blockNumber) ?? null : null,
              transactionHash: log.transactionHash ?? "0x0",
              batchId: log.args.batchId,
            }),
          ),
          ...settledLogs.map(
            (log): DeskTapeEvent => ({
              id: `settled-${log.transactionHash}-${log.logIndex}`,
              kind: "BATCH_SETTLED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: log.blockNumber ? timestamps.get(log.blockNumber) ?? null : null,
              transactionHash: log.transactionHash ?? "0x0",
              batchId: log.args.batchId,
              buyOrderCount: log.args.buyOrderCount,
              sellOrderCount: log.args.sellOrderCount,
            }),
          ),
          ...fillLogs.map(
            (log): DeskTapeEvent => ({
              id: `fill-${log.transactionHash}-${log.logIndex}`,
              kind: "FILL_REGISTERED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: log.blockNumber ? timestamps.get(log.blockNumber) ?? null : null,
              transactionHash: log.transactionHash ?? "0x0",
              fillHandle: log.args.fillHandle,
            }),
          ),
        ];

        if (!cancelled) {
          addEvents(mapped);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadHistory();

    // Live tail — real polling of real logs via viem's `watchContractEvent` (public HTTP
    // transport polls under the hood; this is the SDK's real mechanism, not a fake timer
    // standing in for data). `logs` is narrowed to `DecodedLog<T>` for the same reason
    // `getPastLogsChunked` is generic over `TArgs` — see `lib/eventLogs.ts`'s docstring.
    const unwatchOrder = client.watchContractEvent({
      address: deployments.afterHoursDesk,
      abi: AFTER_HOURS_DESK_ABI,
      eventName: "OrderSubmitted",
      onLogs: (rawLogs) => {
        const logs = rawLogs as unknown as DecodedLog<OrderSubmittedArgs>[];
        addEvents(
          logs.map(
            (log): DeskTapeEvent => ({
              id: `order-${log.transactionHash}-${log.logIndex}`,
              kind: "ORDER_SUBMITTED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: null,
              transactionHash: log.transactionHash ?? "0x0",
              orderId: log.args.orderId,
              trader: log.args.trader,
              isBuy: log.args.isBuy,
              batchId: log.args.batchId,
            }),
          ),
        );
      },
    });
    const unwatchOpened = client.watchContractEvent({
      address: deployments.afterHoursDesk,
      abi: AFTER_HOURS_DESK_ABI,
      eventName: "BatchOpened",
      onLogs: (rawLogs) => {
        const logs = rawLogs as unknown as DecodedLog<BatchOpenedArgs>[];
        addEvents(
          logs.map(
            (log): DeskTapeEvent => ({
              id: `opened-${log.transactionHash}-${log.logIndex}`,
              kind: "BATCH_OPENED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: null,
              transactionHash: log.transactionHash ?? "0x0",
              batchId: log.args.batchId,
            }),
          ),
        );
      },
    });
    const unwatchSettled = client.watchContractEvent({
      address: deployments.afterHoursDesk,
      abi: AFTER_HOURS_DESK_ABI,
      eventName: "BatchSettled",
      onLogs: (rawLogs) => {
        const logs = rawLogs as unknown as DecodedLog<BatchSettledArgs>[];
        addEvents(
          logs.map(
            (log): DeskTapeEvent => ({
              id: `settled-${log.transactionHash}-${log.logIndex}`,
              kind: "BATCH_SETTLED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: null,
              transactionHash: log.transactionHash ?? "0x0",
              batchId: log.args.batchId,
              buyOrderCount: log.args.buyOrderCount,
              sellOrderCount: log.args.sellOrderCount,
            }),
          ),
        );
      },
    });
    const unwatchFill = client.watchContractEvent({
      address: deployments.viewerRegistry,
      abi: VIEWER_REGISTRY_ABI,
      eventName: "FillRegistered",
      onLogs: (rawLogs) => {
        const logs = rawLogs as unknown as DecodedLog<FillRegisteredArgs>[];
        addEvents(
          logs.map(
            (log): DeskTapeEvent => ({
              id: `fill-${log.transactionHash}-${log.logIndex}`,
              kind: "FILL_REGISTERED",
              blockNumber: log.blockNumber ?? 0n,
              blockTimestamp: null,
              transactionHash: log.transactionHash ?? "0x0",
              fillHandle: log.args.fillHandle,
            }),
          ),
        );
      },
    });

    return () => {
      cancelled = true;
      unwatchOrder();
      unwatchOpened();
      unwatchSettled();
      unwatchFill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contract addresses are load-time constants
  }, []);

  return { events, isLoading, error };
}
