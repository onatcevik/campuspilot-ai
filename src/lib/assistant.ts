// Deterministic assistant: intent routing over the student's live data. Used when Gemini is not configured.
import { deadlineState, formatDue, remainingLabel, weeklyProgress } from "./deadlines";
import { DEMO_STUDENT, OPPORTUNITIES } from "./demo-data";
import { courseById, degreeTotals, termToGraduationDate, validatePlan } from "./graduation";
import { buildMilestones, fmtDate, sourceById } from "./immigration";
import { matchOpportunity, resumeTips } from "./matching";
import { buildRecommendations } from "./recommendations";
import { deriveStudentProfile } from "./profile";
import { retrieve } from "./retrieval";
import type { CampusState } from "./store";

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function ruleBasedAnswer(question: string, s: CampusState, now: Date): string {
  const q = question.toLowerCase();

  if (has(q, ["cpt", "opt", "f-1", "f1", "visa", "dso", "stem", "i-20", "immigration", "work authorization"])) {
    const passages = retrieve(question, 3);
    const ms = buildMilestones(s.intl).filter((m) => m.date && new Date(m.date) > now).slice(0, 2);
    const lines = passages.map((p) => `• ${p.text} (${p.topic.sourceIds.map((id) => sourceById[id].publisher).join(", ")})`);
    const dates = ms.map((m) => `• ${m.title}: ${fmtDate(m.date!)}`);
    return [
      lines.length ? "From the curated official-source library:" : "I couldn't find that in the curated official-source library.",
      ...lines,
      dates.length ? "\nYour next planning dates:" : "",
      ...dates,
      "\nThis is general information, not legal advice. Please confirm with your DSO.",
    ].filter(Boolean).join("\n");
  }

  if (has(q, ["graduat", "prereq", "credit", "course", "semester", "advisor", "plan"])) {
    const v = validatePlan(s.plan);
    const t = degreeTotals();
    const lines = [
      `You've completed ${t.completed}/${t.required} credits (${t.pct}%), with ${t.inProgress} in progress.`,
      `Your current plan projects graduation in ${termToGraduationDate(v.projectedTerm)} (target: ${DEMO_STUDENT.expectedGraduation}).`,
    ];
    if (v.prereqIssues.length) lines.push(`⚠️ ${v.prereqIssues.length} prerequisite conflict(s): ${v.prereqIssues[0].message}`, "Recommended: move the course to a later term, or apply the Accelerated scenario in the Graduation Planner, then generate an advisor email to confirm.");
    else lines.push("✓ No prerequisite conflicts detected.");
    if (v.loadIssues.length) lines.push(`Heads up: ${v.loadIssues[0].message}`);
    return lines.join("\n");
  }

  if (has(q, ["intern", "job", "career", "resume", "match", "company", "skill"])) {
    const top = OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, s.career) })).sort((a, b) => b.m.score - a.m.score).slice(0, 3);
    const tips = resumeTips(s.career, OPPORTUNITIES).slice(0, 2);
    return [
      "Your best-fit sample opportunities:",
      ...top.map(({ o, m }) => `• ${o.role} — ${o.company}, ${o.location} (${m.score}% match; work authorization: ${o.workAuth.replace("-", " ")})`),
      "\nResume suggestions:",
      ...tips.map((t) => `• ${t.title}: ${t.detail}`),
      "\nListings are fictional demo data. Never assume an employer accepts CPT/OPT unless they state it.",
    ].join("\n");
  }

  if (has(q, ["due", "assignment", "homework", "deadline", "week", "study", "today", "task"])) {
    const open = s.assignments.filter((a) => !a.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const wp = weeklyProgress(s.assignments, now);
    if (!open.length) return "All your assignments are complete. 🎉 Great time to work on a portfolio project.";
    return [
      `This week: ${wp.done}/${wp.total} assignments done (${wp.pct}%).`,
      "Next up:",
      ...open.slice(0, 4).map((a) => {
        const st = deadlineState(a, now);
        const flag = st === "overdue" ? "🔴" : st === "due-2h" ? "🔴" : st === "due-24h" ? "🟡" : "🟢";
        return `${flag} ${a.title} (${a.course}) — ${formatDue(a.dueDate)}, ${remainingLabel(a, now)}`;
      }),
      "\nTip: open “Plan my study week” on the Study Board for an hour-by-hour plan.",
    ].join("\n");
  }

  const recs = buildRecommendations(s, now).slice(0, 4);
  return [
    `Hi ${DEMO_STUDENT.firstName}! Here's what matters most right now:`,
    ...recs.map((r) => `• ${r.title}`),
    "\nAsk me about your deadlines, graduation plan, CPT/OPT timeline, or internship matches.",
  ].join("\n");
}

/** Compact snapshot of all modules sent as Gemini context. */
export function assistantContext(s: CampusState, now: Date) {
  const v = validatePlan(s.plan);
  return {
    now: now.toISOString(),
    student: DEMO_STUDENT,
    assignments: s.assignments.map((a) => ({ course: a.course, title: a.title, due: a.dueDate, completed: a.completed, status: deadlineState(a, now) })),
    graduation: {
      ...degreeTotals(),
      projected: termToGraduationDate(v.projectedTerm),
      prerequisiteIssues: v.prereqIssues.map((i) => i.message),
      unscheduled: v.unscheduled.map((id) => courseById[id].code),
    },
    international: { status: s.intl.status, programEndDate: s.intl.programEndDate, milestones: buildMilestones(s.intl).map((m) => ({ title: m.title, date: m.date, kind: m.kind })) },
    career: {
      skills: s.career.skills,
      academicAvailability: deriveStudentProfile(s).availability.map((a) => `${a.label}: ${a.level} (${a.credits} cr)`),
      topMatches: OPPORTUNITIES.map((o) => ({ role: o.role, company: o.company, score: matchOpportunity(o, s.career).score, workAuth: o.workAuth })).sort((a, b) => b.score - a.score).slice(0, 4),
    },
    alerts: buildRecommendations(s, now).map((r) => r.title),
    officialSources: Object.values(sourceById).map((x) => ({ title: x.title, url: x.url })),
  };
}
