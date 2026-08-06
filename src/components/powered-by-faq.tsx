'use client';

import Image from 'next/image';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding credit.
 *
 * Faisal Qayyum (FaQ) Systems is the product owner / developer of the
 * Concordia College platform.
 *
 * DESIGN PHILOSOPHY (v3 — "arvo" aesthetic)
 * ──────────────────────────────────────────
 * Inspired by the "powered by arvo" credit pattern used by premium SaaS
 * products (Stripe, Vercel, Notion, Arvo):
 *
 *   1. NO background card/box/border. The credit FLOATS freely on the
 *      page background. A card makes it look like an ad; floating makes
 *      it look like a native system footer.
 *   2. STACKED vertical layout: tiny "powered by" label on top, the FaQ
 *      logo BIG below it. The logo is the hero.
 *   3. MASSIVE size differential: "powered by" is 10px gray, the logo is
 *      48px+. The FaQ wordmark is a detailed metallic 3D render with a
 *      "SYSTEMS" subtext — it needs ≥44px to be legible. At 30px (v4.6.9)
 *      it was still too small.
 *   4. The metallic silver+gold shines on WHITE backgrounds. No dark
 *      cards, no cream tints — just clean white/negative space.
 *
 * The only exception is the login page, which sits over a dark campus
 * photograph. There — and ONLY there — a minimal white pill provides
 * contrast so the logo is visible against the dark photo.
 *
 * VARIANTS
 * ────────
 *   <PoweredByFaq />                      → stacked floating (sidebar, download)
 *   <PoweredByFaq variant="inline" />     → inline row (portal footer bar)
 *   <PoweredByFaq variant="on-dark" />    → white pill (login page over photo)
 */

type FaqVariant = 'default' | 'inline' | 'on-dark';

// Logo heights. The FaQ wordmark (metallic "FaQ" + "SYSTEMS" subtext)
// needs ≥44px for both parts to be legible.
const LOGO_H_DEFAULT = 48;  // sidebar expanded, download page — the hero
const LOGO_H_COLLAPSED = 40; // sidebar collapsed rail
const LOGO_H_INLINE = 26;   // portal footer bar — horizontal, smaller
const LOGO_H_ON_DARK = 44;  // login page white pill

// "powered by" label — tiny, gray, letter-spaced. Subtle attribution.
const LABEL_BASE =
  'text-[10px] font-medium uppercase leading-none tracking-[0.2em] text-gray-400';

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

  // ── on-dark variant: minimal white pill for the login page (dark photo bg) ──
  // This is the ONLY variant with a background, because the login page sits
  // over a dark campus photograph where a floating logo would be invisible.
  if (variant === 'on-dark') {
    const content = (
      <div className={`flex flex-col ${alignClass} gap-1`}>
        <span className={LABEL_BASE} style={{ color: 'rgba(255,255,255,0.65)' }}>
          powered by
        </span>
        <div className="rounded-lg bg-white px-2.5 py-1.5 shadow-md shadow-black/20">
          <Image
            src="/faq-systems-logo.png"
            alt="FaQ Systems — Product Owner"
            width={LOGO_H_ON_DARK}
            height={LOGO_H_ON_DARK}
            className="object-contain"
          />
        </div>
      </div>
    );
    if (href) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-block ${className}`} title="FaQ Systems — Product Owner">
          {content}
        </a>
      );
    }
    return <div className={`inline-block ${className}`} title="FaQ Systems — Product Owner">{content}</div>;
  }

  // ── inline variant: horizontal row, no background. For the portal footer
  //    bar where horizontal space is tight. ──
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className={LABEL_BASE}>powered by</span>
        <Image
          src="/faq-systems-logo.png"
          alt="FaQ Systems"
          width={LOGO_H_INLINE}
          height={LOGO_H_INLINE}
          className="object-contain"
        />
      </span>
    );
  }

  // ── default variant: stacked, floating, no background. ──
  // "powered by" tiny gray label on top, FaQ logo (48px) below.
  // This is the arvo aesthetic — floats on white, logo is the hero.
  const content = (
    <div className={`flex flex-col ${alignClass} gap-1`}>
      <span className={LABEL_BASE}>powered by</span>
      <Image
        src="/faq-systems-logo.png"
        alt="FaQ Systems — Product Owner"
        width={LOGO_H_DEFAULT}
        height={LOGO_H_DEFAULT}
        className="object-contain"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))' }}
      />
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-block transition-transform hover:scale-[1.02] ${className}`} title="FaQ Systems — Product Owner">
        {content}
      </a>
    );
  }
  return <div className={`inline-block ${className}`} title="FaQ Systems — Product Owner">{content}</div>;
}

/**
 * Sidebar footer credit — floating, no card.
 * Expanded 260px sidebar: stacked "powered by" + 48px logo, left-aligned.
 * Collapsed 72px rail: just the 40px FaQ logo, centered.
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — just the FaQ logo at a readable size, centered.
    // No card. Floats on the sidebar's white background.
    return (
      <div className="flex justify-center px-2 pb-3 pt-1">
        <Image
          src="/faq-systems-logo.png"
          alt="FaQ Systems"
          width={LOGO_H_COLLAPSED}
          height={LOGO_H_COLLAPSED}
          className="object-contain"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }}
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
