import { useEffect, useRef, useState } from "react";
import { useScreen } from "../state/ScreenContext";
import { useTour } from "../state/TourContext";
import { useAppState } from "../state/AppStateContext";
import { deskGlow } from "../lib/deskState";
import { BrokerCanvas, CROP_HEAD } from "../components/mascot/BrokerCanvas";
import type { BrokerLook } from "../lib/brokerGrid";

const QA1 =
  "You can prove the trade happened. Anyone can. What you traded never prints anywhere. Two keys open a fill: yours and the auditor’s. You hold neither.";
const QA2 =
  "Your seat at the table. A pixel persona shown beside your orders and in the auditor’s log. Cosmetic by design: it never touches an order, a key, or a fill.";

const LOOK_Q1: BrokerLook = { hat: "fedora", coat: "black", eyes: "redaction", trim: "brass" };
const LOOK_Q2: BrokerLook = { hat: "trilby", coat: "trench", eyes: "round", trim: "phosphor" };

const mono13: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 13.5, color: "var(--tx)" };

const MECH = [
  { n: "01", eyebrow: "Encrypt", color: "var(--ph)", t: "The figure never leaves the browser.",
    body: <>{" "}<code style={mono13}>encryptInput</code> seals it client-side. What gets signed is a{" "}
      <code style={mono13}>{"{handle, handleProof}"}</code> pair. Plaintext exists in exactly one place: your machine.</> },
  { n: "02", eyebrow: "Match", color: "var(--am)", t: "A TEE crosses the book in the dark.",
    body: <>Orders rest in a batch nobody can read. A single TEE runner computes the crossing off-chain. The operator can’t peek, the chain can’t leak, front-running has nothing to see.</> },
  { n: "03", eyebrow: "Settle", color: "var(--ak)", t: "Proof for everyone. Numbers for no one.",
    body: <><code style={mono13}>settleBatch()</code> is permissionless. Anyone can pull the trigger. Settlement lands on Sepolia; your fill stays sealed behind an on-chain ACL. Two keys exist: yours, and compliance.</> },
];

