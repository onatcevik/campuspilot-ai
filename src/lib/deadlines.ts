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

/** Unfinished first, completed last; each group by due date, ties broken by id. Stable and predictable. */
export function sortForBoard(list: Assignment[]): Assignment[] {
  return [...list].sort(
    (a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
  );
}

const isClosedOpen = (a: Assignment) => !a.completed && a.submission === "closed";

/**
 * Week view model for the week starting at `weekStart`. Order on screen:
 *   needsAttention (top) → carriedOver → days Mon..Sun (UNFINISHED only) → completed (bottom, whole week).
 * - Completed assignments are pulled out of the day grouping entirely and listed once in `completed`,
 *   sorted by their original due date (the card still shows that date).
 * - Items the student reported as "submission closed" (and not completed) appear ONLY in `needsAttention`.
 * - Every assignment appears in at most one list. Totals/progress are unchanged by this layout.
 */
export function groupWeek(list: Assignment[], weekStart: Date, now: Date) {
  const start = dayAt(weekStart, 0).getTime();
  const end = dayAt(weekStart, 7).getTime();
  const isCurrent = startOfWeek(now).getTime() === start;
  const due = (a: Assignment) => new Date(a.dueDate).getTime();
  const inWeek = (a: Assignment) => due(a) >= start && due(a) < end;
  const carried = (a: Assignment) => isCurrent && !a.completed && due(a) < start;
  const openNormal = (a: Assignment) => !a.completed && !isClosedOpen(a);
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = dayAt(weekStart, i).getTime();
    const to = dayAt(weekStart, i + 1).getTime();
    const all = list.filter((a) => due(a) >= from && due(a) < to);
    const items = sortForBoard(all.filter(openNormal));
    const date = new Date(from);
    return { date, items, completedCount: all.filter((a) => a.completed).length, isToday: date.toDateString() === now.toDateString() };
  });
  const carriedOver = sortForBoard(list.filter((a) => carried(a) && !isClosedOpen(a)));
  const needsAttention = sortForBoard(list.filter((a) => isClosedOpen(a)));
  const completed = sortForBoard(list.filter((a) => a.completed && inWeek(a)));
  const counted = list.filter((a) => inWeek(a) || carried(a));
  const done = counted.filter((a) => a.completed).length;
  return { days, carriedOver, needsAttention, completed, isCurrent, total: counted.length, done, pct: counted.length ? Math.round((done / counted.length) * 100) : 0 };
}

/** All Tasks view model: needs attention, then every unfinished task (by due date), then every completed task. */
export function splitAllTasks(list: Assignment[]) {
  return {
    needsAttention: sortForBoard(list.filter(isClosedOpen)),
    open: sortForBoard(list.filter((a) => !a.completed && !isClosedOpen(a))),
    completed: sortForBoard(list.filter((a) => a.completed)),
  };
}

type WeekModel = ReturnType<typeof groupWeek>;

/** Only weekdays that still have unfinished work are shown — no empty day headings or placeholder rows. */
export const visibleDays = (w: WeekModel) => w.days.map((d, index) => ({ ...d, index })).filter((d) => d.items.length > 0);

/** True when the week has any unfinished work to show above the Completed section (excluding Needs Attention). */
export const hasOpenWork = (w: WeekModel) => w.carriedOver.length > 0 || w.days.some((d) => d.items.length > 0);
