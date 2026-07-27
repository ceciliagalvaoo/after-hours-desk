import { useEffect, useRef } from "react";
import {
  paintBroker,
  mix,
  type BrokerLook,
  type BrokerMood,
  type Crop,
} from "../../lib/brokerGrid";

/** Common crops, matching the prototype's HEAD / BUST framings. */
export const CROP_HEAD: Crop = { x: 14, y: 2, w: 36, h: 40 };
export const CROP_BUST: Crop = { x: 8, y: 14, w: 48, h: 48 };

interface BrokerCanvasProps {
  look: BrokerLook;
  /** Desk-state accent for lens + hem. Defaults to phosphor (desk open). */
  glow?: string;
  /** Transient reaction. Ignored while `talk` is animating. */
  mood?: BrokerMood;
  crop?: Crop | null;
  /** CSS render size in px (canvas stays 1px/cell, scaled up pixelated). */
  size?: number;
  width?: number;
  height?: number;
  /** When true, loops the talking gesture (mouth + hand) and a gentle glow pulse. */
  talk?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * Renders "The Broker" pixel persona to a <canvas> via the ported `brokerGrid` engine. All motion
 * (talk gesture, glow pulse) is a transform/opacity-free canvas repaint on a ~460ms tick — the
 * same cadence the original prototype used. `glow` is desk state, never user-picked.
 */
export function BrokerCanvas({
  look,
  glow = "#3ddc84",
  mood = "",
  crop = null,
  size,
  width,
  height,
  talk = false,
  className,
  style,
  title,
}: BrokerCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef(false);

  // Static paint whenever the look/glow/mood/crop change (and when talk turns off).
  useEffect(() => {
    if (talk) return;
    paintBroker(ref.current, { ...look, glow, mood }, crop);
  }, [look, glow, mood, crop, talk]);

  // Talking loop: alternate talkA/talkB and pulse the glow between full + dimmed state color.
  useEffect(() => {
    if (!talk) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      frame.current = !frame.current;
      paintBroker(
        ref.current,
        {
          ...look,
          glow: frame.current ? glow : mix(glow, "#0b0b0f", 0.35),
          mood: frame.current ? "talkA" : "talkB",
        },
        crop,
      );
    };
    tick();
    const id = window.setInterval(tick, 460);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [talk, look, glow, crop]);

  const cssW = width ?? size;
  const cssH = height ?? size;

  return (
    <canvas
      ref={ref}
      title={title}
      className={className}
      style={{
        imageRendering: "pixelated",
        display: "block",
        ...(cssW != null ? { width: `${cssW}px` } : null),
        ...(cssH != null ? { height: `${cssH}px` } : null),
        ...style,
      }}
    />
  );
}
