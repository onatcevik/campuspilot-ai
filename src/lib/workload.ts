import { deadlineState } from "./deadlines";
import type { Assignment } from "./types";

export interface PlanBlock { assignmentId: string; title: string; course: string; hours: number; late: boolean }
export interface DayPlan { date: Date; label: string; blocks: PlanBlock[]; total: number }

const prio = { high: 0, medium: 1, low: 2 } as const;

/** Earliest-deadline-first scheduler with a daily focus-hour budget. Deterministic. */
export function buildWorkloadPlan(list: Assignment[], now: Date, dailyHours = 3, days = 5): { days: DayPlan[]; warnings: string[] } {
  const open = list
    .filter((a) => !a.completed)
    .sort((a, b) => {
      const ao = deadlineState(a, now) === "overdue" ? 0 : 1;
      const bo = deadlineState(b, now) === "overdue" ? 0 : 1;
      return ao - bo || a.dueDate.localeCompare(b.dueDate) || prio[a.priority] - prio[b.priority];
    });
  const plan: DayPlan[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return { date: d, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" }), blocks: [], total: 0 };
  });
  const warnings: string[] = [];
  for (const a of open) {
    let left = a.estimatedHours;
    const due = new Date(a.dueDate);
    for (const day of plan) {
      if (left <= 0) break;
      const overdue = due < now;
      if (!overdue && day.date > due) break;
      const free = dailyHours - day.total;
      if (free <= 0) continue;
      const h = Math.min(free, left);
      day.blocks.push({ assignmentId: a.id, title: a.title, course: a.course, hours: h, late: overdue });
      day.total += h;
      left -= h;
    }
    if (left > 0) warnings.push(`${a.title}: ${left}h won't fit before the deadline at ${dailyHours}h/day — consider extra focus time or asking for an extension.`);
  }
  return { days: plan, warnings };
}
