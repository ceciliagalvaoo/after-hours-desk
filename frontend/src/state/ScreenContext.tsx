import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Top-level screen router for the redesigned app. The desk itself (the only screen that touches
 * real web3) is `desk`; `intro` is the marketing landing and `identity` is the cosmetic Broker
 * creator. Kept deliberately tiny — no URL routing library, this is a single-page prototype-grade
 * switch, first shown on load at `intro`.
 */
export type Screen = "intro" | "identity" | "desk";

interface ScreenContextValue {
  screen: Screen;
  go: (screen: Screen) => void;
}

const ScreenContext = createContext<ScreenContextValue | undefined>(undefined);

export function ScreenProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("intro");
  const value = useMemo<ScreenContextValue>(
    () => ({
      screen,
      go: (s) => {
        setScreen(s);
        // Each screen is a full page; always start it at the top.
        if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      },
    }),
    [screen],
  );
  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}

export function useScreen(): ScreenContextValue {
  const ctx = useContext(ScreenContext);
  if (!ctx) throw new Error("useScreen must be used within a ScreenProvider");
  return ctx;
}
