'use client';

/**
 * "Powered by FaQ SYSTEMS" — product-owner branding credit.
 *
 * ──────────────────────────────────────────────────────────────────────
 * v8 — REFINED SIDEBAR + MOBILE LOGIN + FOOTER REMOVAL
 * ──────────────────────────────────────────────────────────────────────
 *
 * Changes in v8 (user's 9th iteration):
 *   • Sidebar expanded logo REDUCED 180px → 140px (even more premium).
 *   • Sidebar collapsed logo REDUCED 84px → 64px (refined rail credit).
 *   • NEW `size` prop on the `on-light` variant: 'sm' (120px, mobile) |
 *     'md' (180px, desktop default). Mobile login uses 'sm' so the FaQ
 *     card is proportional on small screens.
 *   • Portal footer `inline` variant kept (but REMOVED from role-portal.tsx
 *     footer per user request — "when user scroll down in the footer there
 *     is also the logo added so please from here remove it").
 *
 * The logo is a real PNG file served directly via a native <img> tag
 * (NOT next/image, which would convert it to webp/avif). This guarantees:
 *   • The browser receives the actual .png file
 *   • Right-click → "Save image as" downloads a .png
 *   • The logo renders identically everywhere
 *
 * LOGO DESIGN (matches the user's real "FaQ Systems" brand):
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
 * VARIANTS
 *   <PoweredByFaq />                      → stacked floating (sidebar, download)
 *   <PoweredByFaq variant="inline" />     → inline row (portal footer bar)
 *   <PoweredByFaq variant="on-light" />   → white aesthetic card (login page)
 *   <SidebarFaqCredit collapsed={false} /> → sidebar expanded footer
 *   <SidebarFaqCredit collapsed={true} />  → sidebar collapsed rail (centered)
 */

type FaqVariant = 'default' | 'inline' | 'on-light';

// ── "powered by" label — tiny slate, uppercase, wide-tracked ──────────────
const LABEL_CLASS =
  'text-[10px] font-semibold uppercase leading-none tracking-[0.28em] text-slate-400';

export function PoweredByFaq({
  variant = 'default',
  className = '',
  href,
  align = 'left',
  size = 'md',
}: {
  variant?: FaqVariant;
  className?: string;
  href?: string;
  align?: 'left' | 'center';
  size?: 'xs' | 'sm' | 'md';
}) {
  const alignClass = align === 'center' ? 'items-center' : 'items-start';

  // ── on-light variant: aesthetic WHITE card for the login page ─────────
  // Sits at the bottom-right corner over the campus photograph (desktop)
  // or below the form (mobile). White background (not transparent) so the
  // teal FaQ logo pops and the design feels premium/aesthetic.
  //
  // size prop:
  //   'xs' (92px)  — compact login corner credit (refined, less dominant)
  //   'sm' (120px) — mobile login (proportional on small screens)
  //   'md' (180px) — desktop bottom-right corner (legacy default)
  if (variant === 'on-light') {
    const logoWidth = size === 'xs' ? 92 : size === 'sm' ? 120 : 180;
    const logoHeight = size === 'xs' ? 16 : size === 'sm' ? 21 : 32;
    const padX = size === 'xs' ? 'px-4' : size === 'sm' ? 'px-5' : 'px-6';
    const padY = size === 'xs' ? 'py-2.5' : size === 'sm' ? 'py-3' : 'py-4';
    const gap = size === 'xs' ? 'gap-1' : size === 'sm' ? 'gap-1.5' : 'gap-2';
    const labelSize = size === 'xs'
      ? 'text-[8px] tracking-[0.22em]'
      : size === 'sm'
        ? 'text-[9px] tracking-[0.24em]'
        : 'text-[10px] tracking-[0.28em]';
    const radius = size === 'xs' ? 'rounded-xl' : 'rounded-2xl';
    const content = (
      <div
        className={`flex flex-col ${alignClass} ${gap} ${padX} ${padY} ${radius}`}
        style={{
          background: 'rgba(255, 255, 255, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.9)',
          boxShadow:
            '0 16px 48px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <span className={`${LABEL_CLASS} ${labelSize}`}>powered by</span>
        {/* Light logo variant — teal "FaQ" pops on the white card */}
        <img
          src="/faq-logo-light.png"
          alt="FaQ Systems — Product Owner"
          width={logoWidth}
          height={logoHeight}
          loading="eager"
          decoding="async"
          style={{ height: 'auto', display: 'block' }}
        />
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
  // "powered by" tiny label on top, FaQ logo (140px wide — refined) below.
  // Floats on the white sidebar / download background. This is the arvo
  // aesthetic — premium and not dominant.
  const content = (
    <div className={`flex flex-col ${alignClass} gap-1.5`}>
      <span className={LABEL_CLASS}>powered by</span>
      <img
        src="/faq-logo-light.png"
        alt="FaQ Systems — Product Owner"
        width={140}
        height={25}
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
 * v11 — BALANCED (user: "make sure it must be large enough to clearly visible"):
 *   v9 (88px) was too large; v10 (56px) was too small/hard to read.
 *   • Expanded 260px sidebar: 74px FaQ logo + 8px "POWERED BY" label,
 *     single-line, full opacity (1.0) so the teal logo is crisp and
 *     legible. Subordinate to nav but clearly readable.
 *   • Collapsed 72px rail: 40px centered FaQ mark, opacity 0.85 — small
 *     but clearly visible (not the barely-there 0.55 of v10).
 *
 * NOTE: This is intentionally independent of the shared `PoweredByFaq`
 * default variant (140px) so the download-page footer keeps its size
 * while the sidebar credit stays balanced and legible.
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — small but clearly visible centered FaQ mark.
    return (
      <div className="flex justify-center px-2 pb-2.5 pt-1">
        <img
          src="/faq-logo-light.png"
          alt="Powered by FaQ Systems"
          width={40}
          height={7}
          loading="lazy"
          decoding="async"
          title="Powered by FaQ Systems"
          style={{
            height: 'auto',
            display: 'block',
            opacity: 0.85,
            filter: 'drop-shadow(0 1px 3px rgba(10, 26, 58, 0.14))',
          }}
        />
      </div>
    );
  }

  // Expanded sidebar — single-line: "POWERED BY" + 74px FaQ logo. Small
  // enough to stay subordinate to nav, large enough to be clearly legible.
  return (
    <div className="px-4 pb-3 pt-2.5 border-t border-black/[0.04]">
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-semibold uppercase leading-none tracking-[0.22em] text-gray-400 shrink-0">
          powered by
        </span>
        <img
          src="/faq-logo-light.png"
          alt="FaQ Systems"
          width={74}
          height={13}
          loading="lazy"
          decoding="async"
          title="FaQ Systems — Product Owner"
          style={{
            height: 'auto',
            display: 'block',
            filter: 'drop-shadow(0 1px 3px rgba(10, 26, 58, 0.14))',
          }}
        />
      </div>
    </div>
  );
}
