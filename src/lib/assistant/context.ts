// Shared, typed context layer for the CampusPilot Assistant.
// It classifies a question, then pulls ONLY the relevant modules' data from the existing deterministic engines
// and turns it into numbered facts (F1, F2…) and official-source passages (S1, S2…).
// The model only ever sees these facts — never raw state, the student's name, email, or free-text notes.
import { deadlineState, formatDue, remainingLabel, weeklyProgress } from "../deadlines";
import { DEMO_STUDENT, FUTURE_TERMS, OPPORTUNITIES } from "../demo-data";
import {
  buildScenarioPlan, chainDepth, courseById, degreeTotals, dependentsOf, SCENARIOS, termById, termToEndISO,
  termToGraduationDate, validatePlan, type PlanValidation,
} from "../graduation";
import { courseForSkill } from "../career-analysis";
import { buildMilestones, CHECKLIST, fmtDate, sourceById } from "../immigration";
import { matchOpportunity, skillGaps, type MatchResult } from "../matching";
import { availabilityFor, deriveStudentProfile, type StudentProfile } from "../profile";
import { buildRecommendations } from "../recommendations";
import { retrieve } from "../retrieval";
import type { CampusState } from "../store";
import type { Assignment, CareerOpportunity, ImmigrationMilestone, OfficialSource, Recommendation, Term } from "../types";
import { buildWorkloadPlan, type DayPlan } from "../workload";

export type AssistantModule = "study" | "graduation" | "international" | "career";
export type Intent =
  | "grad-internship" | "next-semester" | "skills" | "this-week" | "advisor-dso"
  | "immigration" | "graduation" | "career" | "study" | "overview";

export interface Fact { id: string; module: AssistantModule; text: string }
export interface SourcePassage { id: string; text: string; topic: string; sourceIds: string[] }

export interface ScenarioSummary { id: string; name: string; projected: string; onTime: boolean; summers: { label: string; credits: number; level: string }[] }
export interface CoursePriority { id: string; code: string; title: string; credits: number; unlocks: string[]; depth: number; blockedBy: string[] }

export interface AssistantData {
  profile: StudentProfile;
  validation: PlanValidation;
  nextTerm: Term | null;
  nextTermCourses: CoursePriority[];
  scenarios: ScenarioSummary[];
  open: Assignment[];
  workload: { days: DayPlan[]; warnings: string[] };
  milestones: ImmigrationMilestone[];
  i20Mismatch: boolean;
  topMatches: { o: CareerOpportunity; m: MatchResult }[];
  gaps: { skill: string; weight: number; course?: { code: string; title: string; when: string } }[];
  criticalRecs: Recommendation[];
}

export interface AssistantContext {
  question: string;
  intents: Intent[];
  modules: AssistantModule[];
  facts: Fact[];
  passages: SourcePassage[];
  officialSources: OfficialSource[];
  data: AssistantData;
}

const RX = {
  immigration: /\b(cpt|opt|f-?1|visa|i-?20|stem opt|sevis|immigration|work authori[sz]ation|dso|ead|i-?765)\b/i,
  graduation: /\b(graduat\w*|credits?|prereq\w*|prerequisites?|courses?|semester|term|degree|classes|register|registration)\b/i,
  career: /\b(intern\w*|jobs?|careers?|match\w*|compan\w*|employers?|resume|roles?|positions?)\b/i,
  study: /\b(assignments?|homework|deadlines?|exams?|due|study|tasks?)\b/i,
  week: /\b(this week|today|tonight|tomorrow|work on|focus|priorit\w* (this|today))\b/i,
  skills: /\b(skills?|improve|learn|upskill|strengthen)\b/i,
  next: /\b(next (semester|term)|prioriti[sz]e|which courses|what courses|course(s)? (should|to) take)\b/i,
  advisor: /\b(advisor|adviser|dso|what should i ask|questions? (for|to ask))\b/i,
  summer: /\b(summer|intern\w*)\b/i,
};

