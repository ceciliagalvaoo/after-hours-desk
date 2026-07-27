import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BrokerLook,
  BrokerHat,
  BrokerCoat,
  BrokerEyes,
  BrokerTrim,
} from "../lib/brokerGrid";

/**
 * The player's cosmetic Broker persona + desk alias. Purely presentational: it is shown next to
 * orders and in the auditor log, and NEVER touches an order, a key, or a fill (the redesign brief's
 * hard rule). Persisted to localStorage so it survives reloads; the lens/hem `glow` is intentionally
 * NOT stored here — that is desk state, applied at render time, never user-picked.
 */
export interface Identity {
  hat: BrokerHat;
  coat: BrokerCoat;
  eyes: BrokerEyes;
  trim: BrokerTrim;
  alias: string;
}

const DEFAULT_IDENTITY: Identity = {
  hat: "fedora",
  coat: "black",
  eyes: "redaction",
  trim: "brass",
  alias: "BROKER-7A9F",
};

const STORAGE_KEY = "ahd.identity.v1";

const HATS: BrokerHat[] = ["fedora", "trilby", "newsboy", "none"];
const COATS: BrokerCoat[] = ["trench", "black", "pinstripe", "high"];
const EYES: BrokerEyes[] = ["redaction", "round", "shades", "visor"];
const TRIMS: BrokerTrim[] = ["brass", "phosphor", "amber", "steel"];

function load(): Identity {
  if (typeof window === "undefined") return DEFAULT_IDENTITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_IDENTITY;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    return { ...DEFAULT_IDENTITY, ...parsed };
  } catch {
    return DEFAULT_IDENTITY;
  }
}

interface IdentityContextValue {
  identity: Identity;
  /** The look subset (no alias) for feeding BrokerCanvas. */
  look: BrokerLook;
  setPart: <K extends keyof Identity>(field: K, value: Identity[K]) => void;
  setAlias: (alias: string) => void;
  randomize: () => void;
}

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined);

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
      /* storage unavailable — cosmetic only, safe to ignore */
    }
  }, [identity]);

  const value = useMemo<IdentityContextValue>(() => {
    const { hat, coat, eyes, trim } = identity;
    return {
      identity,
      look: { hat, coat, eyes, trim },
      setPart: (field, v) => setIdentity((prev) => ({ ...prev, [field]: v })),
      setAlias: (alias) => setIdentity((prev) => ({ ...prev, alias: alias.toUpperCase().slice(0, 18) })),
      randomize: () =>
        setIdentity((prev) => ({
          ...prev,
          hat: pick(HATS),
          coat: pick(COATS),
          eyes: pick(EYES),
          trim: pick(TRIMS),
        })),
    };
  }, [identity]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used within an IdentityProvider");
  return ctx;
}

export const IDENTITY_OPTIONS = {
  hat: [
    ["fedora", "Fedora"],
    ["trilby", "Trilby"],
    ["newsboy", "Newsboy"],
    ["none", "Bare"],
  ],
  coat: [
    ["trench", "Trench"],
    ["black", "Black"],
    ["pinstripe", "Pinstripe"],
    ["high", "High collar"],
  ],
  eyes: [
    ["redaction", "Redaction"],
    ["round", "Round"],
    ["shades", "Shades"],
    ["visor", "Visor"],
  ],
  trim: [
    ["brass", "Brass"],
    ["phosphor", "Phosphor"],
    ["amber", "Amber"],
    ["steel", "Steel"],
  ],
} as const;
