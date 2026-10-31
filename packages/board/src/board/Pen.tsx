"use client";

import { forwardRef } from "react";

/**
 * The board's pen: tip at the element's origin (bottom-left), body tilted ~40° up-right so it never covers the
 * line being written. Positioned by writer.ts in world coordinates; hidden for reduced motion.
 */
export const Pen = forwardRef<HTMLDivElement>(function Pen(_props, ref) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-board-pen=""
      className="pointer-events-none absolute top-0 left-0 z-10 origin-top-left opacity-0 transition-opacity duration-200 will-change-transform motion-reduce:hidden"
    >
      <svg
        width={30}
        height={30}
        viewBox="-6 -26 30 30"
        className="absolute -top-[26px] -left-1.5 overflow-visible"
        style={{ filter: "drop-shadow(2px 4px 6px rgb(22 34 80 / 0.12))" }}
      >
        <g transform="rotate(40)">
          <path d="M0 0 L-2.4 -6.5 L2.4 -6.5 Z" fill="var(--ink)" />
          <rect x={-3.2} y={-9.5} width={6.4} height={3.4} rx={0.8} fill="#cbd5e1" />
          <rect x={-3.2} y={-25} width={6.4} height={16} rx={1.6} fill="var(--mento-blue)" />
          <rect x={-1.2} y={-23} width={1.4} height={12} rx={0.7} fill="white" opacity={0.35} />
          <rect
            x={-3.2}
            y={-28.5}
            width={6.4}
            height={4.5}
            rx={2.2}
            fill="var(--mento-blue-strong)"
          />
        </g>
      </svg>
    </div>
  );
});
