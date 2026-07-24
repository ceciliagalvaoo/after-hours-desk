import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * The desk's top-level state machine (see project brief / brand-spec):
 *
 *   LOADING   -> pre-connect "office closing" pixel loop (timer-driven ONLY
 *                because there is, by definition, no async wallet event yet
 *                to drive it).
 *   READY     -> the active desk (order ticket, tape, price strip, auditor
 *                entry point) — entered the instant the wallet actually
 *                connects on the right chain (a real event: `eth_accounts`/
 *                `eth_requestAccounts` resolving), never a timer.
 *   ON_ORDER  -> entered when a real order-ticket submission is in flight
 *                (encryptInput -> submitOrder tx sent) and held until that
 *                tx is mined/confirmed (or a subsequent settle+fill reveal
 *                completes) — driven by tx-receipt promises, not timers.
 *   ON_AUDIT  -> entered when the auditor panel issues a real viewACL/decrypt
 *                call, held until that promise resolves or rejects.
 *
 * `detail` carries a short, human-readable reason for the current state,
 * surfaced by `StateBadge` — always describing a REAL in-flight operation
 * (a tx hash, an order id, a handle) rather than a generic spinner label.
 */
export type DeskAppState = "LOADING" | "READY" | "ON_ORDER" | "ON_AUDIT";

interface AppStateContextValue {
  state: DeskAppState;
  detail: string | null;
  enterReady: () => void;
  enterOrderFlow: (detail: string) => void;
  enterAuditFlow: (detail: string) => void;
  exitToReady: (detail?: string) => void;
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DeskAppState>("LOADING");
  const [detail, setDetail] = useState<string | null>(null);

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      detail,
      enterReady: () => {
        setState("READY");
        setDetail(null);
      },
      enterOrderFlow: (d: string) => {
        setState("ON_ORDER");
        setDetail(d);
      },
      enterAuditFlow: (d: string) => {
        setState("ON_AUDIT");
        setDetail(d);
      },
      exitToReady: (d?: string) => {
        setState("READY");
        setDetail(d ?? null);
      },
    }),
    [state, detail],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within an AppStateProvider");
  return ctx;
}
