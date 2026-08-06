'use client';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding credit.
 *
 * ──────────────────────────────────────────────────────────────────────
 * v6 — STUNNING PREMIUM PNG LOGO ("FaQ" capitalization, real .png file)
 * ──────────────────────────────────────────────────────────────────────
 *
 * The logo is a real PNG file served directly via a native <img> tag
 * (NOT next/image, which would convert it to webp/avif). This guarantees:
 *   • The browser receives the actual .png file
 *   • Right-click → "Save image as" downloads a .png
 *   • The logo renders identically everywhere
 *
 * LOGO DESIGN (matches the "Powered by arvo" stunning aesthetic):
 *   • "FaQ" — F capital, a lowercase, Q capital (user's exact brand)
 *   • Sora ExtraBold font (modern, distinctive, premium SaaS typeface)
 *   • Rich 4-stop emerald-teal gradient (#0F766E → #2DD4BF) — luminous
 *   • Subtle top-light sheen overlay for depth (modern, not dated 3D)
 *   • Refined jewel-like gold dot (radial gradient + soft glow)
 *   • "SYSTEMS" subtitle in slate, wide-tracked (0.43em)
 *   • Transparent background — floats freely, no card
 *
 * TWO VARIANTS:
 *   • faq-logo-light.png  — teal "FaQ" for light backgrounds
 *   • faq-logo-dark.png   — white→gold "FaQ" for dark backgrounds
 *
 * VARIANTS (all 3× larger than v4.6.9)
 *   <PoweredByFaq />                      → stacked floating (sidebar, download)
 *   <PoweredByFaq variant="inline" />     → inline row (portal footer bar)
 *   <PoweredByFaq variant="on-dark" />    → glass pill (login page over photo)
 *   <SidebarFaqCredit collapsed={false} /> → sidebar expanded footer
 *   <SidebarFaqCredit collapsed={true} />  → sidebar collapsed rail (centered)
 */

type FaqVariant = 'default' | 'inline' | 'on-dark';

// ── "powered by" label — tiny slate, uppercase, wide-tracked ──────────────
const LABEL_CLASS =
  'text-[10px] font-semibold uppercase leading-none tracking-[0.28em] text-slate-400';

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
  // Uses the DARK logo variant (white→gold gradient) inside a frosted pill.
  if (variant === 'on-dark') {
    const content = (
      <div
        className={`flex flex-col ${alignClass} gap-2.5 rounded-2xl px-7 py-5 backdrop-blur-md`}
        style={{
          background: 'rgba(255,255,255,0.09)',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow:
            '0 12px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <span className={LABEL_CLASS} style={{ color: 'rgba(255,255,255,0.78)' }}>
          powered by
        </span>
        {/* Native <img> so it serves the actual .png file (no webp/avif conversion) */}
        <img
          src="/faq-logo-dark.png"
          alt="FaQ Systems — Product Owner"
          width={300}
          height={54}
          loading="eager"
          decoding="async"
          style={{ height: 'auto', display: 'block' }}
        />
      </div>
    );
    if (href) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-block transition-transform duration-200 hover:scale-[1.03] ${className}`} title="FaQ Systems — Product Owner">
          {content}
        </a>
      );
    }
    return <div className={`inline-block ${className}`} title="FaQ Systems — Product Owner">{content}</div>;
  }

  // ── inline variant: horizontal row for the portal footer bar ───────────
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <span className={LABEL_CLASS}>powered by</span>
        <img
          src="/faq-logo-light.png"
          alt="FaQ Systems"
          width={185}
          height={33}
          loading="lazy"
          decoding="async"
          style={{ height: 'auto', display: 'inline-block' }}
        />
      </span>
    );
  }

  // ── default variant: stacked, floating, no card ────────────────────────
  // "powered by" tiny label on top, FaQ logo (260px wide) below. Floats on
  // the white sidebar / download background. This is the arvo aesthetic.
  const content = (
    <div className={`flex flex-col ${alignClass} gap-2.5`}>
      <span className={LABEL_CLASS}>powered by</span>
      <img
        src="/faq-logo-light.png"
        alt="FaQ Systems — Product Owner"
        width={280}
        height={50}
        loading="lazy"
        decoding="async"
        style={{
          height: 'auto',
          display: 'block',
          filter: 'drop-shadow(0 4px 12px rgba(10, 26, 58, 0.15))',
        }}
      />
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-block transition-transform duration-200 hover:scale-[1.02] ${className}`} title="FaQ Systems — Product Owner">
        {content}
      </a>
    );
  }
  return <div className={`inline-block ${className}`} title="FaQ Systems — Product Owner">{content}</div>;
}

/**
 * Sidebar footer credit.
 *
 * Expanded 260px sidebar: stacked "powered by" + big FaQ logo (200px wide),
 *   left-aligned, floating on the sidebar's white background.
 *
 * Collapsed 72px rail: just the FaQ logo (100px wide), centered.
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — centered FaQ logo, no label.
    return (
      <div className="flex justify-center px-2 pb-3 pt-1">
        <img
          src="/faq-logo-light.png"
          alt="Powered by FaQ Systems"
          width={120}
          height={22}
          loading="lazy"
          decoding="async"
          title="Powered by FaQ Systems"
          style={{
            height: 'auto',
            display: 'block',
            filter: 'drop-shadow(0 2px 6px rgba(10, 26, 58, 0.18))',
          }}
        />
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
