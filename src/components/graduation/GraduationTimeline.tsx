"use client";

import { CheckCircle2, Flag, GraduationCap, Target } from "lucide-react";
import { CURRENT_TERM_LABEL, DEMO_STUDENT, FUTURE_TERMS } from "@/lib/demo-data";
import { degreeTotals, termById, termLimit, termToGraduationDate, type PlanValidation } from "@/lib/graduation";

/**
 * Visual, read-only view of the deterministic plan: completed → in progress → each planned term → graduation.
 * Every number comes from validatePlan()/degreeTotals(); nothing here is estimated.
 */
export function GraduationTimeline({ v }: { v: PlanValidation }) {
  const t = degreeTotals();
  const planned = v.semesters.reduce((n, s) => n + s.credits, 0);
  const unscheduled = Math.max(0, t.remaining - planned);
  const target = termById[DEMO_STUDENT.targetTermId];
  const last = v.projectedTerm;
  const issueTerms = new Set(v.prereqIssues.map((i) => i.termId));
  const overTerms = new Set(v.loadIssues.map((l) => l.termId));
  const terms = FUTURE_TERMS.filter((term) => term.order <= Math.max(target.order, last?.order ?? 0, ...v.semesters.filter((s) => s.credits).map((s) => termById[s.termId].order)));
  const seg = (n: number) => `${(n / t.required) * 100}%`;

  return (
    <section className="card mb-6 p-5" aria-label="Graduation timeline">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Graduation timeline</h2>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sage-deep" /> Completed {t.completed}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-powder-deep" /> In progress {t.inProgress}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-lavender-deep/70" /> Planned {planned}</span>
          {unscheduled > 0 && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blush-deep" /> Unscheduled {unscheduled}</span>}
          <span>of {t.required} credits</span>
        </div>
      </div>
      {/* Stacked credits bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`${t.completed} completed, ${t.inProgress} in progress, ${planned} planned, ${unscheduled} unscheduled of ${t.required} credits`}>
        <span className="bg-sage-deep" style={{ width: seg(t.completed) }} />
        <span className="bg-powder-deep" style={{ width: seg(t.inProgress) }} />
        <span className="bg-lavender-deep/70" style={{ width: seg(planned) }} />
        <span className="bg-blush-deep" style={{ width: seg(unscheduled) }} />
      </div>

      {/* Term steps */}
      <ol className="scrollbar-thin mt-5 flex min-w-0 gap-0 overflow-x-auto pb-2">
        <Step label="Completed" sub={`${t.completed} cr`} tone="done" icon={<CheckCircle2 size={14} />} />
        <Step label={CURRENT_TERM_LABEL} sub={`${t.inProgress} cr · now`} tone="now" />
        {terms.map((term) => {
          const sem = v.semesters.find((s) => s.termId === term.id);
          const cr = sem?.credits ?? 0;
          const flag = issueTerms.has(term.id) ? "conflict" : overTerms.has(term.id) ? "overload" : cr > termLimit(term) ? "overload" : null;
          const isLast = last?.id === term.id;
          return (
            <Step key={term.id} label={term.label} sub={cr ? `${cr} cr` : "no courses"} tone={cr ? (flag ?? "planned") : "empty"}
              summer={term.season === "Summer"} target={term.id === target.id}
              icon={isLast ? <GraduationCap size={14} /> : undefined}
              note={flag === "conflict" ? "prereq conflict" : flag === "overload" ? "overload" : isLast ? "graduation" : undefined} />
          );
        })}
      </ol>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1"><Flag size={12} className="text-sage-deep" /> Projected: <b>{termToGraduationDate(last)}</b></span>
        <span className="inline-flex items-center gap-1"><Target size={12} className="text-lavender-deep" /> Target: <b>{DEMO_STUDENT.expectedGraduation}</b></span>
        {last && last.order > target.order && <span className="font-semibold text-blush-deep">{last.order - target.order} term(s) after target</span>}
      </p>
    </section>
  );
}

const toneCls = {
  done: "border-sage-deep bg-sage text-sage-deep",
  now: "border-powder-deep bg-powder text-powder-deep",
  planned: "border-lavender-mid bg-lavender text-lavender-deep",
  conflict: "border-blush-deep bg-blush text-blush-deep",
  overload: "border-butter-deep bg-butter text-butter-deep",
  empty: "border-line bg-white text-muted",
} as const;

function Step({ label, sub, tone, icon, summer, target, note }: {
  label: string; sub: string; tone: keyof typeof toneCls; icon?: React.ReactNode; summer?: boolean; target?: boolean; note?: string;
}) {
  return (
    <li className="relative flex min-w-[112px] flex-1 flex-col items-center text-center">
      <span className="absolute left-0 right-0 top-[15px] -z-0 h-0.5 bg-line" aria-hidden />
      <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${toneCls[tone]} ${summer ? "border-dashed" : ""}`}>
        {icon ?? <span className="h-2 w-2 rounded-full bg-current" />}
      </span>
      <span className="mt-1.5 text-[11px] font-semibold leading-tight">{label}</span>
      <span className="text-[10px] text-muted">{sub}</span>
      {note && <span className={`mt-0.5 rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wide ${toneCls[tone === "empty" ? "planned" : tone]}`}>{note}</span>}
      {target && <span className="mt-0.5 rounded-full bg-ink px-1.5 text-[9px] font-bold uppercase tracking-wide text-white">target</span>}
    </li>
  );
}
