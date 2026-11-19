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
