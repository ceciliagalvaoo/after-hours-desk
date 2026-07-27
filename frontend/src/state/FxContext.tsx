import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BrokerMood } from "../lib/brokerGrid";

/**
 * The Broker's transient reaction toast — a full-screen pixel-persona pop (mood + one dry line)
 * fired by real desk actions (order sent, batch settled, fill decrypted). Auto-dismisses; clicking
 * anywhere closes it early. Ported from the prototype's `fxShow`.
 */
export interface Fx {
  mood: BrokerMood;
  title: string;
  sub: string;
}

interface FxContextValue {
  fx: Fx | null;
  show: (mood: BrokerMood, title: string, sub: string) => void;
  close: () => void;
}

const FxContext = createContext<FxContextValue | undefined>(undefined);

export function FxProvider({ children }: { children: ReactNode }) {
  const [fx, setFx] = useState<Fx | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const close = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setFx(null);
  }, []);

  const show = useCallback((mood: BrokerMood, title: string, sub: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setFx({ mood, title, sub });
    timer.current = window.setTimeout(() => setFx(null), 2400);
  }, []);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const value = useMemo<FxContextValue>(() => ({ fx, show, close }), [fx, show, close]);
  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}

export function useFx(): FxContextValue {
  const ctx = useContext(FxContext);
  if (!ctx) throw new Error("useFx must be used within an FxProvider");
  return ctx;
}
