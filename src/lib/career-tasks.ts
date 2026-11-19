// Suggested Study Board tasks derived from a listing. Nothing is added without explicit user confirmation in the UI.
import type { CareerAnalysis } from "./career-analysis";
import type { WorkAuthGuidance } from "./career-guidance";
import type { StudentProfile } from "./profile";
import type { Assignment, CareerOpportunity } from "./types";

export interface CareerTaskSuggestion {
  key: string;
  title: string;
  notes: string;
  estimatedHours: number;
  daysFromNow: number;
}

export function careerTaskSuggestions(o: CareerOpportunity, p: StudentProfile, analysis: CareerAnalysis, g: WorkAuthGuidance): CareerTaskSuggestion[] {
  const out: CareerTaskSuggestion[] = [
    { key: "resume", title: `Tailor resume for ${o.role}`, notes: `Match bullets to: ${o.requiredSkills.join(", ") || "the posting"}.`, estimatedHours: 2, daysFromNow: 3 },
  ];
  if (g.employerQuestion) out.push({ key: "ask-employer", title: `Ask ${o.company} about CPT/OPT`, notes: g.employerQuestion, estimatedHours: 0.5, daysFromNow: 2 });
  if (p.isF1 && g.pathway === "CPT") out.push({ key: "dso-cpt", title: `Email DSO about CPT for ${o.company}`, notes: "Ask about curriculum fit, timeline and documents. Generate the draft in International Advisor.", estimatedHours: 0.5, daysFromNow: 5 });
  analysis.recommendations.slice(0, 2).forEach((r) =>
    out.push({ key: `skill-${r.skill}`, title: `Practice ${r.skill} for ${o.company} application`, notes: r.action, estimatedHours: 3, daysFromNow: 7 }),
  );
  if (o.source.kind === "live")
    out.push({ key: "apply", title: `Submit application: ${o.role}`, notes: `Apply on the employer site: ${o.source.applyUrl}. Check the posting for the real deadline.`, estimatedHours: 1, daysFromNow: 5 });
  return out;
}

export function careerTaskToAssignment(t: CareerTaskSuggestion, o: CareerOpportunity, dueISO: string): Omit<Assignment, "id" | "completed"> {
  return {
    course: `Career · ${o.company.replace(/\s*\(fictional\)\s*/i, "")}`,
    title: t.title,
    dueDate: dueISO,
    priority: t.key === "ask-employer" || t.key === "dso-cpt" ? "high" : "medium",
    color: "blush",
    estimatedHours: t.estimatedHours,
    notes: t.notes,
    origin: { module: "career", opportunityId: o.id },
  };
}

export function defaultDue(daysFromNow: number, now = new Date()): Date {
  const d = new Date(now.getTime() + daysFromNow * 86_400_000);
  d.setHours(18, 0, 0, 0);
  return d;
}

export const isAlreadyOnBoard = (assignments: Assignment[], o: CareerOpportunity, title: string) =>
  assignments.some((a) => a.origin?.opportunityId === o.id && a.title === title);
