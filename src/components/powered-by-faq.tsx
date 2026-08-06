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
  size?: 'sm' | 'md';
}) {
  const alignClass = align === 'center' ? 'items-center' : 'items-start';

  // ── on-light variant: aesthetic WHITE card for the login page ─────────
  // Sits at the bottom-right corner over the campus photograph (desktop)
  // or below the form (mobile). White background (not transparent) so the
  // teal FaQ logo pops and the design feels premium/aesthetic.
  //
  // size prop:
  //   'sm' (120px) — mobile login (proportional on small screens)
  //   'md' (180px) — desktop bottom-right corner (default)
  if (variant === 'on-light') {
    const logoWidth = size === 'sm' ? 120 : 180;
    const logoHeight = size === 'sm' ? 21 : 32;
    const padX = size === 'sm' ? 'px-5' : 'px-6';
    const padY = size === 'sm' ? 'py-3' : 'py-4';
    const gap = size === 'sm' ? 'gap-1.5' : 'gap-2';
    const labelSize = size === 'sm'
      ? 'text-[9px] tracking-[0.24em]'
      : 'text-[10px] tracking-[0.28em]';
    const content = (
      <div
        className={`flex flex-col ${alignClass} ${gap} ${padX} ${padY} rounded-2xl`}
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
 * Expanded 260px sidebar: stacked "powered by" + refined FaQ logo (140px wide),
 *   left-aligned, floating on the sidebar's white background. Premium and
 *   not dominant — matches the arvo aesthetic.
 *
 * Collapsed 72px rail: just the FaQ logo (64px wide), centered.
 */
export function SidebarFaqCredit({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    // Collapsed rail — centered FaQ logo, no label. Refined 64px width
    // so the logo feels intentional and premium, not stretched.
    return (
      <div className="flex justify-center px-2 pb-3 pt-1">
        <img
          src="/faq-logo-light.png"
          alt="Powered by FaQ Systems"
          width={64}
          height={11}
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
