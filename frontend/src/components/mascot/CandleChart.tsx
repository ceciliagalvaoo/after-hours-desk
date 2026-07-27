import { useEffect, useRef } from "react";

/**
 * The trailing-reference candle strip on the desk's price panel — a decorative, deterministic
 * (seeded) 42-candle sparkline, ported from the prototype's `paintCandles`. Up candles ride
 * phosphor, down candles ride amber. Illustrative context around the ONE real number (the live
 * Uniswap price shown above it), never presented as live per-candle data.
 */
export function CandleChart() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<{ o: number; c: number; up: boolean }[]>([]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const W = 168, Hh = 42;
    if (el.width !== W) el.width = W;
    if (el.height !== Hh) el.height = Hh;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, Hh);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let p = 0.58;
    const data: { o: number; c: number; up: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const o = p;
      p = Math.min(0.92, Math.max(0.08, p + (rnd() - 0.47) * 0.17));
      const up = p >= o;
      const x = i * 4;
      const yo = Math.round((1 - o) * (Hh - 2)) + 1;
      const yc = Math.round((1 - p) * (Hh - 2)) + 1;
      const top = Math.min(yo, yc);
      const bot = Math.max(yo, yc);
      ctx.fillStyle = up ? "rgba(61,220,132,.38)" : "rgba(255,176,32,.38)";
      const wt = Math.max(0, top - 1 - Math.round(rnd() * 2));
      const wb = Math.min(Hh - 1, bot + 1 + Math.round(rnd() * 2));
      ctx.fillRect(x + 1, wt, 1, wb - wt + 1);
      ctx.fillStyle = up ? "#3ddc84" : "#ffb020";
      ctx.fillRect(x, top, 3, Math.max(1, bot - top));
      data.push({ o, c: p, up });
    }
    dataRef.current = data;
  }, []);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const tip = tipRef.current;
    const data = dataRef.current;
    if (!tip || !data.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(41, Math.floor(((e.clientX - r.left) / r.width) * 42)));
    const d = data[i];
    if (!d) return;
    const px = (v: number) => "$" + (2408 + v * 52).toFixed(2);
    tip.textContent = `h-${42 - i} · open ${px(d.o)} · close ${px(d.c)} · ${d.up ? "▲ up" : "▼ down"}`;
    tip.style.color = d.up ? "#3ddc84" : "#ffb020";
    tip.style.display = "block";
  }

  return (
    <div style={{ position: "relative", background: "var(--plate)", border: "1px solid transparent", borderRadius: 8, padding: "12px 14px 10px" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => { if (tipRef.current) tipRef.current.style.display = "none"; }}
        style={{ display: "block", width: "100%", height: 62, imageRendering: "pixelated", cursor: "crosshair" }}
      />
      <div ref={tipRef} style={{ position: "absolute", top: 6, left: 12, display: "none", pointerEvents: "none", fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".06em", color: "var(--tx)", background: "rgba(8,8,11,.92)", border: "1px solid var(--bd)", borderRadius: 4, padding: "5px 9px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ft)" }}>
        <span>trailing reference · 1h candles</span>
        <span>up · phosphor / down · amber</span>
      </div>
    </div>
  );
}
