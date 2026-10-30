"use client";

// Voice orb: the mascot as the face and a ring drawn in SVG around it (docs/18-ui-references.md §3.3, §6.3;
// docs/19-brand-assets.md §4). No dependencies (D26). All faces are stacked and preloaded, and switch by
// opacity, never by swapping src (that restarts the GIF and flickers). Per-frame ring motion is written
// straight to the DOM from one requestAnimationFrame loop, so audio levels never re-render React.

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { cx } from "../components/cx";
import { VisuallyHidden } from "../components/VisuallyHidden";
import {
  ORB_FACES,
  orbFace,
  orbFaceSrc,
  orbRingMode,
  orbStateLabels,
  ringPath,
  smoothLevel,
  type OrbState,
} from "./orbModel";

export type OrbProps = {
  state: OrbState;
  /** Diameter in px; the design range is 160–200. */
  size?: number;
  /** Audio level 0..1 (mic in listening, TTS in speaking). Read every frame; never causes a render. */
  getLevel?: () => number;
  /** Change it to make the orb "perk up" (click-and-ask). */
  perkKey?: string | number;
  /** Change it to play the correct-answer burst. */
  burstKey?: string | number;
  /** Optional visible caption under the orb (visual only; the state is announced separately). */
  label?: ReactNode;
  /** Where the brand files live; faces are `${basePath}/mascot/*.gif` and `${basePath}/mascot.png`. */
  basePath?: string;
  className?: string;
};

// SVG geometry in a 200×200 viewBox.
const C = 100;
const RING_R = 84;
const ARC_LEN = 130;
const ARC_GAP = 2 * Math.PI * RING_R - ARC_LEN;
const STATIC_RING = ringPath(C, C, RING_R, 0, 1, 0);
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)"; // --ease-out (WAAPI cannot read CSS variables)
const SPARKLES = [
  { x: 100, y: 8, s: 1 },
  { x: 182, y: 58, s: 0.8 },
  { x: 170, y: 160, s: 0.9 },
  { x: 34, y: 168, s: 0.75 },
  { x: 18, y: 64, s: 0.85 },
];
// Four-point sparkle centred on 0,0.
const SPARKLE_D = "M0 -7C1 -2 2 -1 7 0C2 1 1 2 0 7C-1 2 -2 1 -7 0C-2 -1 -1 -2 0 -7Z";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(motionQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
}

/** Runs `effect` when `key` changes, skipping the first render. */
function useKeyChange(key: string | number | undefined, effect: () => void) {
  const prev = useRef(key);
  const effectRef = useRef(effect);
  effectRef.current = effect;
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    effectRef.current();
  }, [key]);
}

