"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Github, Linkedin, Mail, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "About", href: "#about" },
  { label: "Stack", href: "#stack" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "#contact" },
];

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-background/70 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <a
          href="#top"
          className="group flex items-center gap-2.5"
          aria-label="Faisal Khan — home"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-violet-400 to-rose-400 text-sm font-black text-background shadow-lg">
            F
            <span
              aria-hidden
              className="absolute inset-0 rounded-lg opacity-0 blur transition-opacity duration-300 group-hover:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, #22d3ee, #a78bfa, #fb7185)",
              }}
            />
          </span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            Faisal Khan
          </span>
        </a>

        {/* desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href="https://github.com/faisukhan01"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href="https://www.linkedin.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Linkedin className="h-4 w-4" />
          </a>
          <a
            href="mailto:faisu577277@gmail.com"
            aria-label="Email"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Mail className="h-4 w-4" />
          </a>
        </div>

        {/* mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-foreground md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* mobile menu */}
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden border-t border-white/10 bg-background/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-4">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3">
              <a
                href="https://github.com/faisukhan01"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="rounded-lg p-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="https://www.linkedin.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="rounded-lg p-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href="mailto:faisu577277@gmail.com"
                aria-label="Email"
                className="rounded-lg p-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </header>
  );
}
