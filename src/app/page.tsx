"use client";

import { motion } from "framer-motion";
import { AlarmClock, ArrowRight, Briefcase, ChevronDown, Globe2, GraduationCap, NotebookPen, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NAV } from "@/components/AppShell";
import { AskCampusPilot } from "@/components/AskCampusPilot";
import { RecommendationList } from "@/components/RecommendationList";
import { Badge, Button, Card, ProgressBar, ProgressRing, SourceLabel, toneBg, type Tone } from "@/components/ui";
import { askAI, useAiStatus } from "@/lib/ai-client";
import { deadlineState, formatDue, remainingLabel, weeklyProgress } from "@/lib/deadlines";
import { DEMO_STUDENT, OPPORTUNITIES } from "@/lib/demo-data";
import { degreeTotals, validatePlan } from "@/lib/graduation";
import { buildMilestones, fmtDate } from "@/lib/immigration";
import { matchOpportunity } from "@/lib/matching";
import { deriveStudentProfile } from "@/lib/profile";
import { buildRecommendations, dailyBriefing } from "@/lib/recommendations";
import { useCampus, useNow } from "@/lib/store";

const stateTone = { overdue: "blush", "due-2h": "blush", "due-24h": "butter", upcoming: "powder", done: "sage" } as const;

function Kpi({ icon: Icon, tone, label, value, sub, href }: { icon: typeof NotebookPen; tone: Tone; label: string; value: string; sub: string; href: string }) {
  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-3 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white hover:shadow-soft">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneBg[tone]}`}><Icon size={18} /></span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="block truncate font-display text-lg font-semibold leading-tight">{value}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </Link>
  );
}

