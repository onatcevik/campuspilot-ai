"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, CalendarPlus, Check, ExternalLink, GraduationCap, Link2, ShieldQuestion, Sparkles, Target, TrendingUp, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Button, inputCls, SourceLabel } from "@/components/ui";
import { askAIJson, useAiStatus } from "@/lib/ai-client";
import { buildAnalysisContext, deterministicAnalysis, sanitizeAIAnalysis, type CareerAnalysis } from "@/lib/career-analysis";
import { workAuthGuidance } from "@/lib/career-guidance";
import { careerTaskSuggestions, careerTaskToAssignment, defaultDue, isAlreadyOnBoard, type CareerTaskSuggestion } from "@/lib/career-tasks";
import { formatDue, toLocalInputValue } from "@/lib/deadlines";
import { sourceById } from "@/lib/immigration";
import { isStale, STALE_DAYS } from "@/lib/jobs/normalize";
import { MATCH_WEIGHTS, type MatchResult } from "@/lib/matching";
import type { StudentProfile } from "@/lib/profile";
import { useCampus } from "@/lib/store";
import type { CareerOpportunity } from "@/lib/types";

const levelTone = { "full-time": "sage", "part-time": "butter", limited: "blush" } as const;

export function CareerDetailDrawer({ o, m, profile, onClose }: { o: CareerOpportunity; m: MatchResult; profile: StudentProfile; onClose: () => void }) {
  const { assignments, addAssignment, notify } = useCampus();
  const { toast } = useFeedback();
  const ai = useAiStatus();
  const base = useMemo(() => deterministicAnalysis(o, m, profile), [o, m, profile]);
  const [aiResult, setAiResult] = useState<CareerAnalysis | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "failed">("idle");
  const analysis = aiResult ?? base;
  const guidance = useMemo(() => workAuthGuidance(o, profile), [o, profile]);
  const tasks = useMemo(() => careerTaskSuggestions(o, profile, analysis, guidance), [o, profile, analysis, guidance]);
  const [pending, setPending] = useState<{ t: CareerTaskSuggestion; due: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (pending ? setPending(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function runAI() {
    setAiState("loading");
    const raw = await askAIJson("career-analysis", "Explain why this role matches the student and give personalized skill-development steps. Follow the rules in the context exactly. Return JSON with keys summary, strengths, recommendations.", buildAnalysisContext(o, m, profile));
    const clean = raw ? sanitizeAIAnalysis(raw, o, m, profile) : null;
    if (clean) { setAiResult(clean); setAiState("idle"); } else setAiState("failed");
  }

  function confirmAdd() {
    if (!pending) return;
    const created = addAssignment(careerTaskToAssignment(pending.t, o, new Date(pending.due).toISOString()));
    notify(`Career task added: ${created.title}`, `${created.course} · due ${formatDue(created.dueDate)}. Reminders at 24h and 2h.`, "career", `career-${created.id}`);
    toast("Added to Smart Study Board", created.title, "success");
    setPending(null);
  }

  const pts = (w: number, a: number, b: number) => Math.round(b ? (w * a) / b : 0);

  return (
    <motion.div className="fixed inset-0 z-[62] flex justify-end bg-ink/25 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside role="dialog" aria-label={`${o.role} details`} initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} transition={{ type: "spring", damping: 30, stiffness: 280 }}
        className="scrollbar-thin h-full w-full max-w-xl overflow-y-auto bg-cream p-5 shadow-lift md:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">{o.type}</Badge>
              {o.source.kind === "demo" ? <SourceLabel kind="demo" /> : <Badge tone="powder">Live · {o.source.providerLabel}</Badge>}
            </div>
            <h2 className="font-display mt-2 text-2xl font-semibold leading-tight">{o.role}</h2>
            <p className="text-sm text-muted">{o.company} · {o.location}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-line/60" aria-label="Close details"><X size={18} /></button>
        </div>

        {o.source.kind === "live" && (
          <div className="mb-4 rounded-2xl border border-powder-mid bg-powder/60 p-3 text-xs">
            <p>{o.source.postedAt ? `${o.source.postedAtLabel} ${new Date(o.source.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Posting date not provided"} · via {o.source.providerLabel} ({o.source.boardId})</p>
            <p className="mt-0.5">{o.source.deadline ? `Application deadline (from provider): ${new Date(o.source.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "No deadline provided by the job board — check the posting."}</p>
            {isStale(o.source.postedAt) && <p className="mt-1 font-semibold text-blush-deep">Posted over {STALE_DAYS} days ago. Check that it&apos;s still open before you apply.</p>}
            <a href={o.source.applyUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-powder-deep underline">Open original posting <ExternalLink size={12} /></a>
          </div>
        )}

        {/* Score */}
        <section className="card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-2 font-semibold"><Target size={16} className="text-blush-deep" /> Match score</p><SourceLabel kind="rule" /></div>
          {m.insufficientData ? <p className="text-sm text-muted">No skill information in this listing, so a score can&apos;t be calculated.</p> : (
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <p className="font-display text-4xl font-semibold">{m.score}%</p>
              <div className="space-y-0.5 text-xs">
                <p>Required {m.matchedRequired.length}/{o.requiredSkills.length} → <b>{pts(MATCH_WEIGHTS.required, m.matchedRequired.length, o.requiredSkills.length)}</b> pts</p>
                <p>Preferred {o.preferredSkills.length ? `${m.matchedPreferred.length}/${o.preferredSkills.length}` : "(none listed → follows required)"} → <b>{o.preferredSkills.length ? pts(MATCH_WEIGHTS.preferred, m.matchedPreferred.length, o.preferredSkills.length) : pts(MATCH_WEIGHTS.preferred, m.matchedRequired.length, o.requiredSkills.length)}</b> pts</p>
                <p>Target field {m.interestMatch ? "✓" : "✗"} → <b>{m.interestMatch ? MATCH_WEIGHTS.interest : 0}</b> · Location {m.locationMatch ? "✓" : "✗"} → <b>{m.locationMatch ? MATCH_WEIGHTS.location : 0}</b></p>
              </div>
            </div>
          )}
        </section>

        {/* Analysis */}
        <section className="card mb-4 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-lavender-deep" /> Fit analysis</p>
            <div className="flex items-center gap-2">
              <SourceLabel kind={analysis.source === "gemini" ? "gemini" : "rule"} />
              {ai === "gemini" && !aiResult && (
                <Button variant="soft" className="!px-3 !py-1 text-xs" onClick={runAI} disabled={aiState === "loading"}><Wand2 size={13} /> {aiState === "loading" ? "Analyzing…" : "Analyze with Gemini"}</Button>
              )}
            </div>
          </div>
          {ai !== "gemini" && <p className="mb-2 text-[11px] text-muted">Gemini isn&apos;t configured, so this analysis is deterministic. Add GEMINI_API_KEY to enable the AI layer.</p>}
          {aiState === "failed" && <p className="mb-2 rounded-xl bg-butter/70 p-2 text-[11px]">The AI response couldn&apos;t be verified against your data, so the rule-based analysis is shown instead.</p>}
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          {analysis.strengths.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Strengths for this role</p>
              <ul className="space-y-1">{analysis.strengths.map((s) => <li key={s.skill} className="rounded-xl bg-sage/60 px-3 py-1.5 text-xs"><b>{s.skill}</b> · {s.evidence}</li>)}</ul>
            </div>
          )}
          {analysis.gaps.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Skill gaps</p>
              <div className="flex flex-wrap gap-1">{analysis.gaps.map((g) => <Badge key={g.skill} tone={g.importance === "required" ? "blush" : "neutral"}>{g.skill} · {g.importance}</Badge>)}</div>
            </div>
          )}
          {analysis.recommendations.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted"><TrendingUp size={12} /> Skill development plan</p>
              <ul className="space-y-1.5">
                {analysis.recommendations.map((r) => (
                  <li key={r.skill} className="rounded-xl bg-white/80 px-3 py-2 text-xs">
                    <p className="font-semibold">{r.skill}</p>
                    <p className="text-ink/75">{r.action}</p>
                    {r.course && <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sage-deep"><GraduationCap size={11} /> {r.course.code} {r.course.title} · {r.course.when} (from your Graduation Plan)</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="mt-3 space-y-0.5 text-[10px] text-muted">{analysis.caveats.map((c) => <li key={c}>• {c}</li>)}</ul>
        </section>

        {/* Availability */}
        <section className="card mb-4 p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold"><CalendarCheck size={16} className="text-sage-deep" /> Academic availability <span className="text-[11px] font-normal text-muted">from Graduation Planner</span></p>
          <p className="mb-2 text-xs">Projected graduation: <b>{profile.projectedGraduation}</b> (target {profile.targetGraduation})</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.availability.map((a) => <Badge key={a.termId} tone={levelTone[a.level]}>{a.label}: {a.credits} cr · {a.level}</Badge>)}
          </div>
          <p className="mt-2 text-[10px] text-muted">Planning heuristic based on credits you have planned. It isn&apos;t a university rule.</p>
        </section>

        {/* Work authorization */}
        <section className="card mb-4 p-4">
          <p className="mb-1 flex items-center gap-2 font-semibold"><ShieldQuestion size={16} className="text-powder-deep" /> Work authorization</p>
          <p className="text-xs"><b>Listing says:</b> {o.workAuthNote}</p>
          <div className="mt-2 rounded-2xl bg-powder/50 p-3">
            <p className="text-sm font-semibold">{guidance.headline}</p>
            <ul className="mt-1 space-y-1 text-xs text-ink/80">{guidance.points.map((p) => <li key={p}>• {p}</li>)}</ul>
            {guidance.employerQuestion && <p className="mt-2 rounded-xl bg-butter/70 px-2 py-1 text-xs"><b>Still unknown:</b> {guidance.employerQuestion}</p>}
            {guidance.sourceIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {guidance.sourceIds.map((id) => (
                  <a key={id} href={sourceById[id].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-powder-deep hover:underline"><Link2 size={10} /> {sourceById[id].publisher}</a>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted">General information, not legal advice. Confirm with your DSO.</p>
        </section>

        {/* Tasks */}
        <section className="card p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold"><CalendarPlus size={16} className="text-butter-deep" /> Add a task to Smart Study Board</p>
          <ul className="space-y-1.5">
            {tasks.map((t) => {
              const onBoard = isAlreadyOnBoard(assignments, o, t.title);
              return (
                <li key={t.key} className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-xs font-semibold">{t.title}</p><p className="truncate text-[11px] text-muted">{t.estimatedHours}h · {t.notes}</p></div>
                  {onBoard ? <Badge tone="sage"><Check size={11} /> On board</Badge> : (
                    <button onClick={() => setPending({ t, due: toLocalInputValue(defaultDue(t.daysFromNow).toISOString()) })} className="shrink-0 rounded-full bg-butter px-3 py-1 text-[11px] font-semibold text-butter-deep hover:brightness-95">Add…</button>
                  )}
                </li>
              );
            })}
          </ul>
          <AnimatePresence>
            {pending && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-2xl border-2 border-butter-mid bg-butter/60 p-3" role="alertdialog" aria-label="Confirm new Study Board task">
                <p className="text-sm font-semibold">Add this task to your Study Board?</p>
                <p className="mt-1 text-xs"><b>{pending.t.title}</b> · {pending.t.estimatedHours}h</p>
                <label className="mt-2 block text-[11px] font-semibold">Due
                  <input type="datetime-local" className={`${inputCls} mt-1 !py-1.5`} value={pending.due} onChange={(e) => setPending({ ...pending, due: e.target.value })} />
                </label>
                <p className="mt-1 text-[10px] text-muted">This is your own planning date, not an employer deadline.</p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" className="!py-1 text-xs" onClick={() => setPending(null)}>Cancel</Button>
                  <Button className="!py-1 text-xs" onClick={confirmAdd} disabled={!pending.due}>Confirm & add</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </motion.aside>
    </motion.div>
  );
}
