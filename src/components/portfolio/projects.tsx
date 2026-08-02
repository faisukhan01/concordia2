"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Github } from "lucide-react";

type Project = {
  title: string;
  category: string;
  description: string;
  tags: string[];
  accent: string;
  href: string;
  repo?: string;
};

const PROJECTS: Project[] = [
  {
    title: "Concordia College Portal",
    category: "Education ERP",
    description:
      "A multi-role campus management platform — admissions, attendance, fees, academics, HR & finance — with a Flutter mobile companion app.",
    tags: ["Next.js", "Prisma", "Flutter", "Socket.IO"],
    accent: "#22d3ee",
    href: "https://github.com/faisukhan01",
    repo: "https://github.com/faisukhan01",
  },
  {
    title: "AI Chatbot Builder",
    category: "AI / SaaS",
    description:
      "A no-code studio for building domain-specific chatbots — prompt templates, RAG over docs, usage analytics, and per-tenant guardrails.",
    tags: ["Next.js", "FastAPI", "LangChain", "PostgreSQL"],
    accent: "#a78bfa",
    href: "https://github.com/faisukhan01",
    repo: "https://github.com/faisukhan01",
  },
  {
    title: "Mobile Fitness Tracker",
    category: "Health & Fitness",
    description:
      "A cross-platform Flutter app with offline-first workouts, progress charts, and Apple Health / Google Fit sync.",
    tags: ["Flutter", "Dart", "Firebase", "Hive"],
    accent: "#fb7185",
    href: "https://github.com/faisukhan01",
    repo: "https://github.com/faisukhan01",
  },
];

function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.55,
        delay: index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/50 p-5 backdrop-blur-xl transition-all duration-500 hover:border-white/20 hover:bg-card/70 sm:p-6"
      style={{
        boxShadow: "0 8px 30px -12px rgba(0,0,0,0.4)",
      }}
    >
      {/* hover accent glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `${project.accent}22` }}
      />

      <div className="mb-4 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] sm:text-[11px]"
          style={{
            color: project.accent,
            background: `${project.accent}14`,
          }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: project.accent }}
          />
          {project.category}
        </span>
        <div className="flex items-center gap-1">
          {project.repo && (
            <a
              href={project.repo}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${project.title} source code`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Github className="h-4 w-4" />
            </a>
          )}
          <a
            href={project.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${project.title} live demo`}
            className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
          >
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>

      <h3 className="text-lg font-bold tracking-tight sm:text-xl">
        {project.title}
      </h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground sm:text-[15px]">
        {project.description}
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <li
            key={tag}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-muted-foreground sm:text-xs"
          >
            {tag}
          </li>
        ))}
      </ul>
    </motion.article>
  );
}

export function Projects() {
  return (
    <section
      id="projects"
      className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
      aria-labelledby="projects-heading"
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
            Selected Work
          </p>
          <h2
            id="projects-heading"
            className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl"
          >
            Things I&apos;ve shipped
          </h2>
        </div>
        <a
          href="https://github.com/faisukhan01"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          See all on GitHub
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((p, i) => (
          <ProjectCard key={p.title} project={p} index={i} />
        ))}
      </div>
    </section>
  );
}
