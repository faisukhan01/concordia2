"use client";

import { motion } from "framer-motion";
import { Code2, Layers, Rocket } from "lucide-react";

const HIGHLIGHTS = [
  {
    Icon: Code2,
    title: "End-to-end ownership",
    body: "From schema design to the last button animation — I ship the whole feature, not just a slice.",
    accent: "#22d3ee",
  },
  {
    Icon: Layers,
    title: "Web + mobile, one mind",
    body: "React/Next.js for the web, Flutter & React Native for mobile — shared product intuition across surfaces.",
    accent: "#a78bfa",
  },
  {
    Icon: Rocket,
    title: "AI-assisted shipping",
    body: "I integrate LLMs and prompt pipelines into real products — not demos — with safety and cost in mind.",
    accent: "#fb7185",
  },
];

export function About() {
  return (
    <section
      id="about"
      className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
      aria-labelledby="about-heading"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16"
      >
        {/* left — heading + bio */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            About
          </p>
          <h2
            id="about-heading"
            className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl"
          >
            I turn ambiguous ideas into shipped products.
          </h2>
          <div className="mt-5 space-y-4 text-sm text-muted-foreground sm:text-base">
            <p>
              I&apos;m a full-stack software engineer and mobile app developer
              with a track record of taking products from a blank Figma file to
              production — across education, fintech, and internal-tooling
              domains.
            </p>
            <p>
              My sweet spot is the intersection of polished frontend craft and
              pragmatic backend architecture. I care about accessibility,
              performance budgets, and the small interaction details that make
              software feel intentional.
            </p>
            <p>
              Lately I&apos;ve been doubling down on AI-integrated features —
              wiring LLMs behind real UX guardrails instead of gimmicks.
            </p>
          </div>
        </div>

        {/* right — highlight cards */}
        <div className="grid gap-4 sm:grid-cols-1">
          {HIGHLIGHTS.map((h, i) => (
            <motion.div
              key={h.title}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.55,
                delay: i * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group relative flex items-start gap-4 overflow-hidden rounded-2xl border border-white/10 bg-card/50 p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-card/70 sm:p-6"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: `${h.accent}22` }}
              />
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12"
                style={{
                  borderColor: `${h.accent}40`,
                  background: `${h.accent}14`,
                }}
              >
                <h.Icon
                  className="h-5 w-5 sm:h-6 sm:w-6"
                  style={{ color: h.accent }}
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight sm:text-lg">
                  {h.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{h.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
