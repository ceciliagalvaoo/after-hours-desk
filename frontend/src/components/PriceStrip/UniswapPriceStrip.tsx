import { useUniswapPrice } from "../../hooks/useUniswapPrice";
import { formatUsdc } from "../../lib/format";
import styles from "./UniswapPriceStrip.module.css";

/**
 * Explicitly-labeled PUBLIC reference data — deliberate visual contrast (phosphor-green,
 * unredacted) against the dark-pool's own redacted (`███`) trade values elsewhere on screen. This
 * number is a live `view` read against `UniswapV3PriceReader.getReferencePrice()`, itself a
 * read-only adapter over a real, verified WETH/USDC Uniswap V3 pool on Ethereum Sepolia (see
 * `feedback.md`, Fase 4 — real liquidity confirmed on-chain before this was wired, not assumed).
 */
export function UniswapPriceStrip() {
  const { price, lastUpdated, error, isLoading } = useUniswapPrice();

  return (
    <div className={`${styles.strip} ahd-panel`}>
      <div className={styles.left}>
        <span className={styles.tag}>Public reference · not a dark-pool value</span>
        <span className={styles.pair}>Uniswap V3 · WETH / USDC · Sepolia</span>
      </div>
      {error ? (
        <span className={styles.error}>Price read failed: {error}</span>
      ) : (
        <span className={`${styles.price} mono`}>
          {isLoading && price === null ? "reading…" : price !== null ? `$${formatUsdc(price)}` : "—"}
        </span>
      )}
      <span className={styles.meta}>
        {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString(undefined, { hour12: false })}` : "polling…"}
      </span>
    </div>
  );
}
