import { useEffect, useState } from "react";
import { getPublicClient } from "../lib/viemClients";
import { deployments, UNISWAP_V3_PRICE_READER_ABI } from "../config/contracts";

const POLL_INTERVAL_MS = 15_000;

/**
 * Public-reference price strip data source — a plain `view` read against
 * `UniswapV3PriceReader.getReferencePrice()` (itself a read-only adapter over
 * the REAL, live, verified WETH/USDC Uniswap V3 pool on Sepolia — see
 * feedback.md, Fase 4). No wallet connection required: this is exactly the
 * "public AMM reference, in contrast with the redacted dark-pool values"
 * strip the brief asks for.
 */
export function useUniswapPrice(): {
  price: bigint | null;
  lastUpdated: Date | null;
  error: string | null;
  isLoading: boolean;
} {
  const [price, setPrice] = useState<bigint | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const client = getPublicClient();

    async function poll() {
      try {
        const result = await client.readContract({
          address: deployments.priceOracle,
          abi: UNISWAP_V3_PRICE_READER_ABI,
          functionName: "getReferencePrice",
        });
        if (!cancelled) {
          setPrice(result as bigint);
          setLastUpdated(new Date());
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { price, lastUpdated, error, isLoading };
}
