"use client";

import * as React from "react";

/**
 * AnimatedTechIcon
 * ----------------
 * A set of hand-crafted, lightweight SVG icons — one per technology
 * category. Each icon has:
 *   - a soft idle animation (always running, very subtle)
 *   - a richer animation when the parent card is hovered
 *   - a colored glow ring behind it driven by the category accent
 *
 * Icons are pure SVG + CSS keyframes (no JS animation loop), so they
 * stay crisp on every screen density and never look pixelated.
 */

type IconProps = {
  hovered: boolean;
  className?: string;
};

/* Shared glow halo behind every icon */
function GlowHalo({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full transition-all duration-500"
      style={{
        background: `radial-gradient(circle at 50% 50%, ${color}40 0%, transparent 70%)`,
        transform: hovered ? "scale(1.25)" : "scale(1)",
        opacity: hovered ? 1 : 0.6,
        animation: "glow-breathe 4s ease-in-out infinite",
      }}
    />
  );
}

/* ---------------------------------------------------------------- */
/* Frontend — `</>` code brackets with a floating cursor            */
/* ---------------------------------------------------------------- */
export function FrontendIcon({ hovered, className }: IconProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <GlowHalo color="#22d3ee" hovered={hovered} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative h-full w-full"
        style={{ animation: "float-soft 4s ease-in-out infinite" }}
      >
        {/* outer ring */}
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="#22d3ee"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          style={{
            transformOrigin: "center",
            animation: `spin-slow ${hovered ? 8 : 20}s linear infinite`,
          }}
        />
        {/* code brackets */}
        <path
          d="M18 16 L11 24 L18 32"
          stroke="#22d3ee"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M30 16 L37 24 L30 32"
          stroke="#22d3ee"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* floating cursor slash */}
        <path
          d="M26 14 L22 34"
          stroke="#67e8f9"
          strokeWidth="2.6"
          strokeLinecap="round"
          style={{
            animation: "blink-soft 1.6s ease-in-out infinite",
          }}
        />
        {/* sparkle */}
        <circle
          cx="37"
          cy="14"
          r="1.6"
          fill="#a5f3fc"
          style={{ animation: "blink-soft 2s ease-in-out infinite" }}
        />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Backend — stacked server layers with flowing data               */
