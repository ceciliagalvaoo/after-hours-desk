import { motion } from "framer-motion";
import type { DeskAppState } from "../../state/AppStateContext";
import styles from "./Broker.module.css";

/**
 * "The Broker" — a 100%-original noir pixel detective mascot, built entirely from procedurally
 * placed `<rect>` cells (no imported sprite/image asset, no third-party character/IP of any
 * kind). Silhouette: fedora + hatband, glasses with a state-tinted lens glow, trenchcoat, and a
 * thin "terminal glow" trim line along the coat hem — deliberately minimal/blocky ("mature
 * pixel, not cute pixel") rather than a fully rendered character, per the aesthetic brief's
 * warning against anything reading as a cartoon mascot.
 */

const CELL = 8; // px per grid cell
const COLS = 20;
const ROWS = 22;

interface PixelRect {
  x: number;
  y: number;
  w: number;
  fill: string;
}

const PALETTE = {
  hatCrown: "#1c1b21",
  hatBrim: "#232228",
  hatBand: "#3a3018",
  face: "#c9c2b4",
  faceShadow: "#a89f8e",
  glassFrame: "#0b0b0f",
  shirt: "#3a3a42",
  coat: "#17171c",
  coatShadow: "#101014",
} as const;

const STATIC_PIXELS: PixelRect[] = [
  // Hat crown
  { x: 7, y: 0, w: 6, fill: PALETTE.hatCrown },
  { x: 6, y: 1, w: 8, fill: PALETTE.hatCrown },
  // Hatband (accent-free, always neutral gold-brown regardless of state)
  { x: 5, y: 2, w: 10, fill: PALETTE.hatBand },
  // Brim
  { x: 2, y: 3, w: 16, fill: PALETTE.hatBrim },
  { x: 3, y: 4, w: 14, fill: PALETTE.hatCrown },
  // Forehead
  { x: 6, y: 5, w: 8, fill: PALETTE.face },
  { x: 6, y: 6, w: 8, fill: PALETTE.face },
  { x: 6, y: 7, w: 8, fill: PALETTE.face },
  // Glasses row is rendered separately (lens color depends on state)
  { x: 6, y: 8, w: 1, fill: PALETTE.glassFrame },
  { x: 8, y: 8, w: 1, fill: PALETTE.glassFrame },
  { x: 9, y: 8, w: 1, fill: PALETTE.faceShadow },
  { x: 10, y: 8, w: 1, fill: PALETTE.glassFrame },
  { x: 12, y: 8, w: 1, fill: PALETTE.glassFrame },
  { x: 13, y: 8, w: 1, fill: PALETTE.face },
  // Nose / cheeks
  { x: 6, y: 9, w: 8, fill: PALETTE.face },
  { x: 9, y: 9, w: 2, fill: PALETTE.faceShadow },
  // Mouth (neutral, noir-flat expression)
  { x: 6, y: 10, w: 8, fill: PALETTE.face },
  { x: 8, y: 10, w: 4, fill: PALETTE.faceShadow },
  { x: 6, y: 11, w: 8, fill: PALETTE.face },
  // Collar
  { x: 7, y: 12, w: 6, fill: PALETTE.shirt },
  // Coat, widening toward the hem
  { x: 4, y: 13, w: 12, fill: PALETTE.coat },
  { x: 3, y: 14, w: 14, fill: PALETTE.coat },
  { x: 2, y: 15, w: 16, fill: PALETTE.coat },
  { x: 9, y: 15, w: 2, fill: PALETTE.shirt },
  { x: 2, y: 16, w: 16, fill: PALETTE.coat },
  { x: 1, y: 17, w: 18, fill: PALETTE.coat },
  { x: 1, y: 18, w: 18, fill: PALETTE.coatShadow },
  { x: 0, y: 19, w: 20, fill: PALETTE.coat },
  { x: 0, y: 20, w: 20, fill: PALETTE.coatShadow },
];

const LENS_LEFT: PixelRect = { x: 7, y: 8, w: 1, fill: "" };
const LENS_RIGHT: PixelRect = { x: 11, y: 8, w: 1, fill: "" };
const HEM_GLOW: PixelRect = { x: 0, y: 21, w: 20, fill: "" };

const STATE_ACCENT: Record<DeskAppState, string> = {
  LOADING: PALETTE.faceShadow,
  READY: "#3ddc84",
  ON_ORDER: "#ffb020",
  ON_AUDIT: "#f5c518",
};

const STATE_CAPTION: Record<DeskAppState, string> = {
  LOADING: "OFFICE CLOSED",
  READY: "DESK OPEN",
  ON_ORDER: "MATCHING…",
  ON_AUDIT: "AUDITING…",
};

export function Broker({
  state,
  caption,
  compact,
}: {
  state: DeskAppState;
  caption?: string;
  compact?: boolean;
}) {
  const accent = STATE_ACCENT[state];
  const isLoading = state === "LOADING";

  return (
    <div className={compact ? `${styles.wrap} ${styles.wrapCompact}` : styles.wrap}>
      <motion.svg
        className={styles.svg}
        viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
        width={COLS * CELL}
        height={ROWS * CELL}
        role="img"
        aria-label={`The Broker — desk mascot, currently ${STATE_CAPTION[state]}`}
        animate={
          state === "ON_ORDER"
            ? { x: [0, 1, 0], y: [0, -1, 0] }
            : { x: 0, y: 0 }
        }
        transition={{ duration: 0.6, repeat: state === "ON_ORDER" ? Infinity : 0 }}
      >
        {STATIC_PIXELS.map((p, i) => (
          <rect key={i} x={p.x * CELL} y={p.y * CELL} width={p.w * CELL} height={CELL} fill={p.fill} />
        ))}

        {/* Lenses — the one part of the mascot that visibly reacts to app state */}
        <motion.rect
          x={LENS_LEFT.x * CELL}
          y={LENS_LEFT.y * CELL}
          width={LENS_LEFT.w * CELL}
          height={CELL}
          fill={accent}
          animate={
            isLoading
              ? { opacity: [1, 0.15, 1] }
              : { opacity: [0.75, 1, 0.75] }
          }
          transition={{ duration: isLoading ? 2.2 : 3.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.rect
          x={LENS_RIGHT.x * CELL}
          y={LENS_RIGHT.y * CELL}
          width={LENS_RIGHT.w * CELL}
          height={CELL}
          fill={accent}
          animate={
            isLoading
              ? { opacity: [1, 0.15, 1] }
              : { opacity: [0.75, 1, 0.75] }
          }
          transition={{ duration: isLoading ? 2.2 : 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
        />

        {/* Terminal-glow hem trim — restrained, contained motion only (no particles) */}
        <motion.rect
          x={HEM_GLOW.x * CELL}
          y={HEM_GLOW.y * CELL}
          width={HEM_GLOW.w * CELL}
          height={CELL / 2}
          fill={accent}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.svg>
      <div className={`${styles.caption} mono`}>{caption ?? STATE_CAPTION[state]}</div>
    </div>
  );
}