export function IntroScreen() {
  const { go } = useScreen();
  const tour = useTour();
  const { state } = useAppState();
  const glow = deskGlow(state);

  const [qa, setQa] = useState<"q1" | "q2">("q1");
  const answerRef = useRef<HTMLDivElement | null>(null);
  const mechRef = useRef<HTMLDivElement | null>(null);
  const typedOnce = useRef(false);
  const typeTimer = useRef<number | undefined>(undefined);

  const startTour = () => {
    go("desk");
    tour.start();
  };

  function typeInto(text: string) {
    const el = answerRef.current;
    if (!el) return;
    if (typeTimer.current) window.clearTimeout(typeTimer.current);
    let i = 0;
    const step = () => {
      i++;
      el.textContent = text.slice(0, i) + (i < text.length ? "▌" : "");
      if (i < text.length) typeTimer.current = window.setTimeout(step, 20);
    };
    step();
  }

  // Scroll reveals for the mechanism steps, and first-visible typing for the Q&A.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.style.opacity = "1";
          el.style.transform = "none";
          const tp = el.querySelector<HTMLElement>("[data-mech-tape]");
          if (tp) {
            tp.style.transform = "translateX(135%)";
            tp.style.opacity = "0";
          }
        }),
      { threshold: 0.3 },
    );
    mechRef.current?.querySelectorAll("[data-mech-step]").forEach((el) => io.observe(el));

    const ioq = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting && !typedOnce.current) {
            typedOnce.current = true;
            typeInto(qa === "q1" ? QA1 : QA2);
          }
        }),
      { threshold: 0.35 },
    );
    const qaEl = document.getElementById("intro-qa");
    if (qaEl) ioq.observe(qaEl);

    return () => {
      io.disconnect();
      ioq.disconnect();
      if (typeTimer.current) window.clearTimeout(typeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- observers set once on mount
  }, []);

  // Re-type when the question changes (only after the section was first revealed).
  useEffect(() => {
    if (typedOnce.current) typeInto(qa === "q1" ? QA1 : QA2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qa]);

  const navLink: React.CSSProperties = {
    cursor: "pointer",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    color: "var(--dm)",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--tx)" }}>
      {/* Sticky glass nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "13px 32px", background: "var(--gl)", backdropFilter: "blur(18px) saturate(150%)", WebkitBackdropFilter: "blur(18px) saturate(150%)", borderBottom: "1px solid var(--bs)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <BrokerCanvas look={LOOK_Q1} glow={glow} crop={CROP_HEAD} width={26} height={29} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--tx)" }}>After Hours Desk</span>
        </div>
        <div className="ahd-intro-navlinks" style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <span style={navLink} onClick={() => go("desk")}>The desk</span>
          <span style={navLink} onClick={startTour}>What are we hiding?</span>
          <span style={navLink} onClick={() => go("identity")}>The Broker</span>
        </div>
        <button type="button" className="noir-primary" style={{ padding: "9px 18px", fontSize: 13.5 }} onClick={() => go("desk")}>Open the desk</button>
      </div>

      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--bs)", background: "var(--bg)" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(58% 42% at 50% 0%,rgba(245,197,24,.05),transparent 62%),radial-gradient(52% 38% at 50% 100%,rgba(61,220,132,.05),transparent 64%)" }} />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "repeating-linear-gradient(rgba(0,0,0,0) 0 2px,rgba(0,0,0,.18) 2px 3px)", animation: "ahd-flick 5s ease-in-out infinite" }} />

        <div style={{ position: "relative", maxWidth: 1080, margin: "0 auto", padding: "92px 32px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(2.6rem,5.6vw,4.9rem)", lineHeight: 1.05, letterSpacing: "-.03em", fontWeight: 300, color: "var(--tx)" }}>It’s all on-chain.<br /><span style={{ color: "var(--ak)" }}>Except</span> the amount.</h1>
          <p style={{ margin: "20px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--dm)" }}>Provable to everyone. Legible to no one.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap", justifyContent: "center" }}>
            <button type="button" className="noir-primary" onClick={() => go("desk")}>Open the desk</button>
            <button type="button" className="noir-ghost" style={{ color: "var(--tx)" }} onClick={startTour}>What are we hiding?</button>
          </div>
        </div>

        {/* Demo tape (browser-chrome) */}
        <div style={{ position: "relative", maxWidth: 960, margin: "48px auto 0", padding: "0 32px 88px" }}>
          <div style={{ borderRadius: 16, border: "1px solid transparent", background: "linear-gradient(168deg,rgba(28,28,36,.92),rgba(13,13,18,.96))", boxShadow: "0 44px 100px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.12)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <span style={{ display: "inline-flex", gap: 6 }}>
                {[0, 1, 2].map((i) => <i key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(255,255,255,.16)", display: "block" }} />)}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--dm)" }}>After Hours Desk · tape</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ft)" }}>
                <i style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ph)", boxShadow: "0 0 7px var(--ph)", animation: "ahd-dot 2s steps(1) infinite", display: "block" }} />live · preview
              </span>
            </div>
            <HeroTape />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,.08)", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ft)" }}>
              <span>batch #7 · open · 2 resting</span>
              <span>every bar hides a real ciphertext</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mechanism */}
      <div ref={mechRef} style={{ maxWidth: 1400, margin: "0 auto", padding: "110px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".24em", textTransform: "uppercase", color: "var(--ft)" }}>The mechanism</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ft)" }}>scroll ↓</div>
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: "clamp(1.7rem,3vw,2.5rem)", lineHeight: 1.1, letterSpacing: "-.025em", fontWeight: 300, color: "var(--tx)" }}>Three moves. Zero leaks.</h2>

        {MECH.map((m) => (
          <div key={m.n} data-mech-step className="ahd-mech-step" style={{ display: "grid", gap: 44, alignItems: "center", minHeight: "42vh", opacity: 0.45, transform: "translateY(22px)", transition: "opacity .7s ease,transform .7s ease" }}>
            <div style={{ position: "relative", alignSelf: "center", justifySelf: "start" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "clamp(90px,12vw,168px)", fontWeight: 300, lineHeight: 0.85, WebkitTextStroke: "1.5px var(--ft)", color: "transparent", fontVariantNumeric: "tabular-nums" }}>{m.n}</div>
              <div data-mech-tape style={{ position: "absolute", inset: "-6px -12px", background: "repeating-linear-gradient(135deg,#0e0e13,#0e0e13 7px,#1b1b22 7px,#1b1b22 14px)", border: "1px solid var(--bd)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform .9s cubic-bezier(.5,0,.15,1),opacity .9s ease" }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: ".3em", color: "var(--ft)" }}>██████</span>
              </div>
            </div>
            <div style={{ maxWidth: "52ch" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".22em", textTransform: "uppercase", color: m.color, marginBottom: 12 }}>{m.eyebrow}</div>
              <h3 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 300, letterSpacing: "-.02em", color: "var(--tx)" }}>{m.t}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "var(--dm)" }}>{m.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Q&A */}
      <div id="intro-qa" style={{ maxWidth: 1100, margin: "0 auto", padding: "96px 32px 0" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <QaPill active={qa === "q1"} onClick={() => setQa("q1")}>Can’t I prove the amount?</QaPill>
          <QaPill active={qa === "q2"} onClick={() => setQa("q2")}>Who’s the guy in the hat?</QaPill>
        </div>
        <div className="ahd-qa-grid" style={{ display: "grid", gap: 56, alignItems: "center", padding: "56px 0 0" }}>
          <div className="ahd-qa-broker" style={{ justifySelf: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ background: "#08080b", border: "1px solid transparent", borderRadius: 16, padding: "22px 28px" }}>
              <BrokerCanvas look={qa === "q1" ? LOOK_Q1 : LOOK_Q2} glow={glow} talk width={196} height={196} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--ft)" }}>The Broker · answering</span>
          </div>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--ak)", marginBottom: 16 }}>The answer</div>
            <div ref={answerRef} style={{ fontSize: "clamp(1.35rem,2.3vw,1.95rem)", lineHeight: 1.4, fontWeight: 300, color: "var(--tx)", minHeight: "5.6em" }} />
            {qa === "q2" && (
              <button type="button" className="noir-primary" style={{ marginTop: 26, background: "linear-gradient(150deg,rgba(245,197,24,.12),rgba(245,197,24,.03))", color: "var(--ak)", border: "1px solid var(--ad)" }} onClick={() => go("identity")}>Create your Broker</button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ maxWidth: 1336, margin: "96px auto 0", padding: "32px 32px 44px", display: "flex", alignItems: "center", justifyContent: "center", gap: 24, flexWrap: "wrap", fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ft)", borderTop: "1px solid var(--bs)" }}>
        <span>After Hours Desk · built on Nox (iExec)</span>
      </div>
    </div>
  );
}