/* ---------------------------------------------------------------- */
export function BackendIcon({ hovered, className }: IconProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <GlowHalo color="#34d399" hovered={hovered} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative h-full w-full"
        style={{ animation: "float-soft 5s ease-in-out infinite" }}
      >
        {/* orbiting dot */}
        <g
          style={{
            transformOrigin: "center",
            animation: `spin-slow ${hovered ? 6 : 14}s linear infinite`,
          }}
        >
          <circle cx="24" cy="6" r="1.8" fill="#6ee7b7" />
        </g>
        {/* top layer */}
        <rect
          x="9"
          y="13"
          width="30"
          height="7"
          rx="2.5"
          stroke="#34d399"
          strokeWidth="2"
          fill="#34d39910"
        />
        <circle cx="14" cy="16.5" r="1.4" fill="#6ee7b7" />
        <circle
          cx="14"
          cy="16.5"
          r="1.4"
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="1"
          style={{ animation: "pulse-ring 2.4s ease-out infinite" }}
        />
        {/* middle layer */}
        <rect
          x="9"
          y="22"
          width="30"
          height="7"
          rx="2.5"
          stroke="#34d399"
          strokeWidth="2"
          fill="#34d39910"
        />
        <circle cx="14" cy="25.5" r="1.4" fill="#6ee7b7" />
        {/* bottom layer */}
        <rect
          x="9"
          y="31"
          width="30"
          height="7"
          rx="2.5"
          stroke="#34d399"
          strokeWidth="2"
          fill="#34d39910"
        />
        <circle cx="14" cy="34.5" r="1.4" fill="#6ee7b7" />
        {/* flowing data line */}
        <path
          d="M22 16.5 L34 16.5"
          stroke="#a7f3d0"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="3 4"
          style={{ animation: "dash-flow 1.2s linear infinite" }}
        />
        <path
          d="M22 25.5 L34 25.5"
          stroke="#a7f3d0"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="3 4"
          style={{ animation: "dash-flow 1.6s linear infinite" }}
        />
        <path
          d="M22 34.5 L34 34.5"
          stroke="#a7f3d0"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="3 4"
          style={{ animation: "dash-flow 1.4s linear infinite" }}
        />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* AI & Tools — neural core with orbiting nodes                    */
/* ---------------------------------------------------------------- */
export function AIIcon({ hovered, className }: IconProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <GlowHalo color="#a78bfa" hovered={hovered} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative h-full w-full"
        style={{ animation: "float-soft 4.5s ease-in-out infinite" }}
      >
        {/* outer orbit ring */}
        <circle
          cx="24"
          cy="24"
          r="18"
          stroke="#a78bfa"
          strokeOpacity="0.25"
          strokeWidth="1.2"
          strokeDasharray="2 5"
          style={{
            transformOrigin: "center",
            animation: `spin-reverse-slow ${hovered ? 9 : 18}s linear infinite`,
          }}
        />
        {/* neural connections */}
        <g stroke="#c4b5fd" strokeWidth="1.2" strokeOpacity="0.6">
          <line x1="24" y1="24" x2="13" y2="14" />
          <line x1="24" y1="24" x2="35" y2="14" />
          <line x1="24" y1="24" x2="13" y2="34" />
          <line x1="24" y1="24" x2="35" y2="34" />
        </g>
        {/* outer nodes */}
        <circle cx="13" cy="14" r="2.4" fill="#c4b5fd" />
        <circle cx="35" cy="14" r="2.4" fill="#c4b5fd" />
        <circle cx="13" cy="34" r="2.4" fill="#c4b5fd" />
        <circle cx="35" cy="34" r="2.4" fill="#c4b5fd" />
        {/* core */}
        <circle
          cx="24"
          cy="24"
          r="6"
          fill="#a78bfa"
          style={{
            transformOrigin: "center",
            animation: "glow-breathe 2.4s ease-in-out infinite",
          }}
        />
        <circle cx="24" cy="24" r="3" fill="#ede9fe" />
        {/* sparkles */}
        <g
          style={{
            transformOrigin: "center",
            animation: `spin-slow ${hovered ? 5 : 12}s linear infinite`,
          }}
        >
          <path
            d="M24 4 L25 7 L28 8 L25 9 L24 12 L23 9 L20 8 L23 7 Z"
            fill="#ddd6fe"
            style={{ animation: "blink-soft 1.8s ease-in-out infinite" }}
          />
        </g>
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Database — cylinder with flowing data                            */
/* ---------------------------------------------------------------- */
export function DatabaseIcon({ hovered, className }: IconProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <GlowHalo color="#fbbf24" hovered={hovered} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative h-full w-full"
        style={{ animation: "float-soft 5.5s ease-in-out infinite" }}
      >
        {/* base shadow ring */}
        <ellipse
          cx="24"
          cy="38"
          rx="14"
          ry="3.5"
          fill="#fbbf2410"
          stroke="#fbbf24"
          strokeOpacity="0.3"
          strokeWidth="1.2"
        />
        {/* cylinder body */}
        <path
          d="M10 14 L10 34 Q10 38 24 38 Q38 38 38 34 L38 14"
          stroke="#fbbf24"
          strokeWidth="2"
          fill="#fbbf2410"
          strokeLinejoin="round"
        />
        {/* top ellipse */}
        <ellipse
          cx="24"
          cy="14"
          rx="14"
          ry="4"
          stroke="#fbbf24"
          strokeWidth="2"
          fill="#fbbf2420"
        />
        {/* middle rings */}
        <path
          d="M10 22 Q10 26 24 26 Q38 26 38 22"
          stroke="#fbbf24"
          strokeOpacity="0.5"
          strokeWidth="1.4"
          fill="none"
        />
        <path
          d="M10 30 Q10 34 24 34 Q38 34 38 30"
          stroke="#fbbf24"
          strokeOpacity="0.5"
          strokeWidth="1.4"
          fill="none"
        />
        {/* flowing data dots falling in */}
        <circle
          cx="24"
          cy="18"
          r="1.6"
          fill="#fde68a"
          style={{ animation: "blink-soft 1.4s ease-in-out infinite" }}
        />
        <circle
          cx="20"
          cy="24"
          r="1.2"
          fill="#fde68a"
          style={{ animation: "blink-soft 1.8s ease-in-out infinite 0.3s" }}
        />
        <circle
          cx="28"
          cy="30"
          r="1.2"
          fill="#fde68a"
          style={{ animation: "blink-soft 1.6s ease-in-out infinite 0.6s" }}
        />
        {/* orbiting indicator */}
        <g
          style={{
            transformOrigin: "center",
            animation: `spin-slow ${hovered ? 6 : 16}s linear infinite`,
          }}
        >
          <circle cx="24" cy="6" r="1.4" fill="#fde68a" />
        </g>
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Mobile Dev — phone with pulsing notification + signal waves      */
/* ---------------------------------------------------------------- */
export function MobileIcon({ hovered, className }: IconProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <GlowHalo color="#fb7185" hovered={hovered} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative h-full w-full"
        style={{ animation: "bob 4s ease-in-out infinite" }}
      >
        {/* signal waves */}
        <g
          stroke="#fb7185"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        >
          <path
            d="M5 18 Q3 24 5 30"
            style={{ animation: "blink-soft 2s ease-in-out infinite" }}
          />
          <path
            d="M43 18 Q45 24 43 30"
            style={{ animation: "blink-soft 2s ease-in-out infinite 0.4s" }}
          />
        </g>
        {/* phone body */}
        <rect
          x="15"
          y="8"
          width="18"
          height="32"
          rx="4.5"
          stroke="#fb7185"
          strokeWidth="2"
          fill="#fb718510"
        />
        {/* notch */}
        <rect x="21" y="11.5" width="6" height="2" rx="1" fill="#fb7185" />
        {/* screen content lines */}
        <rect x="19" y="17" width="10" height="2.4" rx="1.2" fill="#fda4af" />
        <rect x="19" y="22" width="7" height="2" rx="1" fill="#fda4af" opacity="0.7" />
        {/* home indicator */}
        <rect x="21" y="36" width="6" height="1.6" rx="0.8" fill="#fb7185" />
        {/* pulsing notification dot */}
        <circle
          cx="29"
          cy="13"
          r="2"
          fill="#fb7185"
          style={{ animation: "glow-breathe 1.8s ease-in-out infinite" }}
        />
        <circle
          cx="29"
          cy="13"
          r="2"
          fill="none"
          stroke="#fda4af"
          strokeWidth="1"
          style={{ animation: "pulse-ring 2s ease-out infinite" }}
        />
        {/* app grid dots */}
        <g fill="#fda4af" opacity="0.85">
          <circle
            cx="21"
            cy="28"
            r="1.4"
            style={{ animation: "blink-soft 2.2s ease-in-out infinite" }}
          />
          <circle
            cx="27"
            cy="28"
            r="1.4"
            style={{ animation: "blink-soft 2.2s ease-in-out infinite 0.3s" }}
          />
          <circle
            cx="21"
            cy="32"
            r="1.4"
            style={{ animation: "blink-soft 2.2s ease-in-out infinite 0.6s" }}
          />
          <circle
            cx="27"
            cy="32"
            r="1.4"
            style={{ animation: "blink-soft 2.2s ease-in-out infinite 0.9s" }}
          />
        </g>
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Generic small animated icon for the "Currently Learning" card    */
/* ---------------------------------------------------------------- */
export function BookIcon({ hovered, className }: IconProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <GlowHalo color="#22d3ee" hovered={hovered} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative h-full w-full"
        style={{ animation: "float-soft 4s ease-in-out infinite" }}
      >
        {/* pages */}
        <path
          d="M8 12 Q14 10 22 12 L22 38 Q14 36 8 38 Z"
          stroke="#22d3ee"
          strokeWidth="2"
          fill="#22d3ee10"
          strokeLinejoin="round"
        />
        <path
          d="M40 12 Q34 10 26 12 L26 38 Q34 36 40 38 Z"
          stroke="#22d3ee"
          strokeWidth="2"
          fill="#22d3ee10"
          strokeLinejoin="round"
        />
        {/* spine */}
        <path d="M22 12 L26 12 L26 38 L22 38 Z" fill="#22d3ee30" stroke="#22d3ee" strokeWidth="1.5" />
        {/* reading lines */}
        <path
          d="M12 18 L18 17"
          stroke="#67e8f9"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 3"
          style={{ animation: "dash-flow 1.5s linear infinite" }}
        />
        <path
          d="M12 23 L18 22"
          stroke="#67e8f9"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 3"
          style={{ animation: "dash-flow 1.8s linear infinite" }}
        />
        <path
          d="M30 18 L36 17"
          stroke="#67e8f9"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 3"
          style={{ animation: "dash-flow 1.6s linear infinite" }}
        />
        <path
          d="M30 23 L36 22"
          stroke="#67e8f9"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 3"
          style={{ animation: "dash-flow 1.7s linear infinite" }}
        />
        {/* floating knowledge star */}
        <path
          d="M24 4 L25 6.5 L27.5 7 L25 7.5 L24 10 L23 7.5 L20.5 7 L23 6.5 Z"
          fill="#a5f3fc"
          style={{ animation: "blink-soft 2s ease-in-out infinite" }}
        />
      </svg>
    </div>
  );
}
