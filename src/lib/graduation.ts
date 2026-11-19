// Deterministic degree-audit + prerequisite validation + scenario planner. Demo program only.
import {
  COMPLETED_COURSE_IDS,
  COURSES,
  DEGREE_REQUIREMENTS,
  FUTURE_TERMS,
  IN_PROGRESS_COURSE_IDS,
  PREREQUISITES,
  TOTAL_REQUIRED_CREDITS,
} from "./demo-data";
import type { Course, SemesterPlan, Term } from "./types";

export const courseById = Object.fromEntries(COURSES.map((c) => [c.id, c])) as Record<string, Course>;
export const termById = Object.fromEntries(FUTURE_TERMS.map((t) => [t.id, t])) as Record<string, Term>;
const prereqMap = Object.fromEntries(PREREQUISITES.map((p) => [p.courseId, p.requires])) as Record<string, string[]>;

export const prereqsOf = (id: string) => prereqMap[id] ?? [];
export const dependentsOf = (id: string) => PREREQUISITES.filter((p) => p.requires.includes(id)).map((p) => p.courseId);

export const REMAINING_COURSE_IDS = COURSES.map((c) => c.id).filter(
  (id) => !COMPLETED_COURSE_IDS.includes(id) && !IN_PROGRESS_COURSE_IDS.includes(id),
);

const credits = (ids: string[]) => ids.reduce((s, id) => s + (courseById[id]?.credits ?? 0), 0);

export const completedCredits = credits(COMPLETED_COURSE_IDS);
export const inProgressCredits = credits(IN_PROGRESS_COURSE_IDS);

export type PlanMap = Record<string, string | undefined>; // courseId -> termId (undefined = unscheduled)

export interface PrereqIssue {
  courseId: string;
  missing: string; // prerequisite course id
  termId: string;
  reason: "same-term" | "later-term" | "unscheduled";
  message: string;
}

export interface LoadIssue {
  termId: string;
  credits: number;
  limit: number;
  message: string;
}

export const termLimit = (t: Term) => (t.season === "Summer" ? 9 : 18);

/** Where (relative order) a course is satisfied. 0 = done or in progress before any future term. */
function satisfiedOrder(id: string, plan: PlanMap): number | null {
  if (COMPLETED_COURSE_IDS.includes(id) || IN_PROGRESS_COURSE_IDS.includes(id)) return 0;
  const t = plan[id];
  return t ? termById[t].order : null;
}

export function validatePlan(plan: PlanMap) {
  const prereqIssues: PrereqIssue[] = [];
  for (const id of REMAINING_COURSE_IDS) {
    const t = plan[id];
    if (!t) continue;
    const order = termById[t].order;
    for (const req of prereqsOf(id)) {
      const reqOrder = satisfiedOrder(req, plan);
      const c = courseById[id];
      const r = courseById[req];
      if (reqOrder === null) {
        prereqIssues.push({ courseId: id, missing: req, termId: t, reason: "unscheduled",
          message: `${r.title} (${r.code}) is required before ${c.title} (${c.code}), but it is not scheduled yet.` });
      } else if (reqOrder === order) {
        prereqIssues.push({ courseId: id, missing: req, termId: t, reason: "same-term",
          message: `${r.title} (${r.code}) must be completed before ${c.title} (${c.code}). Both are planned for ${termById[t].label}.` });
      } else if (reqOrder > order) {
        prereqIssues.push({ courseId: id, missing: req, termId: t, reason: "later-term",
          message: `${c.title} (${c.code}) is planned before its prerequisite ${r.title} (${r.code}).` });
      }
    }
  }

  const semesters: SemesterPlan[] = FUTURE_TERMS.map((t) => {
    const ids = REMAINING_COURSE_IDS.filter((id) => plan[id] === t.id);
    return { termId: t.id, courseIds: ids, credits: credits(ids) };
  });

  const loadIssues: LoadIssue[] = semesters
    .filter((s) => s.credits > termLimit(termById[s.termId]))
    .map((s) => ({ termId: s.termId, credits: s.credits, limit: termLimit(termById[s.termId]),
      message: `${termById[s.termId].label} has ${s.credits} credits (demo limit ${termLimit(termById[s.termId])}). Overloads usually need approval.` }));

  const unscheduled = REMAINING_COURSE_IDS.filter((id) => !plan[id]);
  const lastTerm = semesters.filter((s) => s.courseIds.length).map((s) => termById[s.termId]).sort((a, b) => b.order - a.order)[0];
  const plannedCredits = completedCredits + inProgressCredits + semesters.reduce((s, x) => s + x.credits, 0);

  return {
    prereqIssues,
    loadIssues,
    unscheduled,
    semesters,
    projectedTerm: unscheduled.length ? null : lastTerm ?? null,
    plannedCredits,
    isValid: prereqIssues.length === 0 && loadIssues.length === 0 && unscheduled.length === 0,
  };
}

