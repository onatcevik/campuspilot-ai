import type { Assignment } from "./types";

export type DeadlineState = "done" | "overdue" | "due-2h" | "due-24h" | "upcoming";

export function deadlineState(a: Assignment, now: Date): DeadlineState {
  if (a.completed) return "done";
  const ms = new Date(a.dueDate).getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= 2 * 3600_000) return "due-2h";
  if (ms <= 24 * 3600_000) return "due-24h";
  return "upcoming";
}

export function remainingLabel(a: Assignment, now: Date): string {
  const ms = new Date(a.dueDate).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const hours = Math.floor(abs / 3600_000);
  const days = Math.floor(abs / 86_400_000);
  let text: string;
  if (mins < 60) text = `${mins} min`;
  else if (hours < 48) text = `${hours}h ${Math.round((abs % 3600_000) / 60_000)}m`;
  else text = `${days} day${days === 1 ? "" : "s"}`;
  return ms < 0 ? `${text} overdue` : `${text} left`;
}

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

/** "This week" = Monday 00:00 through next Monday 00:00 plus any still-open overdue items. */
export function weeklyAssignments(list: Assignment[], now: Date): Assignment[] {
  const start = startOfWeek(now).getTime();
  const end = start + 7 * 86_400_000;
  return list.filter((a) => {
    const t = new Date(a.dueDate).getTime();
    return (t >= start && t < end) || (!a.completed && t < start);
  });
}

export function weeklyProgress(list: Assignment[], now: Date) {
  const week = weeklyAssignments(list, now);
  const done = week.filter((a) => a.completed).length;
  return { total: week.length, done, pct: week.length ? Math.round((done / week.length) * 100) : 0 };
}

export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const DAY_MS = 86_400_000;

export function addWeeks(weekStart: Date, n: number): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + n * 7);
  return d;
}

const dayAt = (weekStart: Date, i: number) => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + i); // calendar arithmetic: safe across daylight-saving changes
  d.setHours(0, 0, 0, 0);
  return d;
};

export function weekLabel(weekStart: Date): string {
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(dayAt(weekStart, 0))} – ${f(dayAt(weekStart, 6))}`;
}

/**
 * Assignments for the week starting at `weekStart`, grouped by due day (Mon..Sun).
 * For the CURRENT week, still-open items that were due before Monday are returned in `carriedOver`
 * (they count toward this week's progress, matching weeklyAssignments()).
 */
export function groupWeek(list: Assignment[], weekStart: Date, now: Date) {
  const start = dayAt(weekStart, 0).getTime();
  const isCurrent = startOfWeek(now).getTime() === start;
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = dayAt(weekStart, i).getTime();
    const to = dayAt(weekStart, i + 1).getTime();
    const items = list
      .filter((a) => { const t = new Date(a.dueDate).getTime(); return t >= from && t < to; })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const date = new Date(from);
    return { date, items, isToday: date.toDateString() === now.toDateString() };
  });
  const carriedOver = isCurrent
    ? list.filter((a) => !a.completed && new Date(a.dueDate).getTime() < start).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : [];
  const all = [...carriedOver, ...days.flatMap((d) => d.items)];
  const done = all.filter((a) => a.completed).length;
  return { days, carriedOver, isCurrent, total: all.length, done, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}
