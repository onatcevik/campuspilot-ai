"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, GraduationCap, Link2, Mail, Rocket, Scale, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Button, Card, IconBubble, PageHeader, ProgressBar, ProgressRing, SourceLabel } from "@/components/ui";
import { COMPLETED_COURSE_IDS, CURRENT_TERM_LABEL, DEMO_STUDENT, FUTURE_TERMS, INITIAL_PLAN, IN_PROGRESS_COURSE_IDS } from "@/lib/demo-data";
import { advisorEmail } from "@/lib/emails";
import {
  buildScenarioPlan, courseById, degreeTotals, dependentsOf, prereqsOf, requirementProgress, SCENARIOS,
  termById, termLimit, termToGraduationDate, validatePlan,
} from "@/lib/graduation";
import { useCampus } from "@/lib/store";

const catTone = { Core: "lavender", "Math & Science": "powder", "General Education": "butter", Elective: "sage", Capstone: "blush" } as const;

export default function GraduationPlanner() {
  const { plan, setCourseTerm, applyPlan, notify } = useCampus();
  const { openDraft, toast } = useFeedback();
  const [focus, setFocus] = useState<string | null>("SWE410");
  const v = useMemo(() => validatePlan(plan), [plan]);
  const totals = degreeTotals();
  const reqs = requirementProgress();
  const scenarios = useMemo(() => SCENARIOS.map((s) => ({ s, plan: buildScenarioPlan(s), })).map((x) => ({ ...x, v: validatePlan(x.plan) })), []);
  const target = termById[DEMO_STUDENT.targetTermId];
  const late = v.projectedTerm && v.projectedTerm.order > target.order;
  const issueCourses = new Set(v.prereqIssues.map((i) => i.courseId));
  const visibleTerms = FUTURE_TERMS.filter((t) => t.order <= Math.max(4, v.projectedTerm?.order ?? 4, ...v.semesters.filter((s) => s.courseIds.length).map((s) => termById[s.termId].order)));

  const status = v.prereqIssues.length ? "risk" : late || v.unscheduled.length || v.loadIssues.length ? "watch" : "on-track";

  function draftEmail() {
    openDraft({ title: "Academic advisor email", ...advisorEmail(v), source: "rule" });
  }

  function onMove(courseId: string, termId: string) {
    setCourseTerm(courseId, termId || undefined);
    const next = validatePlan({ ...plan, [courseId]: termId || undefined });
    if (v.prereqIssues.length && !next.prereqIssues.length) {
      toast("Prerequisite conflicts resolved ✓", `Projected graduation: ${termToGraduationDate(next.projectedTerm)}`, "success");
      notify("Graduation plan fixed", `No prerequisite conflicts. Projected graduation ${termToGraduationDate(next.projectedTerm)}.`, "graduation");
    } else if (next.prereqIssues.length > v.prereqIssues.length) {
      toast("New prerequisite conflict", next.prereqIssues[next.prereqIssues.length - 1].message, "warning");
    }
  }

  const focusCourse = focus ? courseById[focus] : null;

  return (
    <div>
      <PageHeader eyebrow="Module 2" title="Graduation Planner" icon={GraduationCap} tone="sage"
        subtitle="Fictional B.S. Software Engineering program (demo data, not verified BAU policy). Move courses between terms — prerequisites and graduation date re-validate instantly.">
        <Button variant="soft" onClick={draftEmail}><Mail size={16} /> Generate Advisor Email</Button>
      </PageHeader>

      {/* Summary row */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-4">
          <ProgressRing pct={totals.pct} size={96} stroke={10}>
            <span className="font-display text-2xl font-semibold">{totals.pct}%</span>
          </ProgressRing>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Degree completion</p>
            <p className="mt-1 text-sm"><b>{totals.completed}</b> completed · <b>{totals.inProgress}</b> in progress</p>
            <p className="text-sm"><b>{totals.remaining}</b> credits remaining of {totals.required}</p>
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Projected graduation</p>
          <p className="font-display mt-1 text-3xl font-semibold">{termToGraduationDate(v.projectedTerm)}</p>
          <p className="mt-1 text-xs text-muted">Target: {DEMO_STUDENT.expectedGraduation}</p>
          <div className="mt-2">
            {status === "risk" && <Badge tone="blush"><AlertTriangle size={11} /> At risk</Badge>}
            {status === "watch" && <Badge tone="butter"><AlertTriangle size={11} /> Needs attention</Badge>}
            {status === "on-track" && <Badge tone="sage"><CheckCircle2 size={11} /> On track</Badge>}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Requirements</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {reqs.map((r) => {
              const pct = Math.round(((r.completed) / r.requiredCredits) * 100);
              return (
                <div key={r.id}>
                  <div className="flex justify-between text-xs"><span className="font-semibold">{r.label}</span><span className="text-muted">{r.completed}{r.inProgress ? `+${r.inProgress}` : ""}/{r.requiredCredits}</span></div>
                  <ProgressBar pct={pct} tone={catTone[r.categories[0]]} className="mt-1 !h-2" />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Warnings */}
      <AnimatePresence>
        {(v.prereqIssues.length > 0 || v.loadIssues.length > 0 || late || v.unscheduled.length > 0) && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="mb-6 rounded-3xl border border-blush-mid bg-blush/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <IconBubble icon={AlertTriangle} tone="blush" size="sm" />
                <div>
                  <h2 className="font-semibold">Graduation risk warnings</h2>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {v.prereqIssues.map((i) => <li key={i.courseId + i.missing}>• <b>Missing prerequisite:</b> {i.message}</li>)}
                    {v.loadIssues.map((l) => <li key={l.termId}>• <b>Overload:</b> {l.message}</li>)}
                    {v.unscheduled.length > 0 && <li>• <b>Unscheduled:</b> {v.unscheduled.map((id) => courseById[id].code).join(", ")}</li>}
                    {late && <li>• <b>Late graduation:</b> plan finishes {termToGraduationDate(v.projectedTerm)}, after your {DEMO_STUDENT.expectedGraduation} target.</li>}
                  </ul>
                  {v.prereqIssues[0] && (
                    <p className="mt-2 text-xs text-blush-deep">
                      <Sparkles size={12} className="mr-1 inline" />
                      Recommended action: move {courseById[v.prereqIssues[0].courseId].code} to a term after {courseById[v.prereqIssues[0].missing].code}
                      {" "}(e.g. Summer 2027), or apply the accelerated scenario below. Then confirm with your advisor.
                    </p>
                  )}
                </div>
              </div>
              <Button onClick={draftEmail}><Mail size={16} /> Advisor email</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Roadmap */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">Semester roadmap</h2>
            <div className="flex gap-2">
              <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => { applyPlan(INITIAL_PLAN); toast("Restored your original draft plan", undefined, "info"); }}>Reset draft</Button>
              <SourceLabel kind="demo" />
            </div>
          </div>
          <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-3">
            {/* Completed */}
            <div className="w-56 shrink-0 rounded-3xl border border-line bg-sage/50 p-3">
              <p className="text-sm font-semibold">Completed</p>
              <p className="mb-2 text-[11px] text-muted">{COMPLETED_COURSE_IDS.length} courses · {totals.completed} cr</p>
              <div className="flex flex-wrap gap-1">
                {COMPLETED_COURSE_IDS.map((id) => (
                  <button key={id} onClick={() => setFocus(id)} className="rounded-lg bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-sage-deep hover:bg-white">{courseById[id].code}</button>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold">{CURRENT_TERM_LABEL} · in progress</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {IN_PROGRESS_COURSE_IDS.map((id) => (
                  <button key={id} onClick={() => setFocus(id)} className="rounded-lg bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-powder-deep hover:bg-white">{courseById[id].code}</button>
                ))}
              </div>
            </div>
            {visibleTerms.map((t) => {
              const sem = v.semesters.find((s) => s.termId === t.id)!;
              const over = sem.credits > termLimit(t);
              return (
                <div key={t.id} className={`w-60 shrink-0 rounded-3xl border p-3 ${t.season === "Summer" ? "border-dashed border-butter-mid bg-butter/40" : "border-line bg-paper"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">{t.label}</p>
                    <Badge tone={over ? "blush" : sem.credits ? "neutral" : "neutral"}>{sem.credits} cr</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {sem.courseIds.length === 0 && <p className="py-3 text-center text-xs text-muted">No courses</p>}
                    {sem.courseIds.map((id) => {
                      const c = courseById[id];
                      const bad = issueCourses.has(id);
                      const related = focus && (prereqsOf(focus).includes(id) || dependentsOf(focus).includes(id));
                      return (
                        <motion.div layout key={id}
                          className={`rounded-2xl border p-2 text-xs transition ${bad ? "border-blush-deep/50 bg-blush" : focus === id ? "border-lavender-deep bg-lavender" : related ? "border-lavender-mid bg-lavender/50" : "border-line bg-white/80"}`}>
                          <button className="w-full text-left" onClick={() => setFocus(id)}>
                            <p className="flex items-center gap-1 font-bold">{bad && <AlertTriangle size={11} className="text-blush-deep" />}{c.code}</p>
                            <p className="leading-snug text-ink/80">{c.title}</p>
                          </button>
                          <select aria-label={`Move ${c.code}`} value={plan[id] ?? ""} onChange={(e) => onMove(id, e.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-line bg-white px-1.5 py-1 text-[11px]">
                            {FUTURE_TERMS.map((ft) => <option key={ft.id} value={ft.id}>{ft.label}</option>)}
                            <option value="">Unscheduled</option>
                          </select>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {v.unscheduled.length > 0 && (
              <div className="w-56 shrink-0 rounded-3xl border border-dashed border-blush-mid bg-blush/30 p-3">
                <p className="mb-2 text-sm font-semibold">Unscheduled</p>
                {v.unscheduled.map((id) => (
                  <div key={id} className="mb-1.5 rounded-2xl bg-white/80 p-2 text-xs">
                    <p className="font-bold">{courseById[id].code}</p>
                    <select aria-label={`Schedule ${courseById[id].code}`} value="" onChange={(e) => onMove(id, e.target.value)} className="mt-1 w-full rounded-lg border border-line px-1 py-1 text-[11px]">
                      <option value="">Choose term…</option>
                      {FUTURE_TERMS.map((ft) => <option key={ft.id} value={ft.id}>{ft.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Prerequisite inspector */}
        <Card className="h-fit">
          <div className="mb-3 flex items-center gap-2"><Link2 size={16} className="text-lavender-deep" /><h3 className="font-semibold">Prerequisite map</h3></div>
          {focusCourse ? (
            <div>
              <Badge tone={catTone[focusCourse.category]}>{focusCourse.category}</Badge>
              <p className="font-display mt-2 text-xl font-semibold">{focusCourse.code} · {focusCourse.title}</p>
              <p className="text-xs text-muted">
                {COMPLETED_COURSE_IDS.includes(focusCourse.id) ? "Completed" : IN_PROGRESS_COURSE_IDS.includes(focusCourse.id) ? `In progress (${CURRENT_TERM_LABEL})` : plan[focusCourse.id] ? `Planned: ${termById[plan[focusCourse.id]!].label}` : "Unscheduled"}
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Requires</p>
              <div className="mt-1 space-y-1">
                {prereqsOf(focusCourse.id).length === 0 && <p className="text-sm text-muted">No prerequisites</p>}
                {prereqsOf(focusCourse.id).map((p) => {
                  const ok = COMPLETED_COURSE_IDS.includes(p) || IN_PROGRESS_COURSE_IDS.includes(p) || (plan[p] && plan[focusCourse.id] && termById[plan[p]!].order < termById[plan[focusCourse.id]!].order);
                  return (
                    <button key={p} onClick={() => setFocus(p)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${ok ? "bg-sage/70" : "bg-blush"}`}>
                      <span><b>{courseById[p].code}</b> {courseById[p].title}</span>
                      {ok ? <CheckCircle2 size={14} className="text-sage-deep" /> : <AlertTriangle size={14} className="text-blush-deep" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Unlocks</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {dependentsOf(focusCourse.id).length === 0 && <p className="text-sm text-muted">Nothing directly</p>}
                {dependentsOf(focusCourse.id).map((d) => (
                  <button key={d} onClick={() => setFocus(d)} className="inline-flex items-center gap-1 rounded-full bg-lavender px-2.5 py-1 text-xs font-semibold text-lavender-deep">
                    <ArrowRight size={11} /> {courseById[d].code}
                  </button>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-muted">Select a course to see its prerequisites.</p>}
          <p className="mt-4 text-[11px] text-muted">Click any course in the roadmap. Highlighted cards are related prerequisites or courses it unlocks.</p>
        </Card>
      </div>

      {/* Scenarios */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Scale size={20} className="text-powder-deep" />
          <h2 className="font-display text-2xl font-semibold">Planning scenarios</h2>
          <SourceLabel kind="rule" />
        </div>
        <p className="mb-4 max-w-3xl text-sm text-muted">
          Both scenarios are generated by a critical-path scheduler: each term it takes eligible courses with the longest chain of dependent courses first.
          Your longest chain is <b>CS 102 → SWE 410 → SWE 490 → SWE 491</b> (4 terms), and because Programming II is still missing, only a few courses are eligible in Spring 2027 — that underfilled term is what makes sequencing decisive.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map(({ s, plan: sp, v: sv }) => {
            const onTime = sv.projectedTerm && sv.projectedTerm.order <= target.order;
            return (
              <Card key={s.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <IconBubble icon={s.id === "standard" ? Scale : Rocket} tone={s.id === "standard" ? "powder" : "lavender"} size="sm" />
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-xs text-muted">{s.description}</p>
                    </div>
                  </div>
                  <Badge tone={onTime ? "sage" : "butter"}>{onTime ? "On time" : "Later than target"}</Badge>
                </div>
                <p className="font-display mt-4 text-3xl font-semibold">{termToGraduationDate(sv.projectedTerm)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sv.semesters.filter((x) => x.courseIds.length).map((x) => (
                    <span key={x.termId} className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold">{termById[x.termId].label}: {x.credits} cr</span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  {s.id === "standard"
                    ? "Lower weekly workload and more room for a part-time internship. But prerequisites leave the early terms underfilled, so the remaining credits spill past the May 2028 target."
                    : "Uses Summer 2027 to start the SWE 410 → capstone chain early. Heavier terms; check summer availability and any overload approvals with your advisor."}
                </p>
                <Button variant={s.id === "accelerated" ? "primary" : "ghost"} className="mt-4 self-start"
                  onClick={() => { applyPlan(sp); toast(`${s.name} applied`, `Projected graduation: ${termToGraduationDate(sv.projectedTerm)}`, "success"); notify(`Plan updated: ${s.name}`, `Projected graduation ${termToGraduationDate(sv.projectedTerm)}.`, "graduation"); }}>
                  Apply this scenario
                </Button>
              </Card>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-muted">
          Demo program only. Credit limits (18 regular / 9 summer), course offerings, and approvals are illustrative — real requirements come from your university catalog and academic advisor.
        </p>
      </div>
    </div>
  );
}
