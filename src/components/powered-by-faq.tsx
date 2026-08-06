'use client';

import Image from 'next/image';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding badge.
 *
 * Faisal Qayyum (FaQ) Systems is the product owner / developer of the
 * Concordia College platform. This badge credits them on the sign-in
 * page, portal sidebars, the /download app page, and the main footer.
 *
 * DESIGN PHILOSOPHY
 * ─────────────────
 * The FaQ logo is a silver + gold/bronze metallic 3D wordmark. To make
 * the metallic pop, the badge uses a dark charcoal gradient backdrop
 * with a subtle gold-tinted ring. This complements (never competes with)
 * Concordia's orange brand colour — the two coexist as:
 *   • Orange = Concordia (the college / customer)
 *   • Silver/Gold metallic = FaQ Systems (the product owner)
 *
 * VARIANTS
 * ────────
 *   <PoweredByFaq />                      → default pill (login page, footer)
 *   <PoweredByFaq variant="compact" />    → thin strip for sidebar footer
 *   <PoweredByFaq variant="inline" />     → inline row (no bg) for tight spots
 *   <PoweredByFaq variant="dark" />       → on already-dark backgrounds
 *
 * The badge is a non-interactive credit (no link) by default. It can be
 * made into a link by passing href.
 */

type FaqVariant = 'default' | 'compact' | 'inline' | 'dark';

const FAQ_LOGO_H = 22; // px — logo image height inside the badge (aspect ~1:1)

export function PoweredByFaq({
  variant = 'default',
  className = '',
  href,
}: {
  variant?: FaqVariant;
  className?: string;
  href?: string;
}) {
  // ── Inline variant: no background, just the row. For very tight spots. ──
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-gray-400">
          Powered by
        </span>
        <Image
          src="/faq-systems-logo.png"
          alt="FaQ Systems"
          width={FAQ_LOGO_H}
          height={FAQ_LOGO_H}
          className="object-contain"
        />
      </span>
    );
  }

  // ── Compact variant: thin strip for the sidebar footer. Fits 260px sidebar
  //    AND collapses gracefully to the 72px rail (shows just the logo mark). ──
  if (variant === 'compact') {
    return (
      <div
        className={`relative flex items-center justify-center gap-1.5 overflow-hidden rounded-lg px-2 py-1.5 ${className}`}
        style={{
          background:
            'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 50%, #1F1F1F 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.15)',
        }}
      >
        {/* Subtle gold top-edge gleam */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(212,175,110,0.45), transparent)',
          }}
        />
        <span className="text-[8px] font-semibold uppercase leading-none tracking-[0.16em] text-gray-300">
          Powered by
        </span>
        <Image
          src="/faq-systems-logo.png"
          alt="FaQ Systems"
          width={16}
          height={16}
          className="object-contain"
        />
      </div>
    );
  }

  // ── Default + dark variants: full pill badge. ──
  // dark variant drops the heavy bg (assumes already-dark parent) and uses
  // a translucent overlay instead.
  const isDark = variant === 'dark';
  const bgStyle = isDark
    ? {
        background:
          'linear-gradient(135deg, rgba(26,26,26,0.85) 0%, rgba(42,42,42,0.85) 50%, rgba(31,31,31,0.85) 100%)',
        backdropFilter: 'blur(8px)',
      }
    : {
        background:
          'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 50%, #1F1F1F 100%)',
      };

  const content = (
    <>
      {/* Gold top-edge gleam — echoes the logo's gold accent */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(212,175,110,0.55), transparent)',
        }}
      />
      {/* Faint inner gold ring */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(212,175,110,0.18)' }}
      />
      <span className="relative text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-gray-300">
        Powered by
      </span>
      <Image
        src="/faq-systems-logo.png"
        alt="FaQ Systems — Product Owner"
        width={FAQ_LOGO_H}
        height={FAQ_LOGO_H}
        className="relative object-contain"
      />
    </>
  );

  const baseClass = `group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-3.5 py-1.5 transition-all duration-200 ${className}`;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} hover:scale-[1.03] hover:shadow-lg hover:shadow-amber-900/20`}
        style={bgStyle}
        title="FaQ Systems — Product Owner"
      >
        {content}
      </a>
    );
  }

  return (
    <div className={baseClass} style={bgStyle} title="FaQ Systems — Product Owner">
      {content}
    </div>
  );
}

/**
 * Compact sidebar footer credit — wraps the compact variant with the
 * correct spacing for the sidebar's bottom edge. Renders just the FaQ
 * mark when the sidebar is collapsed (72px rail).
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — show just the FaQ mark in a tiny dark chip
    return (
      <div className="flex justify-center px-2 pb-1">
        <div
          className="grid place-items-center rounded-md p-1"
          style={{
            background:
              'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 50%, #1F1F1F 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
          title="Powered by FaQ Systems"
        >
          <Image
            src="/faq-systems-logo.png"
            alt="FaQ Systems"
            width={18}
            height={18}
            className="object-contain"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="px-2 pb-1">
      <PoweredByFaq variant="compact" className="w-full" />
    </div>
  );
}
