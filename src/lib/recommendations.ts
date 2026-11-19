// Cross-module proactive engine: deterministic rules that connect Study Board, Graduation, International and Career data.
import { deadlineState, remainingLabel, weeklyProgress } from "./deadlines";
import { DEMO_STUDENT, OPPORTUNITIES } from "./demo-data";
import { courseById, termById, termToEndISO, termToGraduationDate, validatePlan } from "./graduation";
import { buildMilestones, CHECKLIST, fmtDate } from "./immigration";
import { matchOpportunity } from "./matching";
import type { CampusState } from "./store";
import type { Recommendation, Severity } from "./types";

const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2, success: 3 };

export function buildRecommendations(s: CampusState, now: Date): Recommendation[] {
  const recs: Recommendation[] = [];

  // ---- Study Board ----
  const open = s.assignments.filter((a) => !a.completed);
  const overdue = open.filter((a) => deadlineState(a, now) === "overdue");
  const urgent = open.filter((a) => deadlineState(a, now) === "due-2h");
  const soon = open.filter((a) => deadlineState(a, now) === "due-24h");
  overdue.forEach((a) => {
    if (a.submission === "closed")
      recs.push({ id: `closed-${a.id}`, module: "study", severity: "critical", title: `Needs attention: submission closed for ${a.title}`,
        detail: `${a.course}. You reported that submission is closed. Consider emailing your professor about an extension.`,
        action: { label: "Open Study Board", href: "/study-board" } });
    else if (a.submission === "late-allowed")
      recs.push({ id: `late-${a.id}`, module: "study", severity: "warning", title: `Late submission allowed: ${a.title}`,
        detail: `${a.course}. ${remainingLabel(a, now)}. You reported late work is accepted, so submit it soon.`,
        action: { label: "Open Study Board", href: "/study-board" } });
    else
      recs.push({ id: `ov-${a.id}`, module: "study", severity: "critical", title: `Overdue: ${a.title}`,
        detail: `${a.course}. ${remainingLabel(a, now)}. Check whether late submission is allowed, then update its status on the Study Board.`,
        action: { label: "Open Study Board", href: "/study-board" } });
  });
  urgent.forEach((a) =>
    recs.push({ id: `u-${a.id}`, module: "study", severity: "critical", title: `Due in under 2 hours: ${a.title}`,
      detail: `${a.course} — ${remainingLabel(a, now)}. Block focus time right now.`,
      action: { label: "Open Study Board", href: "/study-board" } }),
  );
  if (soon.length)
    recs.push({ id: "soon", module: "study", severity: "warning",
      title: `${soon.length} assignment${soon.length > 1 ? "s" : ""} due within 24 hours`,
      detail: soon.map((a) => `${a.title} (${remainingLabel(a, now)})`).join(" · "),
      action: { label: "Plan my study time", href: "/study-board" } });
  const wp = weeklyProgress(s.assignments, now);
  if (wp.total && wp.done === wp.total)
    recs.push({ id: "week-done", module: "study", severity: "success", title: "Every assignment this week is done 🎉",
      detail: "Great work. Use the extra time to get ahead on your career prep." });

  // ---- Graduation ----
  const v = validatePlan(s.plan);
  if (v.prereqIssues.length) {
    const first = v.prereqIssues[0];
    recs.push({ id: "prereq", module: "graduation", severity: "critical",
      title: `Graduation risk: missing prerequisite for ${courseById[first.courseId].title}`,
      detail: `${first.message}${v.prereqIssues.length > 1 ? ` (+${v.prereqIssues.length - 1} more)` : ""} Recommended: move the course to a later term or ask your advisor.`,
      action: { label: "Generate Advisor Email", kind: "advisor-email" } });
  }
  if (v.loadIssues.length)
    recs.push({ id: "load", module: "graduation", severity: "warning", title: "Course overload in your plan",
      detail: v.loadIssues.map((l) => l.message).join(" "), action: { label: "Review plan", href: "/graduation" } });
  if (v.unscheduled.length)
    recs.push({ id: "unsched", module: "graduation", severity: "warning",
      title: `${v.unscheduled.length} required course${v.unscheduled.length > 1 ? "s are" : " is"} not scheduled`,
      detail: v.unscheduled.map((id) => courseById[id].code).join(", "), action: { label: "Open planner", href: "/graduation" } });
  const target = termById[DEMO_STUDENT.targetTermId];
  if (v.projectedTerm && v.projectedTerm.order > target.order)
    recs.push({ id: "late", module: "graduation", severity: "warning",
      title: `Projected graduation slips to ${termToGraduationDate(v.projectedTerm)}`,
      detail: `Your target is ${DEMO_STUDENT.expectedGraduation}. Compare the accelerated scenario in the Graduation Planner.`,
      action: { label: "Compare scenarios", href: "/graduation" } });

  // ---- International (cross-module with Graduation) ----
  if (s.intl.status === "F-1") {
    if (v.projectedTerm && termToEndISO(v.projectedTerm) > s.intl.programEndDate)
      recs.push({ id: "i20-ext", module: "international", severity: "critical",
        title: "Graduation plan extends past your I-20 program end date",
        detail: `Plan projects ${termToGraduationDate(v.projectedTerm)}, I-20 ends ${fmtDate(s.intl.programEndDate)}. Ask your DSO about a program extension before the end date.`,
        action: { label: "Draft DSO Email", kind: "dso-email" } });
    const next = buildMilestones(s.intl).find((m) => m.date && new Date(m.date) > now);
    if (next?.date) {
      const days = Math.round((new Date(next.date).getTime() - now.getTime()) / 86_400_000);
      recs.push({ id: "imm-next", module: "international", severity: days < 120 ? "warning" : "info",
        title: `Immigration timeline: ${next.title}`,
        detail: `${fmtDate(next.date)} (in ${days} days). ${next.kind === "verified-rule" ? "Based on a cited USCIS timing rule." : "Planning estimate — confirm with your DSO."}`,
        action: { label: "Open Advisor", href: "/international" } });
    }
    const appliedNeedingCpt = OPPORTUNITIES.filter(
      (o) => o.type !== "Full-time (new grad)" && ["applied", "interviewing", "offer"].includes(s.statuses[o.id] ?? ""),
    );
    if (appliedNeedingCpt.length && s.intl.cptInterest)
      recs.push({ id: "cpt-apps", module: "international", severity: "info",
        title: "Internship applications in progress — plan CPT early",
        detail: `You have ${appliedNeedingCpt.length} active internship application(s). CPT must be authorized by your DSO before any start date.`,
        action: { label: "Draft DSO Email", kind: "dso-email" } });
    const remainingChecklist = CHECKLIST.filter((c) => !s.intl.checklist[c.id]).length;
    if (remainingChecklist)
      recs.push({ id: "imm-check", module: "international", severity: "info",
        title: `${remainingChecklist} international planning checklist items open`,
        detail: "Your immigration planning timeline needs review.", action: { label: "Review checklist", href: "/international" } });
  }

  // ---- Career ----
  const scored = OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, s.career) })).sort((a, b) => b.m.score - a.m.score);
  const strong = scored.filter((x) => x.m.score >= 70 && x.o.workAuth !== "restricted");
  if (strong.length)
    recs.push({ id: "career", module: "career", severity: "info",
      title: `${strong.length} career opportunities match your skills`,
      detail: `Top match: ${strong[0].o.role} at ${strong[0].o.company} (${strong[0].m.score}%).`,
      action: { label: "View matches", href: "/career" } });
  const savedVerify = OPPORTUNITIES.filter((o) => s.saved.includes(o.id) && o.workAuth === "verification-required");
  if (savedVerify.length && s.intl.status === "F-1")
    recs.push({ id: "verify", module: "career", severity: "info",
      title: "Saved roles need work-authorization verification",
      detail: savedVerify.map((o) => o.company).join(", ") + " — ask recruiters whether they accept CPT/OPT.",
      action: { label: "Open Career Navigator", href: "/career" } });

  return recs.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function dailyBriefing(s: CampusState, now: Date, recs: Recommendation[]): string {
  const crit = recs.filter((r) => r.severity === "critical").length;
  const open = s.assignments.filter((a) => !a.completed && deadlineState(a, now) !== "upcoming").length;
  const v = validatePlan(s.plan);
  const parts = [
    open ? `You have ${open} assignment${open > 1 ? "s" : ""} that need attention in the next 24 hours.` : "No assignments are due in the next 24 hours.",
    v.prereqIssues.length ? `Your graduation plan contains ${v.prereqIssues.length} prerequisite conflict${v.prereqIssues.length > 1 ? "s" : ""}.` : "Your graduation plan has no prerequisite conflicts.",
    s.intl.status === "F-1" ? "Your immigration planning timeline is ready for review." : "",
    recs.some((r) => r.id === "career") ? "New career opportunities match your skills." : "",
  ].filter(Boolean);
  return `${parts.join(" ")} ${crit ? `Start with the ${crit} critical item${crit > 1 ? "s" : ""} below.` : "You're in good shape today."}`;
}
