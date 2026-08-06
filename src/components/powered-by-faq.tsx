'use client';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding credit.
 *
 * DESIGN PHILOSOPHY (v4 — TYPOGRAPHIC WORDMARK, 3× LARGER)
 * ──────────────────────────────────────────────────────────────
 * Faisal Qayyum (FaQ Systems) is the product owner / developer of
 * the Concordia College platform.
 *
 * v1–v3 used the metallic PNG logo (`faq-systems-logo.png`). It was
 * illegible below 48px and looked "ugly" + "too small" per user
 * feedback (4 rounds of complaints). The metallic finish needs light
 * to reflect and dies on dark/neutral backgrounds.
 *
 * v4 REPLACES the PNG with a crisp CSS-rendered typographic wordmark:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  POWERED BY                                  │  ← tiny slate label
 *   │  FaQ •  SYSTEMS                              │  ← big gradient + gold dot + gold subtitle
 *   └──────────────────────────────────────────────┘
 *
 *   • "FaQ" — large extrabold, warm charcoal→bronze metallic gradient.
 *     This is NOT indigo/blue (per design system) and ties back to the
 *     original silver+gold metallic logo theme but in a flat, crisp,
 *     scalable form.
 *   • "•" — a glowing gold dot accent. Adds a jewel-like premium sparkle
 *     and a visual anchor between the wordmark and the subtitle.
 *   • "SYSTEMS" — small uppercase, tracked wide, in rich amber-gold.
 *
 * This matches the "Powered by arvo" aesthetic the user referenced:
 * modern, typographic, colorful, large, floating (no card on light).
 *
 * The wordmark is ~3× the visual footprint of v3 because:
 *   - Text is denser/bolder than a logo image with whitespace
 *   - The gradient + glowing dot + gold subtitle add visual richness
 *   - Font sizes are 56–72px (vs 48px PNG)
 *
 * VARIANTS
 * ────────
 *   <PoweredByFaq />                      → stacked floating (sidebar, download)
 *   <PoweredByFaq variant="inline" />     → inline row (portal footer bar)
 *   <PoweredByFaq variant="on-dark" />    → glass pill (login page over photo)
 *
 *   <SidebarFaqCredit collapsed={false} /> → sidebar expanded footer
 *   <SidebarFaqCredit collapsed={true} />  → sidebar collapsed rail (centered)
 */

type FaqVariant = 'default' | 'inline' | 'on-dark';

// ── "powered by" label — tiny slate, uppercase, wide-tracked ──────────────
const LABEL_CLASS =
  'text-[10px] font-semibold uppercase leading-none tracking-[0.28em] text-slate-400';

// ── The charcoal→bronze metallic gradient for the "FaQ" wordmark ──────────
// Evokes the original silver+gold metallic logo in a flat, crisp form.
// NOT indigo/blue — warm bronze/charcoal ties to the original brand.
const FAQ_GRADIENT_LIGHT =
  'linear-gradient(135deg, #1C1917 0%, #3F3F46 35%, #7C2D12 70%, #B45309 100%)';
const FAQ_GRADIENT_DARK =
  'linear-gradient(135deg, #FFFFFF 0%, #FEF3C7 50%, #FCD34D 100%)';

// ── The glowing gold dot accent ───────────────────────────────────────────
// A jewel-like sparkle between "FaQ" and "SYSTEMS". Adds premium feel.
const GOLD_DOT_GRADIENT =
  'linear-gradient(135deg, #FDE68A 0%, #F59E0B 45%, #D97706 75%, #92400E 100%)';

interface MarkProps {
  /** "FaQ" font size in px */
  size: number;
  /** "SYSTEMS" font size in px */
  subSize: number;
  onDark?: boolean;
}

/**
 * The FaQ wordmark: "FaQ" + glowing gold dot + "SYSTEMS" subtitle.
 * Stacked vertically (dot sits at the baseline of "FaQ", "SYSTEMS" below).
 */