export default function Dashboard() {
  const state = useCampus();
  const now = useNow();
  const ai = useAiStatus();
  const recs = useMemo(() => buildRecommendations(state, now), [state, now]);
  const briefing = useMemo(() => dailyBriefing(state, now, recs), [state, now, recs]);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [allAlerts, setAllAlerts] = useState(false);

  const wp = weeklyProgress(state.assignments, now);
  const open = state.assignments.filter((a) => !a.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = open.find((a) => deadlineState(a, now) !== "overdue") ?? open[0];
  const totals = degreeTotals();
  const v = validatePlan(state.plan);
  const profile = deriveStudentProfile(state);
  const milestones = buildMilestones(state.intl).filter((m) => !m.date || new Date(m.date) > now).slice(0, 2);
  const matches = OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, state.career) })).filter((x) => x.o.workAuth !== "restricted").sort((a, b) => b.m.score - a.m.score).slice(0, 2);
  const shownRecs = allAlerts ? recs : recs.slice(0, 3);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  async function enhance() {
    setLoadingAi(true);
    // Data minimization: only alert titles/details (fictional demo data) — no name or profile.
    const text = await askAI("daily-briefing", "Write a friendly 3-sentence daily briefing for the student, prioritizing the most urgent items. Do not add facts or numbers that are not in the alerts.", {
      alerts: recs.map((r) => ({ title: r.title, detail: r.detail, severity: r.severity })),
    });
    setAiBriefing(text);
    setLoadingAi(false);
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-lavender via-paper to-powder p-5 shadow-soft md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blush/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-sage/80 blur-3xl" />
        <div className="relative grid gap-5 xl:grid-cols-[1.35fr_1fr] xl:items-stretch">
          <div className="flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {DEMO_STUDENT.university}
            </p>
            <h1 className="font-display mt-1.5 text-3xl font-semibold leading-tight md:text-[2.6rem]">
              {greeting}, {DEMO_STUDENT.firstName} 👋
            </h1>
            <p className="mt-1 font-display text-base italic text-muted md:text-lg">Plan smarter. Stay on track. Graduate with confidence.</p>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              <Kpi icon={NotebookPen} tone="butter" label="This week" value={`${wp.done} of ${wp.total}`} sub={`${wp.pct}% of weekly tasks`} href="/study-board" />
              <Kpi icon={GraduationCap} tone="sage" label="Degree progress" value={`${totals.pct}%`} sub={`Projected ${profile.projectedGraduation}`} href="/graduation" />
              <Kpi icon={AlarmClock} tone={next && deadlineState(next, now) !== "upcoming" ? "blush" : "powder"} label="Next deadline"
                value={next ? remainingLabel(next, now) : "All clear"} sub={next ? next.title : "Nothing open"} href="/study-board" />
            </div>
          </div>
          <div className="flex flex-col rounded-3xl border border-white/70 bg-white/70 p-5 backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-lavender-deep" /> Daily briefing</p>
              <SourceLabel kind={aiBriefing ? "gemini" : "rule"} />
            </div>
            <p className="text-sm leading-relaxed text-ink/85">{aiBriefing ?? briefing}</p>
            {ai === "gemini" && !aiBriefing && (
              <Button variant="soft" className="mt-auto self-start !py-1.5 text-xs" onClick={enhance} disabled={loadingAi}>
                <Wand2 size={14} /> {loadingAi ? "Writing…" : "Rewrite with Gemini"}
              </Button>
            )}
          </div>
        </div>
      </motion.section>

      <AskCampusPilot />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's focus */}
        <Card className="lg:col-span-2" delay={0.05}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Today&apos;s focus</h2>
              <p className="text-xs text-muted">The most important alerts across all modules, most urgent first</p>
            </div>
            <span className="hidden sm:block"><SourceLabel kind="rule" /></span>
          </div>
          <RecommendationList recs={shownRecs} />
          {recs.length > 3 && (
            <button onClick={() => setAllAlerts((x) => !x)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-lavender-deep hover:underline" aria-expanded={allAlerts}>
              <ChevronDown size={13} className={`transition ${allAlerts ? "rotate-180" : ""}`} /> {allAlerts ? "Show fewer" : `Show all ${recs.length} alerts`}
            </button>
          )}
        </Card>

        {/* Study this week */}
        <Card delay={0.1} className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Study this week</h2>
            <Link href="/study-board" className="text-xs font-semibold text-butter-deep hover:underline">Board →</Link>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing pct={wp.pct} size={92} stroke={10}>
              <span className="font-display text-2xl font-semibold">{wp.pct}%</span>
            </ProgressRing>
            <p className="text-sm text-muted"><b className="text-ink">{wp.done} of {wp.total}</b> weekly tasks done{wp.total - wp.done ? `. ${wp.total - wp.done} to go.` : ". 🎉"}</p>
          </div>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Up next</p>
          <ul className="space-y-1.5">
            {open.slice(0, 3).map((a) => {
              const st = deadlineState(a, now);
              return (
                <li key={a.id}>
                  <Link href="/study-board" className="flex items-center justify-between gap-2 rounded-xl bg-cream/80 px-3 py-2 transition hover:bg-butter/60">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{a.title}</span><span className="block truncate text-[11px] text-muted">{formatDue(a.dueDate)}</span></span>
                    <Badge tone={stateTone[st]}>{remainingLabel(a, now)}</Badge>
                  </Link>
                </li>
              );
            })}
            {!open.length && <p className="text-sm text-muted">Nothing open. 🎉</p>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Graduation */}
        <Card delay={0.12}>
          <div className="mb-3 flex items-center gap-2"><GraduationCap size={18} className="text-sage-deep" /><h3 className="font-semibold">Graduation</h3></div>
          <div className="flex items-baseline justify-between">
            <p className="font-display text-3xl font-semibold">{totals.pct}%</p>
            <p className="text-xs text-muted">{totals.completed}/{totals.required} credits</p>
          </div>
          <ProgressBar pct={totals.pct} tone="sage" className="mt-2" />
          <p className="mt-3 text-xs"><span className="text-muted">Projected</span> <b>{profile.projectedGraduation}</b> <span className="text-muted">· target {profile.targetGraduation}</span></p>
          <div className="mt-2">{v.prereqIssues.length > 0 ? <Badge tone="blush">{v.prereqIssues.length} prerequisite conflict{v.prereqIssues.length > 1 ? "s" : ""}</Badge> : <Badge tone="sage">Plan valid</Badge>}</div>
          <Link href="/graduation" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sage-deep hover:underline">Open roadmap <ArrowRight size={12} /></Link>
        </Card>

        {/* International */}
        <Card delay={0.15}>
          <div className="mb-3 flex items-center gap-2"><Globe2 size={18} className="text-powder-deep" /><h3 className="font-semibold">International reminders</h3></div>
          {state.intl.status !== "F-1" ? <p className="text-sm text-muted">F-1 planning is off for this profile.</p> : (
            <ul className="space-y-2">
              {milestones.map((m) => (
                <li key={m.id} className="rounded-xl bg-powder/50 px-3 py-2">
                  <p className="text-sm font-semibold leading-snug">{m.title}</p>
                  <p className="text-[11px] text-muted">{m.date ? fmtDate(m.date) : "Date set by USCIS"} · {m.kind === "verified-rule" ? "cited rule" : "planning guidance"}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-muted">General information, not legal advice. Your DSO decides.</p>
          <Link href="/international" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-powder-deep hover:underline">Open timeline <ArrowRight size={12} /></Link>
        </Card>

        {/* Career */}
        <Card delay={0.18}>
          <div className="mb-3 flex items-center gap-2"><Briefcase size={18} className="text-blush-deep" /><h3 className="font-semibold">Internship matches</h3></div>
          <ul className="space-y-2">
            {matches.map(({ o, m }) => (
              <li key={o.id} className="flex items-center gap-3 rounded-xl bg-blush/40 px-3 py-2">
                <span className="font-display text-lg font-semibold text-blush-deep">{m.score}%</span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{o.role}</span><span className="block truncate text-[11px] text-muted">{o.company}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] text-muted">Fictional demo listings · deterministic skill-match scores.</p>
          <Link href="/career" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blush-deep hover:underline">See all matches <ArrowRight size={12} /></Link>
        </Card>
      </div>

      {/* Quick access */}
      <nav aria-label="Quick access" className="flex flex-wrap gap-2">
        {NAV.slice(1).map((n) => (
          <Link key={n.href} href={n.href} className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-2 text-xs font-semibold shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${toneBg[n.tone]}`}><n.icon size={13} /></span>{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
