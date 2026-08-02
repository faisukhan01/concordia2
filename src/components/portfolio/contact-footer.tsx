"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Github, Linkedin, Mail } from "lucide-react";

const SOCIALS = [
  {
    label: "Email",
    value: "faisu577277@gmail.com",
    href: "mailto:faisu577277@gmail.com",
    Icon: Mail,
    accent: "#22d3ee",
  },
  {
    label: "GitHub",
    value: "github.com/faisukhan01",
    href: "https://github.com/faisukhan01",
    Icon: Github,
    accent: "#a78bfa",
  },
  {
    label: "LinkedIn",
    value: "Let's connect",
    href: "https://www.linkedin.com/",
    Icon: Linkedin,
    accent: "#fb7185",
  },
];

export function Contact() {
  return (
    <section
      id="contact"
      className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
      aria-labelledby="contact-heading"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-card/80 via-card/60 to-card/80 p-6 backdrop-blur-xl sm:p-10 lg:p-14"
      >
        {/* decorative orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #22d3ee55, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #fb718555, transparent 70%)" }}
        />

        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Get in touch
            </p>
            <h2
              id="contact-heading"
              className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            >
              Have a product in mind?
              <br />
              <span className="text-gradient-aurora">Let&apos;s talk.</span>
            </h2>
            <p className="mt-4 text-sm text-muted-foreground sm:text-base">
              I&apos;m currently open to full-time roles and selective freelance
              work. Drop a line and I usually reply within a day.
            </p>

            <a
              href="mailto:faisu577277@gmail.com"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-all hover:opacity-90 sm:px-6 sm:py-3.5"
            >
              <Mail className="h-4 w-4" />
              Start a conversation
            </a>
          </div>

          {/* socials grid */}
          <div className="grid w-full gap-3 sm:grid-cols-1 lg:w-auto lg:grid-cols-1">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110"
                  style={{
                    borderColor: `${s.accent}40`,
                    background: `${s.accent}14`,
                  }}
                >
                  <s.Icon
                    className="h-5 w-5"
                    style={{ color: s.accent }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {s.value}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-background/60 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 via-violet-400 to-rose-400 text-xs font-black text-background">
            F
          </span>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Faisal Khan. Built with Next.js &amp; Tailwind.
          </p>
        </div>
        <div className="flex items-center gap-1">
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
      </div>
    </footer>
  );
}
