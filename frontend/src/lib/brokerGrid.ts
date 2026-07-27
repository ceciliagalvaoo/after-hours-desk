/**
 * The Broker — pixel-art renderer, ported verbatim from the Cloud Design "dc" prototype
 * (`brokerGrid`/`hx`/`mix`/`paint`). A 64x64 grid of hex color cells built procedurally from the
 * chosen {hat, coat, eyes, trim, glow, mood}. Pure + cached: identical looks reuse the same grid.
 *
 * No imported sprite/image asset and no third-party character/IP — every cell is placed in code
 * here, exactly as the original renderer did. The lens/hem `glow` is reserved for desk STATE
 * (grey/phosphor/amber/yellow) and is never user-pickable; `mood` drives the transient reactions
 * (talk/smile/smirk/money/sad).
 */

export type BrokerHat = "fedora" | "trilby" | "newsboy" | "none";
export type BrokerCoat = "trench" | "black" | "pinstripe" | "high";
export type BrokerEyes = "redaction" | "round" | "shades" | "visor";
export type BrokerTrim = "brass" | "phosphor" | "amber" | "steel";
export type BrokerMood = "talkA" | "talkB" | "smile" | "smirk" | "sad" | "money" | "";

export interface BrokerLook {
  hat: BrokerHat;
  coat: BrokerCoat;
  eyes: BrokerEyes;
  trim: BrokerTrim;
  /** Lens + hem accent — desk state color, not user-picked. Defaults to phosphor. */
  glow?: string;
  /** Transient facial/gesture reaction. Empty = neutral. */
  mood?: BrokerMood;
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Grid = (string | null)[][];

const rgbCache: Record<string, [number, number, number]> = {};
const gridCache: Record<string, Grid> = {};

export function hx(h: string): [number, number, number] {
  if (rgbCache[h]) return rgbCache[h];
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const v: [number, number, number] = [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
  rgbCache[h] = v;
  return v;
}

export function mix(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  return (
    "#" +
    [0, 1, 2]
      .map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function brokerGrid(o: BrokerLook): Grid {
  const key = "v6|" + o.hat + "|" + o.coat + "|" + o.eyes + "|" + o.trim + "|" + (o.glow ?? "") + "|" + (o.mood || "");
  if (gridCache[key]) return gridCache[key];

  const G: Grid = Array.from({ length: 64 }, () => Array(64).fill(null));
  const P = (x: number, y: number, c: string) => {
    if (x >= 0 && x < 64 && y >= 0 && y < 64) G[y][x] = c;
  };
  const H = (y: number, a: number, b: number, c: string) => {
    for (let x = a; x <= b; x++) P(x, y, c);
  };
  const R = (a: number, y0: number, b: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) H(y, a, b, c);
  };

  const FACE = "#c9c2b4", FSH = "#a89f8e", FDK = "#8b8477";
  const HAT = "#1c1b21", HATL = "#26252c", HATD = "#131218";
  const COATS: Record<string, { b: string; l: string; c: string }> = {
    trench: { b: "#26262d", l: "#36363f", c: "#4c4c57" },
    black: { b: "#0f0f14", l: "#1b1b21", c: "#2a2a32" },
    pinstripe: { b: "#1b1b21", l: "#3f3f4d", c: "#43434e" },
    high: { b: "#191920", l: "#282830", c: "#55555f" },
  };
  const TRIMS: Record<string, string> = { brass: "#8a7011", phosphor: "#1f6b42", amber: "#7a5410", steel: "#3a3a46" };
  const C = COATS[o.coat] || COATS.trench;
  const trim = TRIMS[o.trim] || TRIMS.brass;
  const glow = o.glow || "#3ddc84";
  const gDim = mix(glow, "#0b0b0f", 0.68), gMid = mix(glow, "#0b0b0f", 0.42), gDark = mix(glow, "#0b0b0f", 0.82);
  const seam = mix(C.b, "#000000", 0.5);

  const body: [number, number, number][] = [];
  for (let y = 42; y <= 63; y++) {
    let a: number, b: number;
    if (y <= 46) {
      a = 24 - (y - 42) * 2;
      b = 39 + (y - 42) * 2;
    } else {
      a = Math.max(0, 16 - (y - 46));
      b = Math.min(63, 47 + (y - 46));
    }
    body.push([y, a, b]);
  }
  const rim = mix(C.l, "#ffffff", 0.3);
  body.forEach(([y, a, b]) => H(y, a, b, C.b));
  const gFaint = mix(glow, "#0b0b0f", 0.88);
  body.forEach(([y, a, b]) => {
    if (y >= 60) for (let x = a; x <= b; x++) if ((x + y) % 4 === 0) P(x, y, gFaint);
  });
  if (o.coat === "pinstripe")
    body.forEach(([y, a, b]) => {
      if (y >= 48) for (let x = a; x <= b; x++) if (x % 5 === 2) P(x, y, C.l);
    });
  body.forEach(([y, a, b]) => {
    P(a, y, rim);
    P(b, y, rim);
    P(a + 1, y, C.l);
    P(b - 1, y, C.l);
  });
  for (let i = 0; i < 10; i++) {
    P(29 - i, 46 + i, C.l);
    P(34 + i, 46 + i, C.l);
  }
  R(31, 47, 32, 63, seam);
  R(26, 49, 27, 50, trim);

  const colRows: [number, number, number][] =
    o.coat === "high"
      ? [[38, 23, 29], [39, 23, 29], [40, 23, 29], [41, 23, 30], [42, 22, 30], [43, 22, 30]]
      : [[41, 23, 28], [42, 22, 29], [43, 22, 29], [44, 21, 30]];
  colRows.forEach(([y, a, b]) => {
    H(y, a, b, C.c);
    H(y, 63 - b, 63 - a, C.c);
  });
  colRows.forEach(([y, a]) => {
    P(a, y, mix(C.c, "#ffffff", 0.12));
    P(63 - a, y, mix(C.c, "#ffffff", 0.12));
  });
  H(62, 0, 63, gMid);
  H(63, 0, 63, glow);

  const face: [number, number, number][] = [];
  for (let y = 19; y <= 41; y++) {
    let a = 21, b = 42;
    if (y >= 38) {
      const t = y - 37;
      a = 21 + t * 2;
      b = 42 - t * 2;
    }
    face.push([y, a, b]);
  }
  face.forEach(([y, a, b]) => {
    H(y, a, b, FACE);
    for (let x = 34; x <= b; x++) P(x, y, FSH);
  });
  H(19, 21, 42, FDK);
  H(20, 21, 42, FSH);
  R(30, 32, 33, 35, FSH);
  R(31, 32, 32, 34, FACE);
  P(30, 35, FDK);
  P(33, 35, FDK);
  H(37, 28, 35, FDK);
  H(41, 29, 34, FSH);
  P(27, 40, gDim);
  P(36, 40, gDim);
  P(29, 41, gMid);
  P(34, 41, gMid);
  P(21, 36, gDark);
  P(42, 36, gDark);

  if (o.eyes === "redaction") {
    R(18, 25, 45, 32, "#3a3a46");
    R(19, 26, 44, 31, "#000000");
  } else if (o.eyes === "round") {
    R(21, 25, 30, 32, "#0b0b0f");
    R(33, 25, 42, 32, "#0b0b0f");
    R(22, 26, 29, 31, gDark);
    R(34, 26, 41, 31, gDark);
    R(23, 27, 25, 28, glow);
    R(35, 27, 37, 28, glow);
    H(28, 31, 32, "#0b0b0f");
    H(27, 18, 20, "#0b0b0f");
    H(27, 43, 45, "#0b0b0f");
  } else if (o.eyes === "shades") {
    R(20, 25, 31, 31, "#0b0b0f");
    R(32, 25, 43, 31, "#0b0b0f");
    R(21, 26, 30, 30, gDark);
    R(33, 26, 42, 30, gDark);
    for (let i = 0; i < 4; i++) {
      P(22 + i, 30 - i, glow);
      P(34 + i, 30 - i, glow);
    }
    H(25, 31, 32, "#0b0b0f");
    H(26, 17, 19, "#0b0b0f");
    H(26, 44, 46, "#0b0b0f");
  } else {
    R(18, 25, 45, 31, "#0b0b0f");
    R(20, 27, 43, 29, gDark);
    for (let x = 20; x <= 43; x += 2) P(x, 28, glow);
    H(29, 21, 42, gMid);
  }

  if (o.hat === "fedora") {
    R(25, 4, 38, 5, HAT);
    R(23, 6, 40, 7, HAT);
    R(22, 8, 41, 13, HAT);
    R(29, 4, 34, 7, HATD);
    R(23, 7, 29, 11, HATL);
    R(21, 14, 42, 15, trim);
    H(16, 21, 42, HATD);
    R(7, 17, 56, 18, HAT);
    H(19, 11, 52, HAT);
    H(17, 7, 29, HATL);
    H(19, 11, 52, HATD);
    H(18, 7, 10, HATL);
  } else if (o.hat === "trilby") {
    R(24, 6, 39, 7, HAT);
    R(23, 8, 40, 12, HAT);
    R(29, 6, 34, 8, HATD);
    R(24, 8, 29, 11, HATL);
    R(22, 13, 41, 14, trim);
    H(15, 22, 41, HATD);
    R(13, 15, 50, 16, HAT);
    H(17, 16, 47, HAT);
    H(18, 20, 43, HAT);
    H(15, 13, 27, HATL);
    H(17, 16, 47, HATD);
    H(18, 20, 43, HATD);
  } else if (o.hat === "newsboy") {
    R(22, 6, 41, 7, HAT);
    R(20, 8, 43, 14, HAT);
    R(22, 6, 32, 10, HATL);
    P(31, 5, HAT);
    P(32, 5, HAT);
    R(20, 12, 23, 14, trim);
    R(17, 15, 46, 16, HATD);
    H(17, 20, 43, HATD);
    H(18, 24, 39, HATD);
  } else {
    R(21, 14, 42, 18, HAT);
    H(14, 24, 39, HATL);
    H(15, 22, 35, HATL);
    H(19, 21, 42, HATD);
    R(20, 15, 22, 17, HAT);
    R(41, 15, 43, 17, HAT);
  }

  if (o.mood === "smile" || o.mood === "smirk" || o.mood === "sad") {
    for (let y = 36; y <= 38; y++)
      for (let x = 27; x <= 36; x++) {
        if (G[y][x] === FDK) G[y][x] = x < 34 ? FACE : FSH;
      }
    if (o.mood === "smile") {
      P(28, 36, FDK);
      P(35, 36, FDK);
      P(29, 37, FDK);
      P(34, 37, FDK);
      H(38, 30, 33, FDK);
    } else if (o.mood === "sad") {
      H(36, 30, 33, FDK);
      P(29, 37, FDK);
      P(34, 37, FDK);
      P(28, 38, FDK);
      P(35, 38, FDK);
      P(24, 33, FSH);
    } else {
      H(37, 28, 33, FDK);
      P(34, 36, FDK);
      P(35, 36, FDK);
    }
  }
  if (o.mood === "talkA" || o.mood === "talkB") {
    for (let y = 36; y <= 38; y++)
      for (let x = 27; x <= 36; x++) {
        if (G[y][x] === FDK) G[y][x] = x < 34 ? FACE : FSH;
      }
    if (o.mood === "talkA") {
      R(30, 37, 33, 38, "#3d382f");
      H(36, 30, 33, FDK);
    } else {
      H(37, 29, 34, FDK);
    }
    const hy = o.mood === "talkA" ? 41 : 45;
    R(46, hy, 49, hy + 2, FACE);
    P(45, hy + 1, FSH);
    P(50, hy + 1, FSH);
    R(46, hy + 3, 48, hy + 5, C.l);
  }
  if (o.mood === "money") {
    R(18, 25, 45, 32, "#3a3a46");
    R(19, 26, 44, 31, "#000000");
    const D = ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."];
    ([[23, 25], [36, 25]] as [number, number][]).forEach(([x0, y0]) => {
      D.forEach((row, ry) => {
        for (let cx = 0; cx < 5; cx++) if (row[cx] === "#") P(x0 + cx, y0 + ry, "#f5c518");
      });
    });
  }

  gridCache[key] = G;
  return G;
}

/**
 * Paint a look (optionally cropped) into a canvas at 1px-per-cell, then let CSS scale it up with
 * `image-rendering: pixelated`. Mirrors the prototype's `paint()`.
 */
export function paintBroker(canvas: HTMLCanvasElement | null, look: BrokerLook, crop?: Crop | null): void {
  if (!canvas) return;
  const G = brokerGrid(look);
  const c = crop || { x: 0, y: 0, w: 64, h: 64 };
  if (canvas.width !== c.w) canvas.width = c.w;
  if (canvas.height !== c.h) canvas.height = c.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(c.w, c.h);
  const d = img.data;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const row = G[y + c.y];
      const col = row && row[x + c.x];
      const i = (y * c.w + x) * 4;
      if (col) {
        const v = hx(col);
        d[i] = v[0];
        d[i + 1] = v[1];
        d[i + 2] = v[2];
        d[i + 3] = 255;
      }
    }
  ctx.putImageData(img, 0, 0);
}

/** Desk-state → accent color + label, mirroring the prototype's STATES map. */
export const BROKER_STATES = {
  loading: { c: "#a89f8e", label: "Office closed" },
  ready: { c: "#3ddc84", label: "Desk open" },
  order: { c: "#ffb020", label: "Matching…" },
  audit: { c: "#f5c518", label: "Auditing…" },
} as const;

export type BrokerDeskState = keyof typeof BROKER_STATES;

/** Preset looks used for the four named personas (identity randomize / Q&A alternates). */
export const BROKER_PRESETS: BrokerLook[] = [
  { hat: "fedora", coat: "black", eyes: "redaction", trim: "brass" },
  { hat: "trilby", coat: "trench", eyes: "shades", trim: "phosphor" },
  { hat: "newsboy", coat: "pinstripe", eyes: "round", trim: "amber" },
  { hat: "none", coat: "high", eyes: "visor", trim: "steel" },
  { hat: "fedora", coat: "trench", eyes: "redaction", trim: "amber" },
];