/**
 * The hero's tape is a SIMULATED live feed — a marketing showcase, not real chain data (the real
 * desk tape, behind "Open the desk", streams genuine on-chain events). New rows arrive on a ~2s
 * tick, sometimes in bursts, always stamped with the current wall-clock time so it always reads as
 * "now", and older rows slide out the bottom of the fixed-height window.
 */
type HeroMood = "smirk" | "money" | "smile" | "talk" | "sad";

interface TapeRowData {
  id: number;
  time: string;
  tag: string;
  tagColor: string;
  desc: React.ReactNode;
  barTitle?: string;
  proven?: boolean;
  mood: HeroMood;
}

const HERO_ADDRS = ["0x7a9f…2b1c", "0x2b8e…9d04", "0x3e44…c3b0", "0x91cd…4f7a", "0x5d20…be13", "0xa10f…77e2", "0xc4b8…1d9f", "0x6f33…0ac5"];
const HERO_TAUNTS = ["What are you looking for here?", "Nice try.", "Still encrypted. Still not for you.", "Rubbing the bar won’t decrypt it.", "Real ciphertext under the bar. Inspect it.", "That’s a live handle, not a placeholder."];
// Rare, real desk failure lines — they drive the Broker's "sad" reaction.
const HERO_VOIDS = ["settle · batch not ready", "operator window lapsed", "no cross · unmatched"];
const HERO_CAPTIONS: Record<HeroMood, string> = {
  smirk: "Sent dark.",
  money: "Batch closed.",
  smile: "Fill’s in.",
  talk: "Book’s moving.",
  sad: "That one missed.",
};
const pickOne = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const heroMoney = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clockAt = (d: Date) => d.toLocaleTimeString("en-GB", { hour12: false });

