/**
 * Day-1 spike point 4 (feedback.md, "[Fase 0] Spike 4/4"): the current Nox
 * deployment runs a SINGLE Runner, processing jobs sequentially, and every
 * `Nox.mint`/`transfer`/`burn` etc. only emits an event on-chain — the
 * resulting handle's ciphertext is computed asynchronously afterwards
 * (Ingestor polls real blocks -> NATS -> Runner -> Handle Gateway). On real
 * Sepolia (real ~12s block times, real network hops), this is slower and
 * less predictable than the local Docker stack's ~4s empirical measurement.
 * Never assume synchronous confirmation right after a transaction — poll.
 */
export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  label?: string;
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  { attempts = 30, delayMs = 5000, label = "operation" }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(
        `[poll] ${label} not ready yet (attempt ${attempt}/${attempts}), ` +
          `retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`[poll] ${label} did not succeed after ${attempts} attempts`, {
    cause: lastError,
  });
}