function FaQMark({ size, subSize, onDark = false }: MarkProps) {
  const dotSize = Math.max(5, Math.round(size * 0.16));
  const gapBelow = Math.max(5, Math.round(size * 0.2));
  const dotGlow = Math.max(4, Math.round(size * 0.2));

  return (
    <span className="inline-flex flex-col" style={{ lineHeight: 0.92 }}>
      {/* Row: "FaQ" + gold dot */}
      <span
        className="inline-flex items-baseline"
        style={{ gap: `${Math.max(3, Math.round(size * 0.1))}px` }}
      >
        <span
          style={{
            fontSize: `${size}px`,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 0.92,
            background: onDark ? FAQ_GRADIENT_DARK : FAQ_GRADIENT_LIGHT,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            // Subtle metallic shimmer via filter
            filter: onDark
              ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))'
              : 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
          }}
        >
          FaQ
        </span>
        {/* Glowing gold dot — the jewel accent */}
        <span
          aria-hidden
          style={{
            width: `${dotSize}px`,
            height: `${dotSize}px`,
            borderRadius: '9999px',
            background: GOLD_DOT_GRADIENT,
            display: 'inline-block',
            boxShadow: `0 0 ${dotGlow}px rgba(245, 158, 11, 0.55), 0 0 ${dotGlow * 2}px rgba(217, 119, 6, 0.25)`,
            transform: 'translateY(-0.06em)',
          }}
        />
      </span>
      {/* "SYSTEMS" subtitle — tracked gold */}
      <span
        style={{
          fontSize: `${subSize}px`,
          fontWeight: 700,
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          lineHeight: 1,
          marginTop: `${gapBelow}px`,
          color: onDark ? '#FCD34D' : '#B45309',
          // compensate for the wide letter-spacing so it visually aligns left with "FaQ"
          paddingLeft: '0.21em',
        }}
      >
        Systems
      </span>
    </span>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export function PoweredByFaq({
  variant = 'default',
  className = '',
  href,
  align = 'left',
}: {
  variant?: FaqVariant;
  className?: string;
  href?: string;
  align?: 'left' | 'center';
}) {
  const alignClass = align === 'center' ? 'items-center' : 'items-start';

  // ── on-dark variant: glassmorphism pill for the login page ─────────────
  // The login page sits over a dark campus photograph. A floating wordmark
  // would be invisible, so we wrap it in a frosted-glass pill.
  if (variant === 'on-dark') {
    const content = (
      <div
        className={`flex flex-col ${alignClass} gap-2 rounded-2xl px-6 py-4 backdrop-blur-md`}
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow:
            '0 10px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <span className={LABEL_CLASS} style={{ color: 'rgba(255,255,255,0.72)' }}>
          powered by
        </span>
        <FaQMark size={44} subSize={12} onDark />
      </div>
    );
    if (href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-block transition-transform duration-200 hover:scale-[1.03] ${className}`}
          title="FaQ Systems — Product Owner"
        >
          {content}
        </a>
      );
    }
    return (
      <div className={`inline-block ${className}`} title="FaQ Systems — Product Owner">
        {content}
      </div>
    );
  }

  // ── inline variant: horizontal row for the portal footer bar ───────────
  // "powered by" + "FaQ • Systems" all on one line, baseline-aligned.
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-baseline gap-2.5 ${className}`}>
        <span className={LABEL_CLASS}>powered by</span>
        <span className="inline-flex items-baseline" style={{ gap: '4px' }}>
          <span
            style={{
              fontSize: '22px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1,
              background: FAQ_GRADIENT_LIGHT,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            FaQ
          </span>
          <span
            aria-hidden
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '9999px',
              background: GOLD_DOT_GRADIENT,
              display: 'inline-block',
              boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)',
              transform: 'translateY(-0.1em)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.34em',
              textTransform: 'uppercase',
              color: '#B45309',
              marginLeft: '3px',
              lineHeight: 1,
            }}
          >
            Systems
          </span>
        </span>
      </span>
    );
  }

  // ── default variant: stacked, floating, no card ────────────────────────
  // "powered by" tiny label on top, FaQ wordmark (56px) below. Floats on
  // the white sidebar / download background. This is the arvo aesthetic.
  const content = (
    <div className={`flex flex-col ${alignClass} gap-2`}>
      <span className={LABEL_CLASS}>powered by</span>
      <FaQMark size={56} subSize={13} />
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block transition-transform duration-200 hover:scale-[1.02] ${className}`}
        title="FaQ Systems — Product Owner"
      >
        {content}
      </a>
    );
  }
  return (
    <div className={`inline-block ${className}`} title="FaQ Systems — Product Owner">
      {content}
    </div>
  );
}

/**
 * Sidebar footer credit.
 *
 * Expanded 260px sidebar: stacked "powered by" + big FaQ wordmark,
 *   left-aligned, floating on the sidebar's white background.
 *
 * Collapsed 72px rail: just the FaQ mark + "Systems", centered,
 *   smaller. No "powered by" label (no room).
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — centered FaQ mark, no label.
    return (
      <div className="flex flex-col items-center gap-1 px-2 pb-3 pt-1">
        <span className="inline-flex items-baseline" style={{ gap: '3px' }}>
          <span
            style={{
              fontSize: '26px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1,
              background: FAQ_GRADIENT_LIGHT,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
            }}
          >
            FaQ
          </span>
          <span
            aria-hidden
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '9999px',
              background: GOLD_DOT_GRADIENT,
              display: 'inline-block',
              boxShadow: '0 0 5px rgba(245, 158, 11, 0.55)',
              transform: 'translateY(-0.06em)',
            }}
          />
        </span>
        <span
          style={{
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#B45309',
            lineHeight: 1,
            marginTop: '4px',
          }}
        >
          Systems
        </span>
      </div>
    );
  }

  // Expanded sidebar — stacked, left-aligned, floating.
  return (
    <div className="px-4 pb-3 pt-2">
      <PoweredByFaq align="left" />
    </div>
  );
}
