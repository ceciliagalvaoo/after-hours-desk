import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** The six guided-tour steps, each keyed to a `data-tour="<k>"` anchor on the desk. */
export interface TourStep {
  k: string;
  t: string;
  b: string;
}

export const TOUR_STEPS: TourStep[] = [
  { k: "ticket", t: "The order ticket", b: "Size gets encrypted right here, before anything is signed. What leaves this panel is a handle and a proof. Never the number." },
  { k: "side", t: "Pick a side", b: "Buy rides phosphor, sell rides amber. The side prints on the public tape; the size never does." },
  { k: "price", t: "Public reference", b: "A live Uniswap price anchors the desk. It is the one number in this room that was never a secret." },
  { k: "depth", t: "Dark depth", b: "The resting book, drawn honestly: it exists, and you cannot read it. Neither can we. Depth stays sealed until match." },
  { k: "tape", t: "The tape", b: "Every order, batch and settlement prints here in real time. Decrypt buttons only work for keys your wallet actually holds." },
  { k: "aud", t: "The auditor panel", b: "Compliance sees fills through an on-chain ACL, not a backdoor. The authorized wallet decrypts; everyone else meets the bar." },
];

interface TourContextValue {
  step: number; // -1 = closed
  isOpen: boolean;
  start: () => void;
  end: () => void;
  next: () => void;
  back: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(-1);
  const value = useMemo<TourContextValue>(
    () => ({
      step,
      isOpen: step >= 0,
      start: () => setStep(0),
      end: () => setStep(-1),
      back: () => setStep((s) => Math.max(0, s - 1)),
      next: () => setStep((s) => (s >= TOUR_STEPS.length - 1 ? -1 : s + 1)),
    }),
    [step],
  );
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
