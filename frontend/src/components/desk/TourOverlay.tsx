import { useEffect, useLayoutEffect, useRef } from "react";
import { useTour, TOUR_STEPS } from "../../state/TourContext";

/**
 * Guided tour: a moving spotlight ring (dims the rest of the page via a huge box-shadow) plus a
 * glass tooltip, both positioned over the current step's `data-tour="<k>"` anchor. Ported from the
 * prototype's `placeTour`. Repositions on step change, scroll, and resize.
 */
export function TourOverlay() {
  const { step, isOpen, end, next, back } = useTour();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const place = (scrollTo: boolean) => {
    if (step < 0) return;
    const s = TOUR_STEPS[step];
    const el = document.querySelector<HTMLElement>(`[data-tour="${s.k}"]`);
    const box = boxRef.current;
    const tip = tipRef.current;
    if (!el || !box || !tip) return;
    const run = () => {
      const r = el.getBoundingClientRect();
      box.style.opacity = "1";
      box.style.left = r.left - 8 + "px";
      box.style.top = r.top - 8 + "px";
      box.style.width = r.width + 16 + "px";
      box.style.height = r.height + 16 + "px";
      const tw = Math.min(360, window.innerWidth - 32);
      const th = tip.offsetHeight || 220;
      let tl = r.right + 22;
      let tt = Math.max(16, r.top);
      if (tl + tw > window.innerWidth - 16) {
        tl = Math.max(16, Math.min(r.left, window.innerWidth - tw - 16));
        tt = r.bottom + th + 24 < window.innerHeight ? r.bottom + 18 : Math.max(16, r.top - th - 18);
      }
      if (tt + th > window.innerHeight - 12) tt = Math.max(12, window.innerHeight - th - 12);
      tip.style.left = tl + "px";
      tip.style.top = tt + "px";
    };
    if (scrollTo) {
      const r = el.getBoundingClientRect();
      const y = window.scrollY + r.top - Math.max(84, (window.innerHeight - r.height) / 2);
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      window.setTimeout(run, 430);
    } else {
      run();
    }
  };

  // Reposition (with scroll) whenever the step changes.
  useLayoutEffect(() => {
    if (isOpen) place(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isOpen]);

  // Keep the spotlight glued to its anchor on scroll/resize.
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place(false);
      });
    };
    const onResize = () => place(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step]);

  if (!isOpen) return null;
  const s = TOUR_STEPS[step];
  const isLast = step >= TOUR_STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, pointerEvents: "none" }}>
      <div
        ref={boxRef}
        style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, border: "1px solid var(--ak)", borderRadius: 10, boxShadow: "0 0 0 200vmax rgba(4,4,7,.72),0 0 26px rgba(245,197,24,.25)", transition: "left .45s cubic-bezier(.4,0,.2,1),top .45s cubic-bezier(.4,0,.2,1),width .45s cubic-bezier(.4,0,.2,1),height .45s cubic-bezier(.4,0,.2,1),opacity .3s ease", opacity: 0 }}
      />
      <div
        ref={tipRef}
        style={{ position: "fixed", left: 24, top: 24, width: "min(360px,calc(100vw - 32px))", pointerEvents: "auto", borderRadius: 14, border: "1px solid transparent", background: "linear-gradient(150deg,rgba(22,22,30,.94),rgba(10,10,14,.94))", backdropFilter: "blur(20px) saturate(150%)", WebkitBackdropFilter: "blur(20px) saturate(150%)", boxShadow: "0 22px 50px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.14)", padding: "18px 20px 16px", transition: "left .45s ease,top .45s ease" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ak)" }}>
            {String(step + 1).padStart(2, "0")} / {String(TOUR_STEPS.length).padStart(2, "0")}
          </span>
          <button type="button" onClick={end} style={{ background: "none", border: "none", color: "var(--dm)", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "2px 6px" }}>×</button>
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 400, letterSpacing: "-.01em", color: "var(--tx)" }}>{s.t}</h3>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--dm)", minHeight: 64 }}>{s.b}</p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={back} style={{ fontFamily: "'Space Grotesk','Segoe UI',sans-serif", fontSize: 12.5, letterSpacing: ".01em", padding: "9px 16px", borderRadius: 999, border: "1px solid var(--bd)", background: "transparent", color: "var(--dm)", cursor: "pointer" }}>Back</button>
          <button type="button" className="noir-primary" style={{ padding: "9px 18px", fontSize: 12.5 }} onClick={next}>{isLast ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
