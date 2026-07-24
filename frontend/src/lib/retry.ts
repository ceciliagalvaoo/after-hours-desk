/**
 * App-level retry/backoff for decrypt calls made right after a `settleBatch()`/`submitOrder()`
 * tx is mined. Mirrors `scripts/utils/retry.ts`'s reasoning (Day-1 spike 4, feedback.md): every
 * Nox primitive is its own async off-chain job (Ingestor -> NATS -> single Runner -> Handle
 * Gateway), and `@iexec-nox/handle`'s OWN internal retry ceiling
 * (`RESOLVE_MAX_RETRIES=60 x RESOLVE_DELAY_MS=100ms` = 6s, see `nox-hardhat-plugin`'s
 * `nox-config.ts`) is tuned for a single primitive, not a real `settleBatch()` batch — which
 * chains ~10-12+ sequential primitives even for the simplest 1-buy/1-sell case (safeAdd x2,
 * lt+select, safeMul/safeDiv/safeSub x2 per order, plus the transfer/registerFill primitives
 * underneath). A judge clicking "decrypt" right after seeing "MATCH FILLED" can easily hit that
 * 6s ceiling before the fill has actually resolved — this wraps every post-settlement decrypt in
 * a longer, UI-visible retry loop instead of surfacing that as a hard failure (hackathon-watchdog
 * review, Fase 5 — see feedback.md).
 */
export interface RetryProgress {
  attempt: number;
  maxAttempts: number;
}

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  onProgress?: (progress: RetryProgress) => void;
}

/**
 * Retries `fn` on ANY rejection until it resolves or `maxAttempts` is exhausted. Deliberately
 * does not distinguish "not ready yet" from "not authorized" errors — the Nox SDK's decrypt
 * throws a plain Error either way, and re-throwing the LAST real error after exhausting retries
 * (rather than a generic timeout message) preserves whatever authorization detail it carried, so
 * a genuine ACL rejection still surfaces correctly to the caller once retries run out.
 */
export async function decryptWithRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 15, delayMs = 3_000, onProgress }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.({ attempt, maxAttempts });
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Handle did not resolve after ${maxAttempts} attempts.`);
}
