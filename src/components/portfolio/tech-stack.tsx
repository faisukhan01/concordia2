"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FrontendIcon,
  BackendIcon,
  AIIcon,
  DatabaseIcon,
  MobileIcon,
} from "./animated-icons";

type Category = {
  key: string;
  title: string;
  count: number;
  blurb: string;
  accent: string;
  accentSoft: string;
  Icon: React.ComponentType<{ hovered: boolean; className?: string }>;
  techs: string[];
};

const CATEGORIES: Category[] = [
  {
    key: "frontend",
    title: "Frontend",
    count: 8,
    blurb: "Pixel-perfect, accessible interfaces",
    accent: "#22d3ee",
    accentSoft: "rgba(34, 211, 238, 0.12)",
    Icon: FrontendIcon,
    techs: [
      "React.js",
      "Next.js",
      "Three.js",
      "JavaScript",
      "TypeScript",
      "HTML5",
      "CSS3",
      "Tailwind CSS",
    ],
  },
  {
    key: "backend",
    title: "Backend",
    count: 5,
    blurb: "APIs that scale and stay reliable",
    accent: "#34d399",
    accentSoft: "rgba(52, 211, 153, 0.12)",
    Icon: BackendIcon,
    techs: ["Node.js", "Express.js", "FastAPI", "Django", "REST API Design"],
  },
  {
    key: "ai",
    title: "AI & Tools",
    count: 6,
    blurb: "Shipping LLM-powered features",
    accent: "#a78bfa",
    accentSoft: "rgba(167, 139, 250, 0.12)",
    Icon: AIIcon,
    techs: [
      "Prompt Engineering",
      "GPT Integration",
      "Claude",
      "Gemini",
      "Git",
      "GitHub",
    ],
  },
  {
    key: "database",
    title: "Database",
    count: 4,
    blurb: "Models that fit the problem",
    accent: "#fbbf24",
    accentSoft: "rgba(251, 191, 36, 0.12)",
    Icon: DatabaseIcon,
    techs: ["PostgreSQL", "MongoDB", "Prisma ORM", "Redis"],
  },
  {
    key: "mobile",
    title: "Mobile Dev",
    count: 4,
    blurb: "Cross-platform apps that feel native",
    accent: "#fb7185",
    accentSoft: "rgba(251, 113, 133, 0.12)",
    Icon: MobileIcon,
    techs: ["Flutter", "Dart", "React Native", "Firebase"],
  },
  {
    key: "practices",
    title: "Practices",
    count: 5,
    blurb: "How I ship with teams",
    accent: "#60a5fa",
    accentSoft: "rgba(96, 165, 250, 0.12)",
    Icon: BackendIcon,
    techs: [
      "Agile / Scrum",
      "Project Scoping",
      "Stakeholder Comms",
      "Code Review",
      "CI / CD",
    ],
  },
];

function TechCard({ category, index }: { category: Category; index: number }) {
  const [hovered, setHovered] = React.useState(false);
  const { Icon } = category;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.55,
        delay: index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-5 outline-none backdrop-blur-xl transition-all duration-500 hover:border-white/20 hover:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
      style={{
        boxShadow: hovered
          ? `0 24px 60px -20px ${category.accent}55, 0 0 0 1px ${category.accent}22`
          : "0 8px 30px -12px rgba(0,0,0,0.4)",
      }}
      aria-label={`${category.title} — ${category.count} technologies`}
    >
      {/* top accent line that grows on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${category.accent}, transparent)`,
        }}
      />
      {/* soft corner glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: category.accentSoft }}
      />

      <div className="flex items-start gap-4">
        {/* animated icon — generous size on all viewports */}
        <div className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
          <Icon hovered={hovered} className="h-full w-full" />
        </div>

        <div className="min-w-0 flex-1">
          {/* count label — small, tracked, accent-colored */}
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-xs"
            style={{ color: category.accent }}
          >
            {String(category.count).padStart(2, "0")} Technologies
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
            {category.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            {category.blurb}
          </p>
        </div>
      </div>

      {/* tech chips — wrap naturally, never truncate */}
      <ul className="mt-5 flex flex-wrap gap-2">
        {category.techs.map((tech) => (
          <li
            key={tech}
            className="rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight transition-colors duration-300 sm:px-3 sm:py-1.5 sm:text-xs"
            style={{
              borderColor: `${category.accent}33`,
              color: "oklch(0.86 0.005 260)",
              background: category.accentSoft,
            }}
          >
            <span
              aria-hidden
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: category.accent }}
            />
            {tech}
          </li>
        ))}
      </ul>
    </motion.article>
  );
}

export function TechStackSection() {
  return (
    <section
      id="stack"
      className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
      aria-labelledby="stack-heading"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-10 flex flex-col gap-3 sm:mb-14 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Tech Stack
          </p>
          <h2
            id="stack-heading"
            className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl"
          >
            Tools I build with
          </h2>
        </div>
        <p className="max-w-sm text-sm text-muted-foreground sm:text-base">
          A pragmatic toolkit honed across production web &amp; mobile apps —
          chosen for reliability, not hype.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((category, i) => (
          <TechCard key={category.key} category={category} index={i} />
        ))}
      </div>
    </section>
  );
}