export function classifyIntents(question: string): Intent[] {
  const q = question.toLowerCase();
  const out = new Set<Intent>();
  if (RX.graduation.test(q) && /graduat/.test(q) && RX.summer.test(q)) out.add("grad-internship");
  if (RX.next.test(q)) out.add("next-semester");
  if (RX.skills.test(q) && (RX.career.test(q) || /match/.test(q))) out.add("skills");
  if (RX.week.test(q)) out.add("this-week");
  if (RX.advisor.test(q) && /\b(ask|questions?|email|talk|meet)\b/.test(q)) out.add("advisor-dso");
  if (RX.immigration.test(q) && !out.has("advisor-dso")) out.add("immigration");
  if (!out.size) {
    if (RX.graduation.test(q)) out.add("graduation");
    if (RX.career.test(q)) out.add("career");
    if (RX.study.test(q)) out.add("study");
  }
  if (!out.size) out.add("overview");
  return [...out];
}

const INTENT_MODULES: Record<Intent, AssistantModule[]> = {
  "grad-internship": ["graduation", "career", "international"],
  "next-semester": ["graduation"],
  skills: ["career", "graduation"],
  "this-week": ["study"],
  "advisor-dso": ["graduation", "international"],
  immigration: ["international"],
  graduation: ["graduation"],
  career: ["career"],
  study: ["study"],
  overview: ["study", "graduation", "international", "career"],
};

export function modulesFor(intents: Intent[], isF1: boolean): AssistantModule[] {
  const set = new Set(intents.flatMap((i) => INTENT_MODULES[i]));
  if (!isF1 && !intents.includes("immigration") && !intents.includes("advisor-dso")) set.delete("international");
  return (["study", "graduation", "international", "career"] as AssistantModule[]).filter((m) => set.has(m));
}

const authLabel: Record<CareerOpportunity["workAuth"], string> = {
  confirmed: "listing states CPT/OPT students are accepted",
  "verification-required": "listing does not say; verification required",
  unknown: "unknown",
  restricted: "listing states a restriction",
};