export type PlanValidation = ReturnType<typeof validatePlan>;

export function termToGraduationDate(t: Term | null): string {
  if (!t) return "Not determinable";
  const month = t.season === "Spring" ? "May" : t.season === "Summer" ? "August" : "December";
  return `${month} ${t.year}`;
}

/** Approximate program-end ISO date for a term (used to sync with the International Student Advisor). */
export function termToEndISO(t: Term): string {
  const md = t.season === "Spring" ? "05-15" : t.season === "Summer" ? "08-15" : "12-15";
  return `${t.year}-${md}`;
}

export function requirementProgress() {
  return DEGREE_REQUIREMENTS.map((r) => {
    const inCat = (ids: string[]) => credits(ids.filter((id) => r.categories.includes(courseById[id].category)));
    return { ...r, completed: inCat(COMPLETED_COURSE_IDS), inProgress: inCat(IN_PROGRESS_COURSE_IDS) };
  });
}

export const degreeTotals = () => {
  const done = completedCredits;
  return {
    required: TOTAL_REQUIRED_CREDITS,
    completed: done,
    inProgress: inProgressCredits,
    remaining: TOTAL_REQUIRED_CREDITS - done - inProgressCredits,
    pct: Math.round((done / TOTAL_REQUIRED_CREDITS) * 100),
  };
};

// ---------- Scenario planner ----------
export interface Scenario {
  id: "standard" | "accelerated";
  name: string;
  description: string;
  maxRegular: number;
  maxSummer: number;
  useSummer: boolean;
}

export const SCENARIOS: Scenario[] = [
  { id: "standard", name: "Standard load", description: "15 credits in fall/spring, no summer courses.", maxRegular: 15, maxSummer: 0, useSummer: false },
  { id: "accelerated", name: "Accelerated load", description: "Up to 18 credits in fall/spring plus 9 summer credits.", maxRegular: 18, maxSummer: 9, useSummer: true },
];

const depthMemo: Record<string, number> = {};
/** Length of the longest chain of courses that depend on this one (critical path). */
export function chainDepth(id: string): number {
  if (depthMemo[id] !== undefined) return depthMemo[id];
  const deps = dependentsOf(id).filter((d) => REMAINING_COURSE_IDS.includes(d));
  depthMemo[id] = 1 + (deps.length ? Math.max(...deps.map(chainDepth)) : 0);
  return depthMemo[id];
}

/** Greedy critical-path scheduler: each term, take eligible courses with the longest dependency chains first. */
export function buildScenarioPlan(s: Scenario): PlanMap {
  const plan: PlanMap = {};
  const done = new Set([...COMPLETED_COURSE_IDS, ...IN_PROGRESS_COURSE_IDS]);
  let remaining = [...REMAINING_COURSE_IDS];
  for (const t of FUTURE_TERMS) {
    if (!remaining.length) break;
    if (t.season === "Summer" && !s.useSummer) continue;
    const limit = t.season === "Summer" ? s.maxSummer : s.maxRegular;
    const eligible = remaining
      .filter((id) => prereqsOf(id).every((r) => done.has(r)))
      .sort((a, b) => chainDepth(b) - chainDepth(a) || a.localeCompare(b));
    let load = 0;
    const taken: string[] = [];
    for (const id of eligible) {
      const cr = courseById[id].credits;
      if (load + cr > limit) continue;
      load += cr;
      taken.push(id);
      plan[id] = t.id;
    }
    taken.forEach((id) => done.add(id));
    remaining = remaining.filter((id) => !taken.includes(id));
  }
  return plan;
}

// ---------- Deterministic explanations ("why is there a delay?") ----------

