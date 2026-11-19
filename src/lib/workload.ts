import { prioritize } from "./prioritize";
import type { Assignment } from "./types";

/**
 * - "check-late-policy": overdue with UNKNOWN availability → only a short block to check the policy, not the full workload.
 * - "late-allowed": overdue, student reported late work is accepted → full estimated hours.
 */
export type BlockKind = "normal" | "check-late-policy" | "late-allowed";
export interface PlanBlock { assignmentId: string; title: string; course: string; hours: number; late: boolean; kind: BlockKind }
export interface DayPlan { date: Date; label: string; blocks: PlanBlock[]; total: number }

/** Time for a "check whether late submission is allowed" step (syllabus / quick email), before any substantial work. */
export const CHECK_POLICY_HOURS = 0.5;

/**
 * Deterministic planner with a daily focus-hour budget. Order comes from the shared prioritize() so the
 * Assistant, dashboard and planner agree. Completed and closed-submission work is never planned.
 */
export function buildWorkloadPlan(list: Assignment[], now: Date, dailyHours = 3, days = 5): { days: DayPlan[]; warnings: string[] } {
  const queue = prioritize(list, now);
  const plan: DayPlan[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return { date: d, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" }), blocks: [], total: 0 };
  });
  const warnings: string[] = [];
  for (const a of queue) {
    const tier = a.priorityInfo.tier;
    const kind: BlockKind = tier === "overdue-unknown" ? "check-late-policy" : tier === "late-allowed" ? "late-allowed" : "normal";
    let left = kind === "check-late-policy" ? Math.min(CHECK_POLICY_HOURS, a.estimatedHours) : a.estimatedHours;
    const due = new Date(a.dueDate);
    const overdue = due < now;
    for (const day of plan) {
      if (left <= 0) break;
      if (!overdue && day.date > due) break;
      const free = dailyHours - day.total;
      if (free <= 0) continue;
      const h = Math.min(free, left);
      day.blocks.push({ assignmentId: a.id, title: a.title, course: a.course, hours: h, late: overdue, kind });
      day.total += h;
      left -= h;
    }
    if (left > 0 && kind !== "check-late-policy")
      warnings.push(`${a.title}: ${left}h won't fit before the deadline at ${dailyHours}h/day — consider extra focus time or asking for an extension.`);
  }
  return { days: plan, warnings };
}
