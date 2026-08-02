"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookIcon } from "./animated-icons";
import { TrendingUp } from "lucide-react";

export function CurrentlyLearning() {
  const [hovered, setHovered] = React.useState(false);

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={() => setHovered(false)}
        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-card/60 to-violet-500/10 p-5 backdrop-blur-xl transition-all duration-500 hover:border-cyan-400/30 sm:p-7"
      >
        {/* animated corner glow */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-50 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: "radial-gradient(circle, #22d3ee55, transparent 70%)" }}
        />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          {/* animated book icon */}
          <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
            <BookIcon hovered={hovered} className="h-full w-full" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300 sm:text-xs">
                Currently Learning
              </p>
            </div>

            {/* full title — no truncation */}
            <h3 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
              Rust &amp; WebAssembly
            </h3>
            {/* full subtitle — no truncation */}
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Systems programming for the browser — shipping near-native
              performance to the web.
            </p>

            {/* progress bar */}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: "62%" }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                />
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-cyan-300">
                <TrendingUp className="h-3.5 w-3.5" />
                62%
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
