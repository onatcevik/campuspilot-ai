"use client";

import { motion } from "framer-motion";
import { ArrowRight, Bot, Briefcase, CalendarClock, Globe2, GraduationCap, NotebookPen, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NAV } from "@/components/AppShell";
import { RecommendationList } from "@/components/RecommendationList";
import { Badge, Button, Card, IconBubble, ProgressBar, ProgressRing, SourceLabel, toneBg } from "@/components/ui";
import { askAI, useAiStatus } from "@/lib/ai-client";
import { deadlineState, formatDue, remainingLabel, weeklyProgress } from "@/lib/deadlines";
import { DEMO_STUDENT, OPPORTUNITIES } from "@/lib/demo-data";
import { degreeTotals, termToGraduationDate, validatePlan } from "@/lib/graduation";
import { buildMilestones, fmtDate } from "@/lib/immigration";
import { matchOpportunity } from "@/lib/matching";
import { buildRecommendations, dailyBriefing } from "@/lib/recommendations";
import { useCampus, useNow } from "@/lib/store";

const stateTone = { overdue: "blush", "due-2h": "blush", "due-24h": "butter", upcoming: "powder", done: "sage" } as const;

export default function Dashboard() {
  const state = useCampus();
  const now = useNow();
  const ai = useAiStatus();
  const recs = useMemo(() => buildRecommendations(state, now), [state, now]);
  const briefing = useMemo(() => dailyBriefing(state, now, recs), [state, now, recs]);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const wp = weeklyProgress(state.assignments, now);
  const upcoming = state.assignments.filter((a) => !a.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  const totals = degreeTotals();
  const v = validatePlan(state.plan);
  const milestones = buildMilestones(state.intl).filter((m) => !m.date || new Date(m.date) > now).slice(0, 3);
  const matches = OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, state.career) })).sort((a, b) => b.m.score - a.m.score).slice(0, 3);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  async function enhance() {
    setLoadingAi(true);
    const text = await askAI("daily-briefing", "Write a friendly 3-sentence daily briefing for the student, prioritizing the most urgent items.", {
      student: DEMO_STUDENT, recommendations: recs.map((r) => ({ title: r.title, detail: r.detail, severity: r.severity })),
    });
    setAiBriefing(text);
    setLoadingAi(false);
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-lavender via-paper to-powder p-6 shadow-soft md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blush/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-butter/70 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {DEMO_STUDENT.university}
            </p>
            <h1 className="font-display mt-2 text-4xl font-semibold leading-tight md:text-5xl">
              {greeting}, {DEMO_STUDENT.firstName} 👋
            </h1>
            <p className="mt-2 font-display text-lg italic text-muted">Plan smarter. Stay on track. Graduate with confidence.</p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/70 p-5 backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-lavender-deep" /> Daily briefing</p>
              <SourceLabel kind={aiBriefing ? "gemini" : "rule"} />
            </div>
            <p className="text-sm leading-relaxed text-ink/85">{aiBriefing ?? briefing}</p>
            {ai === "gemini" && !aiBriefing && (
              <Button variant="soft" className="mt-3 !py-1.5 text-xs" onClick={enhance} disabled={loadingAi}>
                <Wand2 size={14} /> {loadingAi ? "Writing…" : "Rewrite with Gemini"}
              </Button>
            )}
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Priorities */}
        <Card className="lg:col-span-2" delay={0.05}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <IconBubble icon={Sparkles} tone="lavender" size="sm" />
              <div>
                <h2 className="font-display text-xl font-semibold">Today&apos;s priorities</h2>
                <p className="text-xs text-muted">Proactive alerts connecting all five modules</p>
              </div>
            </div>
            <span className="hidden sm:block"><SourceLabel kind="rule" /></span>
          </div>
          <RecommendationList recs={recs} limit={6} />
        </Card>

        {/* Weekly progress */}
        <Card delay={0.1} className="flex flex-col">
          <div className="mb-2 flex items-center gap-3">
            <IconBubble icon={NotebookPen} tone="butter" size="sm" />
            <h2 className="font-display text-xl font-semibold">This week</h2>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-4">
            <ProgressRing pct={wp.pct} size={150} stroke={14}>
              <span className="font-display text-4xl font-semibold">{wp.pct}%</span>
              <span className="text-xs text-muted">{wp.done} of {wp.total} done</span>
            </ProgressRing>
          </div>
          <Link href="/study-board" className="mt-2 inline-flex items-center justify-center gap-1 rounded-full bg-butter px-4 py-2 text-sm font-semibold text-butter-deep hover:brightness-95">
            Open Study Board <ArrowRight size={14} />
          </Link>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* Upcoming deadlines */}
        <Card delay={0.12}>
          <div className="mb-3 flex items-center gap-2"><CalendarClock size={18} className="text-powder-deep" /><h3 className="font-semibold">Upcoming deadlines</h3></div>
          <ul className="space-y-2">
            {upcoming.map((a) => {
              const st = deadlineState(a, now);
              return (
                <li key={a.id} className="rounded-2xl bg-cream/80 p-2.5">
                  <p className="truncate text-sm font-semibold">{a.title}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-muted">{formatDue(a.dueDate)}</span>
                    <Badge tone={stateTone[st]}>{remainingLabel(a, now)}</Badge>
                  </div>
                </li>
              );
            })}
            {!upcoming.length && <p className="text-sm text-muted">Nothing open. 🎉</p>}
          </ul>
        </Card>

        {/* Graduation */}
        <Card delay={0.15}>
          <div className="mb-3 flex items-center gap-2"><GraduationCap size={18} className="text-sage-deep" /><h3 className="font-semibold">Graduation progress</h3></div>
          <p className="font-display text-4xl font-semibold">{totals.pct}%</p>
          <p className="text-xs text-muted">{totals.completed} of {totals.required} credits · {totals.inProgress} in progress</p>
          <ProgressBar pct={totals.pct} tone="sage" className="mt-3" />
          <div className="mt-4 space-y-1.5 text-xs">
            <p className="flex justify-between"><span className="text-muted">Target</span><span className="font-semibold">{DEMO_STUDENT.expectedGraduation}</span></p>
            <p className="flex justify-between"><span className="text-muted">Projected</span><span className="font-semibold">{termToGraduationDate(v.projectedTerm)}</span></p>
          </div>
          {v.prereqIssues.length > 0 ? <Badge tone="blush" className="mt-3">{v.prereqIssues.length} prerequisite conflict</Badge> : <Badge tone="sage" className="mt-3">Plan valid</Badge>}
        </Card>

        {/* Immigration */}
        <Card delay={0.18}>
          <div className="mb-3 flex items-center gap-2"><Globe2 size={18} className="text-powder-deep" /><h3 className="font-semibold">Immigration planning</h3></div>
          {state.intl.status !== "F-1" ? (
            <p className="text-sm text-muted">International planning is off for this profile.</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m) => (
                <li key={m.id} className="rounded-2xl bg-powder/50 p-2.5">
                  <p className="text-sm font-semibold leading-snug">{m.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{m.date ? fmtDate(m.date) : "Date set by USCIS"} · {m.kind === "verified-rule" ? "cited rule" : "planning guidance"}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-muted">General information, not legal advice. Confirm with your DSO.</p>
        </Card>

        {/* Career */}
        <Card delay={0.21}>
          <div className="mb-3 flex items-center gap-2"><Briefcase size={18} className="text-blush-deep" /><h3 className="font-semibold">Top career matches</h3></div>
          <ul className="space-y-2">
            {matches.map(({ o, m }) => (
              <li key={o.id} className="flex items-center gap-3 rounded-2xl bg-blush/40 p-2.5">
                <span className="font-display text-lg font-semibold text-blush-deep">{m.score}%</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.role}</p>
                  <p className="truncate text-[11px] text-muted">{o.company}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/career" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blush-deep hover:underline">See all matches <ArrowRight size={12} /></Link>
        </Card>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {NAV.slice(1).map((n, i) => (
          <motion.div key={n.href} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.04 }}>
            <Link href={n.href} className="group flex items-center gap-3 rounded-3xl border border-line bg-paper p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneBg[n.tone]}`}><n.icon size={18} /></span>
              <span className="text-sm font-semibold leading-tight">{n.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted"><Bot size={14} /> Ask the AI Assistant anything about your week, plan, visa timeline, or career.</p>
    </div>
  );
}
