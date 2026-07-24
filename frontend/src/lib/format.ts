import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "../config/contracts";

/** Formats a raw 6-decimal on-chain integer (mUSDC/cUSDC/price convention)
 * into a human decimal string, e.g. 6_000_000n -> "6.000000". */
export function formatUsdc(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

/** Parses a human-entered decimal string into the raw 6-decimal integer used
 * on-chain. Throws on malformed input — callers must surface that as a real
 * validation error, never silently clamp to 0. */
export function parseUsdc(input: string): bigint {
  return parseUnits(input, USDC_DECIMALS);
}

export function shortAddress(address: string | undefined | null): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHandle(handle: string | undefined | null): string {
  if (!handle) return "—";
  return `${handle.slice(0, 10)}…${handle.slice(-6)}`;
}

export function isNullHandle(handle: string | undefined | null): boolean {
  if (!handle) return true;
  return /^0x0+$/.test(handle);
}

export function formatTimestamp(unixSeconds: number | bigint): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString(undefined, {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
