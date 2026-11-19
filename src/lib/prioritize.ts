// One deterministic prioritization used by the study planner, the Assistant and the dashboard,
// so every module ranks work the same way. Status comes from boardStatus() (the Study Board's source of truth).
//
// Tiers (higher = do first):
//   due within 2h ............. 100   (a real deadline is about to pass)
//   due within 24h ............  80
//   overdue, late allowed .....  70   (student reported it's still accepted, but no fixed cutoff now)
//   overdue, availability ?....  65   (quick action needed: check the late policy before investing hours)
//   due within 72h ............  50
//   later .....................  20
// Adjustments: high priority +8, medium +4; a task whose estimate exceeds the time left before its deadline +5.
// Excluded entirely: completed, and submission closed (those go to "Needs attention").
// Ties: earlier due date, then smaller estimate, then id. Same inputs → same order.
import { boardStatus } from "./submission";
import type { Assignment } from "./types";

export interface PriorityInfo { score: number; tier: string; reason: string }

const H = 3600_000;

export function priorityOf(a: Assignment, now: Date): PriorityInfo | null {
  const st = boardStatus(a, now);
  if (st === "completed" || st === "closed") return null;
  const hoursLeft = (new Date(a.dueDate).getTime() - now.getTime()) / H;
  let score: number, tier: string, reason: string;
  if (st === "due-2h") [score, tier, reason] = [100, "due-2h", "due in under 2 hours"];
  else if (st === "due-24h") [score, tier, reason] = [80, "due-24h", "due within 24 hours"];
  else if (st === "late-allowed") [score, tier, reason] = [70, "late-allowed", "overdue; late submission allowed (you reported)"];
  else if (st === "overdue") [score, tier, reason] = [65, "overdue-unknown", "overdue; submission availability unknown, so check the late policy first"];
  else if (hoursLeft <= 72) [score, tier, reason] = [50, "due-72h", "due within 3 days"];
  else [score, tier, reason] = [20, "later", "due later"];
  score += a.priority === "high" ? 8 : a.priority === "medium" ? 4 : 0;
  if (hoursLeft > 0 && a.estimatedHours > hoursLeft) score += 5; // won't fit unless started now
  return { score, tier, reason };
}

/** Actionable (not completed, not closed) assignments in priority order. */
export function prioritize(list: Assignment[], now: Date): (Assignment & { priorityInfo: PriorityInfo })[] {
  return list
    .map((a) => ({ a, p: priorityOf(a, now) }))
    .filter((x): x is { a: Assignment; p: PriorityInfo } => x.p !== null)
    .sort((x, y) => y.p.score - x.p.score || x.a.dueDate.localeCompare(y.a.dueDate) || x.a.estimatedHours - y.a.estimatedHours || x.a.id.localeCompare(y.a.id))
    .map(({ a, p }) => ({ ...a, priorityInfo: p }));
}