/** All longest chains of remaining courses where each requires the previous one (e.g. CS102 → SWE410 → SWE490 → SWE491). */
export function longestChains(): string[][] {
  const starts = REMAINING_COURSE_IDS.filter((id) => !prereqsOf(id).some((p) => REMAINING_COURSE_IDS.includes(p)));
  const paths: string[][] = [];
  const walk = (id: string, path: string[]) => {
    const next = dependentsOf(id).filter((d) => REMAINING_COURSE_IDS.includes(d));
    if (!next.length) { paths.push(path); return; }
    next.sort().forEach((d) => walk(d, [...path, d]));
  };
  starts.sort().forEach((s) => walk(s, [s]));
  const max = Math.max(0, ...paths.map((p) => p.length));
  return paths.filter((p) => p.length === max);
}

/** One representative longest chain (deterministic: first alphabetically). */
export const criticalPath = (): string[] => longestChains()[0] ?? [];

/** Credits whose prerequisites are already satisfied before any future term (what you can take in the first term). */
export function eligibleCreditsAtStart(): number {
  const done = new Set([...COMPLETED_COURSE_IDS, ...IN_PROGRESS_COURSE_IDS]);
  return credits(REMAINING_COURSE_IDS.filter((id) => prereqsOf(id).every((r) => done.has(r))));
}

export interface ConflictFix {
  courseId: string;
  missing: string;
  message: string;
  earliestTermId: string | null; // earliest term where the course would satisfy this prerequisite
  blocks: string[]; // later courses that depend on this course (directly or indirectly)
}

function downstream(id: string): string[] {
  const out = new Set<string>();
  const visit = (c: string) => dependentsOf(c).forEach((d) => { if (!out.has(d)) { out.add(d); visit(d); } });
  visit(id);
  return [...out].filter((d) => REMAINING_COURSE_IDS.includes(d));
}

/** For each prerequisite conflict: the earliest term that would satisfy it and what else it holds up. */
export function explainConflicts(plan: PlanMap): ConflictFix[] {
  return validatePlan(plan).prereqIssues.map((i) => {
    const reqTerm = plan[i.missing];
    const reqOrder = COMPLETED_COURSE_IDS.includes(i.missing) || IN_PROGRESS_COURSE_IDS.includes(i.missing) ? 0 : reqTerm ? termById[reqTerm].order : null;
    const earliest = reqOrder === null ? null : FUTURE_TERMS.find((t) => t.order > reqOrder)?.id ?? null;
    return { courseId: i.courseId, missing: i.missing, message: i.message, earliestTermId: earliest, blocks: downstream(i.courseId) };
  });
}

/** Why a scenario finishes when it does, using only the scheduler's own inputs. */
export function explainScenario(s: Scenario) {
  const chain = criticalPath();
  const terms = FUTURE_TERMS.filter((t) => s.useSummer || t.season !== "Summer");
  const chainFinish = terms[chain.length - 1] ?? null;
  const projected = validatePlan(buildScenarioPlan(s)).projectedTerm;
  const eligible = eligibleCreditsAtStart();
  const firstLimit = terms[0] ? (terms[0].season === "Summer" ? s.maxSummer : s.maxRegular) : 0;
  const count = longestChains().length;
  const reasons = [
    `${count > 1 ? `${count} prerequisite chains` : "The longest prerequisite chain"} need${count > 1 ? "" : "s"} ${chain.length} terms in a row (e.g. ${chain.map((id) => courseById[id].code).join(" → ")})${s.useSummer ? ", summers included" : " with no summer terms"}, so the earliest possible finish is ${termToGraduationDate(chainFinish)}.`,
  ];
  if (eligible < firstLimit)
    reasons.push(`Only ${eligible} credits are eligible in ${terms[0].label} because prerequisites aren't done yet, so that term can't be filled to ${firstLimit} credits.`);
  if (projected && chainFinish && projected.order > chainFinish.order)
    reasons.push(`With a ${s.maxRegular}-credit cap${s.useSummer ? ` and ${s.maxSummer} summer credits` : ""}, the remaining credits spill into ${projected.label}.`);
  return { chain, chainFinish: termToGraduationDate(chainFinish), projected: termToGraduationDate(projected), reasons };
}
