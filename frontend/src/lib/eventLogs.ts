import type { Abi, PublicClient } from "viem";

/**
 * `config/contracts.ts` deliberately types every exported ABI as the broad `Abi` (not a `const`
 * literal) so a single shared type covers every contract in one place. The tradeoff: viem's
 * `getContractEvents`/`watchContractEvent` can only infer a per-event `args` shape from a LITERAL
 * abi type, so against a widened `Abi` they fall back to the base `Log` type (no `args` field at
 * all). Rather than re-type every ABI as a giant literal const (a much larger diff across
 * `config/contracts.ts` and every hook that reads it), every event-log call site in this app
 * narrows explicitly to `DecodedLog<TArgs>` right where it decodes a specific, hand-verified
 * event signature (cross-checked against the compiled artifact ABI printed in this session — see
 * feedback.md, Fase 5). The values themselves are never guessed — only the TypeScript shape is
 * asserted, exactly the same class of cast this codebase already uses for `readContract` results
 * (e.g. `useUniswapPrice.ts`'s `result as bigint`).
 */
export interface DecodedLog<TArgs> {
  address: `0x${string}`;
  blockNumber: bigint | null;
  blockHash: `0x${string}` | null;
  transactionHash: `0x${string}` | null;
  transactionIndex: number | null;
  logIndex: number | null;
  removed: boolean;
  args: TArgs;
}

/**
 * Public Sepolia RPCs cap a single `eth_getLogs` call's block range — confirmed LIVE against
 * `PUBLIC_SEPOLIA_RPC_URL` in this session (`curl` -> `eth_getLogs` with a full-history range
 * returns `{"code":-32701,"message":"exceed maximum block range: 50000"}`). We stay comfortably
 * under that with a 45,000-block window per call. See feedback.md, Fase 5.
 */
const MAX_RANGE_BLOCKS = 45_000n;

/**
 * How far back the tape/order history looks for this hackathon build. There is no subgraph/
 * indexer behind this frontend (out of scope), so "history" is reconstructed live from
 * `eth_getLogs` on every page load, chunked to respect the range cap above.
 *
 * Real, hands-on debugging story (see feedback.md, Fase 5, for the full writeup): a headless-
 * browser smoke test of this exact app surfaced "Archive requests require a personal token" from
 * `eth_getLogs` on the free public RPC originally configured here (publicnode.com). Direct `curl`
 * probing against that endpoint (bisecting range width, and separately testing `toBlock: "latest"`
 * vs. an explicit recent block number) found its free/anonymous tier rejects almost ANY
 * `eth_getLogs` call wider than ~150 blocks (~30 minutes) — nowhere near enough for even this
 * hackathon's own short history — regardless of how "recent" the range is. That is a limit of
 * THAT specific provider's free tier, not a general Sepolia constraint: `PUBLIC_SEPOLIA_RPC_URL`
 * (`config/chain.ts`) was switched to `sepolia.gateway.tenderly.co`, confirmed live to serve a
 * full 30,000-block range correctly against this project's real deployed contracts. 30,000 blocks
 * (~4.2 days at Sepolia's ~12s/block) comfortably covers this project's whole real deployment
 * lifetime (current `AfterHoursDesk` was redeployed as recently as Fase 4) with margin, while
 * staying within `MAX_RANGE_BLOCKS` (a single, non-chunked request per event type).
 */
const MAX_LOOKBACK_BLOCKS = 30_000n;

/**
 * Fetches every historical log for one contract event, paginating backward from the current
 * block in windows that respect the RPC's range cap, stopping at `MAX_LOOKBACK_BLOCKS`. Real
 * on-chain reads only — no synthetic/mocked log objects are ever produced here.
 */
export async function getPastLogsChunked<TArgs = Record<string, unknown>>(
  client: PublicClient,
  params: {
    address: `0x${string}`;
    abi: Abi;
    eventName: string;
    args?: Record<string, unknown>;
  },
): Promise<DecodedLog<TArgs>[]> {
  const latest = await client.getBlockNumber();
  const floor = latest > MAX_LOOKBACK_BLOCKS ? latest - MAX_LOOKBACK_BLOCKS : 0n;

  const allLogs: DecodedLog<TArgs>[] = [];
  let to = latest;
  let isFirstIteration = true;
  // Guard against an unexpected infinite loop (e.g. a clock/RPC inconsistency) — 64 iterations
  // covers ~2.88M blocks at MAX_RANGE_BLOCKS each, far beyond MAX_LOOKBACK_BLOCKS above.
  for (let iterations = 0; iterations < 64 && to > floor; iterations++) {
    const candidateFrom = to > MAX_RANGE_BLOCKS ? to - MAX_RANGE_BLOCKS + 1n : 0n;
    const from = candidateFrom > floor ? candidateFrom : floor;
    // The FIRST (most-recent) window uses the literal "latest" keyword rather than the numeric
    // block we captured a moment ago — a small, harmless freshness improvement (the RPC resolves
    // "latest" itself, at the instant it handles the request, instead of trusting our
    // slightly-stale snapshot). NOTE: this alone did NOT fix the "Archive requests require a
    // personal token" error hit during debugging (see `MAX_LOOKBACK_BLOCKS`'s docstring above) —
    // that provider rejected ~150+-block ranges outright regardless of `toBlock` freshness; the
    // actual fix was switching `PUBLIC_SEPOLIA_RPC_URL` to a provider with a real free-tier range
    // (`config/chain.ts`). Kept anyway as reasonable defensive practice. See feedback.md, Fase 5.
    const toBlockParam = isFirstIteration ? "latest" : to;
    isFirstIteration = false;
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential, respects RPC rate limits
    const logs = await client.getContractEvents({
      address: params.address,
      abi: params.abi,
      eventName: params.eventName,
      args: params.args,
      fromBlock: from,
      toBlock: toBlockParam,
    } as Parameters<PublicClient["getContractEvents"]>[0]);
    allLogs.push(...(logs as unknown as DecodedLog<TArgs>[]));
    if (from === floor || from === 0n) break;
    to = from - 1n;
  }
  return allLogs;
}

/**
 * Resolves real block timestamps (seconds since epoch) for a set of logs, deduplicating by
 * block number so each distinct block is only fetched once. Used to render real "submitted at" /
 * "settled at" style times on the tape without relying on any client-side clock guess.
 */
export async function getBlockTimestamps(
  client: PublicClient,
  blockNumbers: bigint[],
): Promise<Map<bigint, number>> {
  const unique = Array.from(new Set(blockNumbers));
  const result = new Map<bigint, number>();
  // Sequential, not Promise.all — same rate-limit reasoning as getPastLogsChunked above. The
  // tape's history is small for this hackathon's lifetime (a handful of real transactions), so
  // the latency cost of one-at-a-time fetching here is negligible next to not tripping the
  // public RPC's rate limiter.
  for (const blockNumber of unique) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential, respects RPC rate limits
    const block = await client.getBlock({ blockNumber });
    result.set(blockNumber, Number(block.timestamp));
  }
  return result;
}