function HeroTape() {
  const idRef = useRef(0);
  const orderRef = useRef(41);
  const batchRef = useRef(7);

  function make(time: string): TapeRowData {
    const id = ++idRef.current;
    const roll = Math.random();
    if (roll < 0.08) {
      // Rare failure — drives the Broker's sad reaction.
      return { id, time, tag: "VOID", tagColor: "var(--dg)", mood: "sad", desc: pickOne(HERO_VOIDS) };
    }
    if (roll < 0.6) {
      const isBuy = Math.random() < 0.5;
      const o = ++orderRef.current;
      return { id, time, tag: isBuy ? "BUY" : "SELL", tagColor: isBuy ? "var(--ph)" : "var(--am)", mood: "smirk", desc: `order #${o} · ${pickOne(HERO_ADDRS)} · batch ${batchRef.current}`, barTitle: pickOne(HERO_TAUNTS) };
    }
    if (roll < 0.74) {
      const b = Math.max(1, batchRef.current - 1);
      const buy = 1 + Math.floor(Math.random() * 3);
      const sell = 1 + Math.floor(Math.random() * 3);
      if (Math.random() < 0.55) {
        const amt = (5 + Math.floor(Math.random() * 44)) * 250;
        const price = 2400 + Math.random() * 90;
        return { id, time, tag: "MATCH", tagColor: "var(--ak)", mood: "money", proven: true, desc: <>batch {b} · {buy} buy / {sell} sell <span style={{ color: "var(--ph)" }}>· matched {heroMoney(amt)} @ {heroMoney(price)}/WETH</span></> };
      }
      return { id, time, tag: "MATCH", tagColor: "var(--ak)", mood: "money", desc: `batch ${b} · ${buy} buy / ${sell} sell`, barTitle: pickOne(HERO_TAUNTS) };
    }
    if (roll < 0.88) {
      return { id, time, tag: "FILL", tagColor: "var(--ft)", mood: "smile", desc: "fill registered for compliance viewer", barTitle: pickOne(HERO_TAUNTS) };
    }
    batchRef.current += 1;
    return { id, time, tag: "BATCH", tagColor: "var(--ft)", mood: "talk", desc: `batch ${batchRef.current} opened · resting orders sealed` };
  }

  const [rows, setRows] = useState<TapeRowData[]>(() => {
    const now = Date.now();
    const seed: TapeRowData[] = [];
    for (let i = 5; i >= 0; i--) seed.push(make(clockAt(new Date(now - i * 2400))));
    return seed.reverse(); // newest first
  });
  const [notify, setNotify] = useState<{ mood: HeroMood; n: number }>({ mood: "talk", n: 0 });

  useEffect(() => {
    const id = window.setInterval(() => {
      const burst = Math.random() < 0.22 ? 3 : Math.random() < 0.5 ? 2 : 1;
      // Generate outside the state updater so the ref-mutating generator runs exactly once.
      const fresh: TapeRowData[] = [];
      for (let i = 0; i < burst; i++) fresh.push(make(clockAt(new Date())));
      const newest = fresh[fresh.length - 1];
      const ordered = fresh.slice().reverse();
      setRows((prev) => [...ordered, ...prev].slice(0, 7));
      setNotify((p) => ({ mood: newest.mood, n: p.n + 1 }));
    }, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generator refs are stable
  }, []);

  const capColor = notify.mood === "sad" ? "var(--dg)" : notify.mood === "money" ? "var(--ak)" : "var(--ph)";

  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, fontVariantNumeric: "tabular-nums", height: 258, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <DemoRow key={r.id} time={r.time} tag={r.tag} tagColor={r.tagColor} desc={r.desc} barTitle={r.barTitle} proven={r.proven} last={i === rows.length - 1} />
        ))}
      </div>
      {/* The Broker, reacting to the feed at the corner of the desk — a constant persona from
          first view. The GIF swaps with the newest event's mood (money/smile/smirk/talk/sad). */}
      <div className="ahd-hero-notify" style={{ position: "absolute", top: 8, right: 10, zIndex: 6, pointerEvents: "none" }}>
        <div key={notify.n} style={{ animation: "ahd-pop .5s cubic-bezier(.2,1.4,.4,1) both", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRadius: 14, border: "1px solid transparent", background: "linear-gradient(160deg,rgba(26,26,34,.94),rgba(11,11,16,.97))", boxShadow: "0 16px 34px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.1)", padding: "9px 9px 7px" }}>
          <img src={`/broker/the-broker/${notify.mood}.gif`} width={68} height={68} alt="" style={{ imageRendering: "pixelated", display: "block", borderRadius: 8 }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, letterSpacing: ".14em", textTransform: "uppercase", color: capColor }}>{HERO_CAPTIONS[notify.mood]}</span>
        </div>
      </div>
    </div>
  );
}

