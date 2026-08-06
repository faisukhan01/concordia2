'use client';

import Image from 'next/image';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding badge.
 *
 * Faisal Qayyum (FaQ) Systems is the product owner / developer of the
 * Concordia College platform. This badge credits them on the sign-in
 * page, portal sidebars, the /download app page, and the main footer.
 *
 * DESIGN PHILOSOPHY (v2 — light theme)
 * ─────────────────────────────────────
 * The FaQ logo is a silver + gold/bronze metallic 3D wordmark. Metallic
 * finishes ONLY shine on LIGHT backgrounds — on dark they become a muddy
 * gray blob (the silver+gold gradients need light to reflect). So the
 * badge uses a warm cream/white gradient backdrop with a soft gold-tinted
 * border. This lets the metallic detail of the logo actually be visible.
 *
 * The logo is also a full wordmark ("FaQ" + "SYSTEMS" beneath), so it
 * needs to be rendered LARGE enough to read — minimum 28-30px tall.
 * Anything smaller and "SYSTEMS" becomes illegible.
 *
 * The two brands coexist as:
 *   • Orange = Concordia (the college / customer)
 *   • Silver/Gold metallic = FaQ Systems (the product owner)
 *
 * VARIANTS
 * ────────
 *   <PoweredByFaq />                      → light pill (login page, download)
 *   <PoweredByFaq variant="compact" />    → stacked card for sidebar footer
 *   <PoweredByFaq variant="inline" />     → inline row (no bg) for footer bar
 *
 * The badge is a non-interactive credit (no link) by default. It can be
 * made into a link by passing href.
 */

type FaqVariant = 'default' | 'compact' | 'inline';

// Logo heights per context. The FaQ wordmark needs ≥28px to be legible.
const LOGO_H_DEFAULT = 30; // login page, download page
const LOGO_H_COMPACT = 30; // sidebar expanded — stacked, centered
const LOGO_H_COLLAPSED = 34; // sidebar collapsed rail — logo is the hero
const LOGO_H_INLINE = 22; // portal footer bar — smaller, inline

// Shared light "premium card" style — warm cream gradient + gold border.
// This is what makes the metallic logo actually visible.
const LIGHT_CARD_STYLE = {
  background: 'linear-gradient(135deg, #FFFFFF 0%, #FAF6EE 50%, #F5EFE3 100%)',
  border: '1px solid rgba(212, 175, 110, 0.35)',
  boxShadow:
    '0 1px 2px rgba(120, 90, 40, 0.06), 0 4px 12px rgba(120, 90, 40, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
} as const;

// Soft "Powered by" label — taupe, matching the logo's SYSTEMS text color.
const LABEL_CLASS =
  'text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-[#9B8B7A]';

export function PoweredByFaq({
  variant = 'default',
  className = '',
  href,
}: {
  variant?: FaqVariant;
  className?: string;
  href?: string;
}) {
  // ── Inline variant: no background, just the row. For the portal footer
  //    bar where horizontal space is tight but the background is already light. ──
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className={LABEL_CLASS}>Powered by</span>
        <Image
          src="/faq-systems-logo.png"
          alt="FaQ Systems"
          width={LOGO_H_INLINE}
          height={LOGO_H_INLINE}
          className="object-contain"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.08))' }}
        />
      </span>
    );
  }

  // ── Compact variant: stacked card for the sidebar footer. ──
  //    "POWERED BY" tiny label on top, FaQ logo (30px) centered below.
  //    Full-width on the 260px sidebar. The logo is the hero.
  if (variant === 'compact') {
    return (
      <div
        className={`relative flex flex-col items-center gap-1 overflow-hidden rounded-xl px-3 py-2.5 ${className}`}
        style={LIGHT_CARD_STYLE}
      >
        {/* Subtle gold top-edge gleam */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(212,175,110,0.6), transparent)',
          }}
        />
        <span className={LABEL_CLASS}>Powered by</span>
        <Image
          src="/faq-systems-logo.png"
          alt="FaQ Systems — Product Owner"
          width={LOGO_H_COMPACT}
          height={LOGO_H_COMPACT}
          className="object-contain"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
        />
      </div>
    );
  }

  // ── Default variant: horizontal light pill. For login + download pages. ──
  const content = (
    <>
      {/* Gold top-edge gleam */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(212,175,110,0.7), transparent)',
        }}
      />
      <span className={`relative ${LABEL_CLASS}`}>Powered by</span>
      <Image
        src="/faq-systems-logo.png"
        alt="FaQ Systems — Product Owner"
        width={LOGO_H_DEFAULT}
        height={LOGO_H_DEFAULT}
        className="relative object-contain"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))' }}
      />
    </>
  );

  const baseClass = `group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full px-4 py-2 transition-all duration-200 ${className}`;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} hover:scale-[1.03] hover:shadow-lg`}
        style={LIGHT_CARD_STYLE}
        title="FaQ Systems — Product Owner"
      >
        {content}
      </a>
    );
  }

  return (
    <div className={baseClass} style={LIGHT_CARD_STYLE} title="FaQ Systems — Product Owner">
      {content}
    </div>
  );
}

/**
 * Sidebar footer credit — stacked card on the expanded sidebar, single
 * large logo chip on the collapsed 72px rail. The FaQ logo is the hero
 * in both states (no more muddy dark blob).
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed 72px rail — just the FaQ logo at a readable size in a
    // light rounded chip. The metallic detail is finally visible.
    return (
      <div className="flex justify-center px-2 pb-2">
        <div
          className="grid place-items-center rounded-xl p-1.5"
          style={LIGHT_CARD_STYLE}
          title="Powered by FaQ Systems"
        >
          <Image
            src="/faq-systems-logo.png"
            alt="FaQ Systems"
            width={LOGO_H_COLLAPSED}
            height={LOGO_H_COLLAPSED}
            className="object-contain"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
          />
        </div>
      </div>
    );
  }
  // Expanded 260px sidebar — stacked "POWERED BY" + logo card.
  return (
    <div className="px-2 pb-2 pt-1">
      <PoweredByFaq variant="compact" className="w-full" />
    </div>
  );
}