export function Orb({ state, size = 176, getLevel, perkKey, burstKey, label, basePath = "/brand", className }: OrbProps) {
  const reducedMotion = usePrefersReducedMotion();
  const face = orbFace(state, reducedMotion);
  const mode = orbRingMode(state);
  const gradientId = `mento-orb-arc-${useId().replace(/:/g, "")}`;

  const bodyRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const burstRef = useRef<SVGCircleElement>(null);
  const sparkleRefs = useRef<Array<SVGGElement | null>>([]);
  const getLevelRef = useRef(getLevel);
  getLevelRef.current = getLevel;

  // Ring loop: one rAF per orb, paused while the tab is hidden, off for reduced motion and paused.
  useEffect(() => {
    const halo = haloRef.current;
    const wave = waveRef.current;
    const glow = glowRef.current;
    const arc = arcRef.current;
    if (!halo || !wave || !glow || !arc) return;

    const resetStatic = () => {
      halo.style.transform = "";
      wave.setAttribute("d", STATIC_RING);
      glow.setAttribute("stroke-opacity", "0");
      arc.setAttribute("transform", "rotate(-90 100 100)");
    };
    resetStatic();
    if (reducedMotion || mode === "dim") return;

    let raf = 0;
    let last = 0;
    let level = 0;
    const lobes = state === "speaking" ? 7 : 5;
    const waveSpeed = state === "speaking" ? 3.2 : 1.8;

    const frame = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const t = now / 1000;
      const breathe = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 4.2); // 0..1 over 4.2 s
      let scale = 1;
      let amp = 0;
      let glowOpacity = 0;

      if (mode === "breathe") {
        scale = 1 + 0.035 * breathe;
        glowOpacity = 0.15 + 0.2 * breathe;
      } else if (mode === "level") {
        level = smoothLevel(level, getLevelRef.current?.() ?? 0, dt);
        scale = 1 + 0.1 * level;
        amp = 1 + 7 * level;
        glowOpacity = 0.15 + 0.65 * level;
      } else if (mode === "pulse") {
        const pulse = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 1.8);
        scale = 1 + 0.06 * pulse;
        glowOpacity = 0.15 + 0.45 * pulse;
      } else if (mode === "arc") {
        const period = state === "loading" ? 2.4 : 1.4;
        arc.setAttribute("transform", `rotate(${(((t / period) * 360) % 360).toFixed(1)} 100 100)`);
        scale = 1 + 0.02 * breathe;
      }

      halo.style.transform = `scale(${scale.toFixed(4)})`;
      wave.setAttribute("d", amp > 0 ? ringPath(C, C, RING_R, amp, lobes, t * waveSpeed) : STATIC_RING);
      glow.setAttribute("stroke-opacity", glowOpacity.toFixed(3));
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      resetStatic();
    };
  }, [state, mode, reducedMotion]);

  // Perk up: a quick 1.06 scale (click-and-ask).
  useKeyChange(perkKey, () => {
    if (reducedMotion) return;
    bodyRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], {
      duration: 180,
      easing: EASE_OUT,
    });
  });

  // Correct answer: one ring pulse and a few light sparkles (~700 ms). Gentle, never an alarm.
  useKeyChange(burstKey, () => {
    if (reducedMotion) return;
    burstRef.current?.animate(
      [
        { opacity: 0.9, transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.16)" },
      ],
      { duration: 700, easing: EASE_OUT },
    );
    sparkleRefs.current.forEach((el, i) => {
      const sp = SPARKLES[i];
      if (!el || !sp) return;
      const dx = (sp.x - C) * 0.12;
      const dy = (sp.y - C) * 0.12;
      el.animate(
        [
          { opacity: 0, transform: "translate(0px, 0px) scale(0.2)" },
          { opacity: 1, transform: `translate(${dx / 2}px, ${dy / 2}px) scale(${sp.s})`, offset: 0.35 },
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${sp.s * 0.6})` },
        ],
        { duration: 700, delay: i * 30, easing: EASE_OUT },
      );
    });
    bodyRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], {
      duration: 360,
      easing: EASE_OUT,
    });
  });

  const ringFade = "transition-opacity duration-200 ease-out";

  return (
    <div className={cx("inline-flex flex-col items-center gap-2", className)} role="status" aria-live="polite">
      <div ref={bodyRef} data-state={state} className="relative shrink-0 rounded-full" style={{ width: size, height: size }}>
        {/* Soft disc behind the face; its scale breathes or follows the level. */}
        <div
          ref={haloRef}
          aria-hidden
          className={cx(
            "absolute inset-[12%] rounded-full bg-(--mento-blue-soft) shadow-(--shadow-pop) will-change-transform",
            ringFade,
            mode === "dim" && "opacity-60",
          )}
        />

        <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--mascot-light, #b1d8fa)" }} />
              <stop offset="1" style={{ stopColor: "var(--mento-blue, #1e59ed)" }} />
            </linearGradient>
          </defs>

          {/* Wide light glow under the line: amplitude and pulses show here first. */}
          <circle
            ref={glowRef}
            cx={C}
            cy={C}
            r={RING_R}
            fill="none"
            strokeWidth={10}
            strokeOpacity={0}
            style={{ stroke: "var(--mascot-light, #b1d8fa)" }}
          />

          {/* Main ring line: a wave in listening/speaking, a circle otherwise. */}
          <path
            ref={waveRef}
            d={STATIC_RING}
            fill="none"
            strokeWidth={3}
            strokeLinejoin="round"
            className={ringFade}
            style={{
              stroke: "var(--mento-blue, #1e59ed)",
              opacity: mode === "dim" ? 0.3 : mode === "arc" ? (state === "loading" ? 0.25 : 0.2) : 0.85,
            }}
          />

          {/* Rotating gradient arc for thinking (and, quieter, loading). */}
          <circle
            ref={arcRef}
            cx={C}
            cy={C}
            r={RING_R}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={state === "loading" ? 3 : 4.5}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${ARC_GAP.toFixed(2)}`}
            transform="rotate(-90 100 100)"
            className={ringFade}
            style={{ opacity: mode === "arc" ? (state === "loading" ? 0.6 : 1) : 0 }}
          />

          {/* Correct-answer burst (hidden until burstKey changes). */}
          <circle
            ref={burstRef}
            cx={C}
            cy={C}
            r={RING_R}
            fill="none"
            strokeWidth={3}
            style={{ stroke: "var(--mento-blue, #1e59ed)", opacity: 0, transformBox: "fill-box", transformOrigin: "center" }}
          />
          {SPARKLES.map((sp, i) => (
            <g key={i} transform={`translate(${sp.x} ${sp.y})`}>
              <g
                ref={(el) => {
                  sparkleRefs.current[i] = el;
                }}
                style={{ opacity: 0, transformBox: "fill-box", transformOrigin: "center" }}
              >
                <path d={SPARKLE_D} style={{ fill: "var(--mascot-light, #b1d8fa)", stroke: "var(--mento-blue, #1e59ed)" }} strokeWidth={0.6} />
              </g>
            </g>
          ))}
        </svg>

        {/* Faces: all stacked and preloaded; only opacity/visibility changes (no src swap, no flicker).
            The motion-reduce classes cover the first paint before JS knows the preference.
            The GIFs carry ~22% transparent padding and mascot.png ~10%, so the PNG gets a smaller box
            and the mascot keeps the same size (~50% of the orb) across every face. */}
        <div className="absolute inset-0">
          {ORB_FACES.map((f) => {
            const active = f === face;
            const isStatic = f === "static";
            return (
              <img
                key={f}
                src={orbFaceSrc(f, basePath)}
                alt=""
                aria-hidden
                draggable={false}
                loading="eager"
                decoding="async"
                className={cx(
                  "absolute select-none object-contain transition-[opacity,visibility] duration-200 ease-out",
                  isStatic ? "inset-[19%] size-[62%]" : "inset-[8%] size-[84%]",
                  active ? "visible opacity-100" : "invisible opacity-0",
                  isStatic ? "motion-reduce:visible! motion-reduce:opacity-100!" : "motion-reduce:invisible! motion-reduce:opacity-0!",
                  isStatic && mode === "dim" && "saturate-[0.85]",
                )}
              />
            );
          })}
        </div>
      </div>

      <VisuallyHidden>{orbStateLabels[state]}</VisuallyHidden>
      {label != null && (
        <span aria-hidden className="text-sm font-semibold text-(--ink-soft)">
          {label}
        </span>
      )}
    </div>
  );
}