/** Builds the context. Everything numeric here comes from deterministic engines. */
export function buildAssistantContext(question: string, s: CampusState, now: Date): AssistantContext {
  const intents = classifyIntents(question);
  const profile = deriveStudentProfile(s);
  const modules = modulesFor(intents, profile.isF1);
  const validation = validatePlan(s.plan);
  const facts: Fact[] = [];
  const add = (module: AssistantModule, text: string) => {
    const f = { id: `F${facts.length + 1}`, module, text };
    facts.push(f);
    return f;
  };

  // ---------- shared deterministic data ----------
  const plannedTerms = validation.semesters.filter((x) => x.courseIds.length).map((x) => termById[x.termId]).sort((a, b) => a.order - b.order);
  const nextTerm = plannedTerms[0] ?? null;
  const nextTermCourses: CoursePriority[] = nextTerm
    ? validation.semesters.find((x) => x.termId === nextTerm.id)!.courseIds
        .map((id) => ({
          id, code: courseById[id].code, title: courseById[id].title, credits: courseById[id].credits,
          unlocks: dependentsOf(id).map((d) => courseById[d].code), depth: chainDepth(id),
          blockedBy: validation.prereqIssues.filter((i) => i.courseId === id).map((i) => courseById[i.missing].code),
        }))
        .sort((a, b) => a.blockedBy.length - b.blockedBy.length || b.depth - a.depth || b.unlocks.length - a.unlocks.length)
    : [];
  const target = termById[DEMO_STUDENT.targetTermId];
  const scenarios: ScenarioSummary[] = SCENARIOS.map((sc) => {
    const v = validatePlan(buildScenarioPlan(sc));
    const last = v.projectedTerm;
    const summers = FUTURE_TERMS.filter((t) => t.season === "Summer" && (!last || t.order < last.order)).map((t) => {
      const cr = v.semesters.find((x) => x.termId === t.id)?.credits ?? 0;
      return { label: t.label, credits: cr, level: availabilityFor(t, cr).level };
    });
    return { id: sc.id, name: sc.name, projected: termToGraduationDate(last), onTime: !!last && last.order <= target.order, summers };
  });
  const open = s.assignments.filter((a) => !a.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const workload = buildWorkloadPlan(s.assignments, now);
  const milestones = buildMilestones(s.intl);
  const i20Mismatch = profile.isF1 && !!validation.projectedTerm && termToEndISO(validation.projectedTerm) > s.intl.programEndDate;
  const topMatches = OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, s.career) }))
    .filter((x) => x.o.workAuth !== "restricted")
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, 3);
  const gaps = skillGaps(topMatches.map((x) => x.o), s.career).map((g) => ({ ...g, course: courseForSkill(g.skill, profile) }));
  const criticalRecs = buildRecommendations(s, now).filter((r) => r.severity === "critical");

  // ---------- facts, only for relevant modules ----------
  if (modules.includes("study")) {
    const wp = weeklyProgress(s.assignments, now);
    add("study", `This week: ${wp.done} of ${wp.total} assignments completed.`);
    open.slice(0, 6).forEach((a) => {
      const st = deadlineState(a, now);
      const tag = st === "overdue" ? "OVERDUE" : st === "due-2h" ? "due in under 2 hours" : st === "due-24h" ? "due within 24 hours" : "upcoming";
      add("study", `Assignment "${a.title}" (${a.course}): ${tag}, due ${formatDue(a.dueDate)} (${remainingLabel(a, now)}), estimated ${a.estimatedHours}h.`);
    });
    workload.days.slice(0, 2).forEach((d) => {
      if (d.blocks.length) add("study", `Suggested focus ${d.label.toLowerCase()}: ${d.blocks.map((b) => `${b.title} ${b.hours}h`).join(", ")} (earliest-deadline-first, 3h/day budget).`);
    });
    workload.warnings.forEach((w) => add("study", `Workload warning: ${w}`));
    if (intents.includes("this-week"))
      criticalRecs.filter((r) => r.module !== "study").forEach((r) => add(r.module === "assistant" ? "study" : (r.module as AssistantModule), `Critical alert: ${r.title}. ${r.detail}`));
  }

  if (modules.includes("graduation")) {
    const t = degreeTotals();
    add("graduation", `Credits: ${t.completed} completed, ${t.inProgress} in progress, ${t.remaining} remaining of ${t.required} required.`);
    add("graduation", `Target graduation: ${profile.targetGraduation}. Current plan projects: ${profile.projectedGraduation}.`);
    validation.prereqIssues.forEach((i) => add("graduation", `Prerequisite conflict: ${i.message}`));
    validation.loadIssues.forEach((l) => add("graduation", `Overload: ${l.message}`));
    if (validation.unscheduled.length) add("graduation", `Unscheduled required courses: ${validation.unscheduled.map((id) => courseById[id].code).join(", ")}.`);
    if (intents.some((i) => ["next-semester", "graduation", "advisor-dso", "overview"].includes(i)) && nextTerm) {
      const cr = validation.semesters.find((x) => x.termId === nextTerm.id)!.credits;
      add("graduation", `Next planned term: ${nextTerm.label} (${cr} credits).`);
      nextTermCourses.forEach((c) =>
        add("graduation", `${c.code} ${c.title} (${nextTerm.label}): unlocks ${c.unlocks.length ? c.unlocks.join(", ") : "no later courses"}; longest prerequisite chain starting here: ${c.depth} term(s)${c.blockedBy.length ? `; BLOCKED until ${c.blockedBy.join(", ")} is completed first` : ""}.`),
      );
    }
    if (intents.some((i) => ["grad-internship", "graduation", "overview"].includes(i))) {
      profile.availability.filter((a) => a.season === "Summer").forEach((a) =>
        add("graduation", `Current plan, ${a.label}: ${a.credits} credits planned → ${a.level} internship availability (planning heuristic, not a university rule).`),
      );
      scenarios.forEach((sc) =>
        add("graduation", `${sc.name} scenario projects ${sc.projected}${sc.onTime ? " (meets target)" : " (after target)"}; ${sc.summers.length ? sc.summers.map((x) => `${x.label}: ${x.credits} credits → ${x.level}`).join("; ") : "no summer terms before graduation"}.`),
      );
    }
  }

  if (modules.includes("international")) {
    if (!profile.isF1) add("international", `Student status: ${s.intl.status}. F-1 timing rules do not apply.`);
    else {
      add("international", `Student status: F-1. I-20 program end date: ${fmtDate(s.intl.programEndDate)}.`);
      if (i20Mismatch)
        add("international", `The graduation plan (${profile.projectedGraduation}) ends after the I-20 program end date. A program extension request to the DSO before the end date is generally required.`);
      milestones.filter((m) => !m.date || new Date(m.date) > now).forEach((m) =>
        add("international", `${m.title}: ${m.date ? fmtDate(m.date) : "date set by USCIS"} (${m.kind === "verified-rule" ? "cited USCIS timing rule" : "planning guidance"}).`),
      );
      const openItems = CHECKLIST.filter((c) => !s.intl.checklist[c.id]);
      if (openItems.length) add("international", `Open planning checklist items: ${openItems.map((c) => c.label).join("; ")}.`);
    }
  }

  if (modules.includes("career")) {
    add("career", `Profile skills: ${s.career.skills.join(", ")}. Target fields: ${s.career.interests.join(", ")}.`);
    topMatches.forEach(({ o, m }) =>
      add("career", `Match: ${o.role} at ${o.company} (${o.type}, ${o.location}) scores ${m.score}% (required ${m.matchedRequired.length}/${o.requiredSkills.length}, preferred ${m.matchedPreferred.length}/${o.preferredSkills.length}); missing: ${[...m.missingRequired, ...m.missingPreferred].join(", ") || "none"}; work authorization: ${authLabel[o.workAuth]}. Fictional demo listing.`),
    );
    gaps.forEach((g) => add("career", `Skill gap "${g.skill}" appears across top matches${g.course ? `; covered by ${g.course.code} ${g.course.title} (${g.course.when})` : "; no course in the plan covers it"}.`));
    const active = Object.entries(s.statuses).filter(([, st]) => ["applied", "interviewing", "offer"].includes(st)).length;
    if (active) add("career", `Active applications: ${active}.`);
  }

  // ---------- official sources (immigration grounding) ----------
  const needsPassages = modules.includes("international") && profile.isF1;
  const query = intents.includes("grad-internship") ? `${question} CPT internship curricular` : intents.includes("advisor-dso") ? `${question} CPT OPT DSO` : question;
  const passages: SourcePassage[] = needsPassages
    ? retrieve(query, 4).map((p, i) => ({ id: `S${i + 1}`, text: p.text, topic: p.topic.title, sourceIds: p.topic.sourceIds }))
    : [];
  const srcIds = new Set(passages.flatMap((p) => p.sourceIds));
  if (needsPassages) milestones.forEach((m) => m.sourceIds.forEach((id) => srcIds.add(id)));
  const officialSources = [...srcIds].map((id) => sourceById[id]);

  return {
    question, intents, modules, facts, passages, officialSources,
    data: { profile, validation, nextTerm, nextTermCourses, scenarios, open, workload, milestones, i20Mismatch, topMatches, gaps, criticalRecs },
  };
}

/** The ONLY payload sent to the model: question + numbered facts + passages + rules. No name, email, notes or raw state. */
export function buildModelPayload(ctx: AssistantContext) {
  return {
    rules: [
      "Answer ONLY from the facts and passages provided. If they don't contain the answer, say so.",
      "Never invent or recompute numbers, dates, credits, or match scores. Copy them exactly from the facts.",
      "Cite every fact you use as [F#] and every passage as [S#].",
      "Never decide immigration eligibility or authorization. Say the DSO/USCIS decides.",
      "Never claim an employer sponsors visas or accepts CPT/OPT unless a fact says the listing states it.",
      "Address the student as 'you'. Plain text, short paragraphs or '-' bullets, under 170 words.",
    ],
    question: ctx.question,
    facts: ctx.facts.map(({ id, text }) => ({ id, text })),
    passages: ctx.passages.map(({ id, text, sourceIds }) => ({ id, text, publishers: [...new Set(sourceIds.map((s) => sourceById[s].publisher))] })),
    outputSchema: { answer: "string", citedFacts: ["F1"], citedSources: ["S1"] },
  };
}
