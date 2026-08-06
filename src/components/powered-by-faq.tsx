'use client';

import Image from 'next/image';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding credit.
 *
 * ──────────────────────────────────────────────────────────────────────
 * v5 — PREMIUM PNG LOGO (user-requested: "logo must be in png")
 * ──────────────────────────────────────────────────────────────────────
 *
 * The logo is a real PNG file (`/faq-logo-light.png` + `/faq-logo-dark.png`)
 * — a premium lowercase "faq" wordmark in emerald-teal gradient with a flat
 * gold dot accent and a wide-tracked "SYSTEMS" subtitle. Matches the
 * "Powered by arvo" aesthetic the user referenced:
 *   • lowercase modern sans-serif wordmark (Inter ExtraBold)
 *   • single accent color (teal) — premium SaaS feel
 *   • subtle gold dot — jewel-like accent
 *   • clean tracked "SYSTEMS" subtitle in slate gray
 *   • transparent background — floats freely, no card
 *
 * The logo PNGs are 1200×525 (wide aspect) rendered from SVG via sharp at
 * 384 DPI density → crisp at any display size.
 *
 * VARIANTS
 * ────────
 *   <PoweredByFaq />                      → stacked floating (sidebar, download)
 *   <PoweredByFaq variant="inline" />     → inline row (portal footer bar)
 *   <PoweredByFaq variant="on-dark" />    → glass pill (login page over photo)
 *
 *   <SidebarFaqCredit collapsed={false} /> → sidebar expanded footer
 *   <SidebarFaqCredit collapsed={true} />  → sidebar collapsed rail (centered)
 *
 * SIZES (3× larger than v4.6.9 per user request "at least 3 times larger")
 *   • default stacked:    logo 220px wide  (was ~48px)
 *   • inline footer:      logo 130px wide  (was ~26px)
 *   • on-dark login pill: logo 180px wide  (was ~44px)
 *   • sidebar collapsed:  logo 90px wide   (was ~40px)
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
  // The login page sits over a dark campus photograph. Uses the DARK logo
  // variant (white→gold gradient wordmark) inside a frosted-glass pill.
  if (variant === 'on-dark') {
    const content = (
      <div
        className={`flex flex-col ${alignClass} gap-2.5 rounded-2xl px-7 py-5 backdrop-blur-md`}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow:
            '0 12px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        <span className={LABEL_CLASS} style={{ color: 'rgba(255,255,255,0.75)' }}>
          powered by
        </span>
        <Image
          src="/faq-logo-dark.png"
          alt="FaQ Systems — Product Owner"
          width={180}
          height={79}
          className="object-contain"
          priority
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
  // "powered by" + logo, all on one line, baseline-aligned. Compact.
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <span className={LABEL_CLASS}>powered by</span>
        <Image
          src="/faq-logo-light.png"
          alt="FaQ Systems"
          width={130}
          height={57}
          className="object-contain"
        />
      </span>
    );
  }

  // ── default variant: stacked, floating, no card ────────────────────────
  // "powered by" tiny label on top, FaQ logo (220px wide) below. Floats on
  // the white sidebar / download background. This is the arvo aesthetic.
  const content = (
    <div className={`flex flex-col ${alignClass} gap-2.5`}>
      <span className={LABEL_CLASS}>powered by</span>
      <Image
        src="/faq-logo-light.png"
        alt="FaQ Systems — Product Owner"
        width={220}
        height={96}
        className="object-contain"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(15, 118, 110, 0.12))' }}
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
 * Expanded 260px sidebar: stacked "powered by" + big FaQ logo (180px wide),
 *   left-aligned, floating on the sidebar's white background.
 *
 * Collapsed 72px rail: just the FaQ logo (90px wide), centered. The logo's
 *   wide aspect ratio means it fits the narrow rail beautifully.
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — centered FaQ logo, no label.
    return (
      <div className="flex justify-center px-2 pb-3 pt-1">
        <Image
          src="/faq-logo-light.png"
          alt="Powered by FaQ Systems"
          width={90}
          height={39}
          className="object-contain"
          style={{ filter: 'drop-shadow(0 1px 3px rgba(15, 118, 110, 0.15))' }}
          title="Powered by FaQ Systems"
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