function DemoRow({ time, tag, tagColor, desc, barTitle, proven, last }: {
  time: string; tag: string; tagColor: string; desc: React.ReactNode; barTitle?: string; proven?: boolean; last?: boolean;
}) {
  return (
    <div className="ahd-demo-row" style={{ display: "grid", gap: 14, alignItems: "center", padding: "12px 20px", borderBottom: last ? "none" : "1px solid rgba(255,255,255,.05)", animation: "ahd-rise .45s ease both" }}>
      <span style={{ color: "var(--ft)", fontSize: 10.5 }}>{time}</span>
      <span style={{ color: tagColor, letterSpacing: ".08em" }}>{tag}</span>
      <span style={{ color: "var(--dm)" }}>{desc}</span>
      {proven ? (
        <span title="This one is public on purpose." style={{ color: "var(--ft)", cursor: "help" }}>✓ proven</span>
      ) : barTitle ? (
        <span title={barTitle} className="noir-censor" style={{ cursor: "help" }}>██████</span>
      ) : (
        <span />
      )}
    </div>
  );
}

function QaPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
      <button type="button" onClick={onClick} style={{ width: "100%", textAlign: "left", fontFamily: "'Space Grotesk','Segoe UI',sans-serif", fontSize: 15.5, letterSpacing: ".01em", borderRadius: 999, border: "1px solid transparent", background: "linear-gradient(150deg,rgba(255,255,255,.07),rgba(255,255,255,.02))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.1)", padding: "16px 26px", color: "var(--tx)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        {children}
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: "var(--ft)" }}>?</span>
      </button>
      {active && <div style={{ position: "absolute", inset: 0, border: "1px solid var(--ak)", borderRadius: 999, background: "rgba(245,197,24,.05)", pointerEvents: "none" }} />}
    </div>
  );
}
