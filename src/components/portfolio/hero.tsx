"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDown, Download, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-14 sm:pt-16"
    >
      {/* animated backdrop: grid + floating orbs */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div
          className="absolute -left-24 top-1/4 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #22d3ee, transparent 70%)" }}
        />
        <div
          className="absolute right-0 top-1/3 h-80 w-80 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #a78bfa, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #fb7185, transparent 70%)" }}
        />
        {/* top + bottom fade so the grid blends into the page */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start gap-6 sm:gap-8">
          {/* availability pill */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm sm:text-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Open to full-time &amp; freelance work
          </motion.div>

          {/* name + headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3"
          >
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground sm:text-base">
              Hi, I&apos;m Faisal Khan
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Full-Stack
              <br />
              <span className="text-gradient-aurora">Engineer</span> &amp;
              <br />
              Mobile App Developer
            </h1>
          </motion.div>

          {/* subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl text-base text-muted-foreground sm:text-lg"
          >
            I design and ship polished web &amp; mobile products end-to-end —
            from React/Next.js dashboards to Flutter apps — with a soft spot for
            clean UX and AI-assisted features.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <a
              href="#contact"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-all hover:opacity-90 sm:px-6 sm:py-3.5"
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
              Let&apos;s build something
            </a>
            <a
              href="#stack"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:bg-white/10 sm:px-6 sm:py-3.5"
            >
              <Download className="h-4 w-4" />
              View my stack
            </a>
          </motion.div>

          {/* quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 grid w-full max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6"
          >
            {[
              { value: "30+", label: "Projects shipped" },
              { value: "4+", label: "Years building" },
              { value: "20+", label: "Happy clients" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {s.value}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                  {s.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* scroll hint */}
      <motion.a
        href="#about"
        aria-label="Scroll to about"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-muted-foreground sm:flex"
      >
        <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
        <ArrowDown className="h-4 w-4 animate-bounce" />
      </motion.a>
    </section>
  );
}
