"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { Severity } from "@/lib/types";

export type Tone = "lavender" | "sage" | "powder" | "blush" | "butter" | "neutral";

export const toneBg: Record<Tone, string> = {
  lavender: "bg-lavender text-lavender-deep",
  sage: "bg-sage text-sage-deep",
  powder: "bg-powder text-powder-deep",
  blush: "bg-blush text-blush-deep",
  butter: "bg-butter text-butter-deep",
  neutral: "bg-line/60 text-muted",
};

export const severityTone: Record<Severity, Tone> = {
  critical: "blush",
  warning: "butter",
  info: "powder",
  success: "sage",
};

export function Card({ className = "", children, delay = 0 }: { className?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className={`card p-5 ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${toneBg[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function IconBubble({ icon: Icon, tone, size = "md" }: { icon: LucideIcon; tone: Tone; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const i = size === "sm" ? 15 : size === "lg" ? 22 : 18;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl ${s} ${toneBg[tone]}`}>
      <Icon size={i} strokeWidth={2.2} />
    </span>
  );
}

export function PageHeader({ eyebrow, title, subtitle, icon, tone, children }: {
  eyebrow: string; title: string; subtitle: string; icon: LucideIcon; tone: Tone; children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex items-start gap-4">
        <IconBubble icon={icon} tone={tone} size="lg" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
          <h1 className="font-display text-3xl font-semibold md:text-4xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ProgressRing({ pct, size = 120, stroke = 12, color = "var(--color-sage-deep)", track = "var(--color-sage)", children }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * Math.min(100, pct)) / 100 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ pct, tone = "sage", className = "" }: { pct: number; tone?: Tone; className?: string }) {
  const fill: Record<Tone, string> = {
    lavender: "bg-lavender-deep", sage: "bg-sage-deep", powder: "bg-powder-deep", blush: "bg-blush-deep", butter: "bg-butter-deep", neutral: "bg-muted",
  };
  const track: Record<Tone, string> = {
    lavender: "bg-lavender", sage: "bg-sage", powder: "bg-powder", blush: "bg-blush", butter: "bg-butter", neutral: "bg-line",
  };
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full ${track[tone]} ${className}`}>
      <motion.div className={`h-full rounded-full ${fill[tone]}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-ink text-white hover:bg-ink/85 shadow-soft",
    soft: "bg-lavender text-lavender-deep hover:bg-lavender-mid/70",
    ghost: "bg-transparent text-ink hover:bg-line/60 border border-line",
    danger: "bg-blush text-blush-deep hover:bg-blush-mid/70",
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function SourceLabel({ kind }: { kind: "demo" | "rule" | "gemini" | "verified" | "guidance" | "simulated" }) {
  const map = {
    demo: { tone: "neutral" as Tone, text: "Fictional demo data" },
    rule: { tone: "powder" as Tone, text: "Rule-based (deterministic)" },
    gemini: { tone: "lavender" as Tone, text: "Generated by Gemini" },
    verified: { tone: "sage" as Tone, text: "Cited official rule" },
    guidance: { tone: "butter" as Tone, text: "Planning guidance" },
    simulated: { tone: "neutral" as Tone, text: "Simulated integration" },
  }[kind];
  return <Badge tone={map.tone}>{map.text}</Badge>;
}

export const inputCls =
  "w-full rounded-2xl border border-line bg-white/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-lavender-deep focus:ring-4 focus:ring-lavender";
