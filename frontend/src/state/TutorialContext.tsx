import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const SEEN_KEY = "ahd:tutorial-seen-v1";

interface TutorialContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

/** Shows the "how it works" tutorial automatically on first visit (per-browser, via
 * localStorage), and exposes `open()` so Header's "How it works" button can reopen it any time
 * without prop-drilling through the whole layout tree. */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) {
      setIsOpen(true);
    }
  }, []);

  const value = useMemo<TutorialContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => {
        setIsOpen(false);
        localStorage.setItem(SEEN_KEY, "1");
      },
    }),
    [isOpen],
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within a TutorialProvider");
  return ctx;
}
