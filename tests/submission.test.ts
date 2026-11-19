import { describe, expect, it } from "vitest";
import { buildAssistantContext } from "@/lib/assistant/context";
import { groupWeek, hasOpenWork, splitAllTasks, startOfWeek, visibleDays, weeklyProgress } from "@/lib/deadlines";
import { seedAssignments } from "@/lib/demo-data";
import { extensionRequestEmail } from "@/lib/emails";
import { buildRecommendations } from "@/lib/recommendations";
import { boardStatus, needsAttention, setSubmissionStatus, sortForBoard } from "@/lib/submission";
import type { Assignment } from "@/lib/types";
import { buildWorkloadPlan } from "@/lib/workload";
import { makeState } from "./helpers";

const NOW = new Date("2026-11-19T14:00:00"); // Thursday
const base = seedAssignments(NOW); // a3 = "API documentation draft", overdue by 26h, not completed
/** The exact order the Week view renders: Needs attention → carried over → Mon..Sun (open) → Completed. */
const renderedOrder = (w: ReturnType<typeof groupWeek>) =>
  [...w.needsAttention, ...w.carriedOver, ...w.days.flatMap((d) => d.items), ...w.completed].map((a) => a.id);
const mk = (id: string, due: string, completed = false, extra: Partial<Assignment> = {}): Assignment => ({
  ...base[0], id, title: id, dueDate: new Date(due).toISOString(), completed, ...extra,
});

describe("ordering: unfinished first, completed at the bottom", () => {
  it("sorts unfinished by due date, then completed by due date, ties by id (stable)", () => {
    const list = [
      mk("c-early", "2026-11-17T09:00", true),
      mk("u-late", "2026-11-20T09:00"),
      mk("u-early", "2026-11-18T09:00"),
      mk("c-late", "2026-11-21T09:00", true),
      mk("u-tie-b", "2026-11-19T09:00"),
      mk("u-tie-a", "2026-11-19T09:00"),
    ];
    expect(sortForBoard(list).map((a) => a.id)).toEqual(["u-early", "u-tie-a", "u-tie-b", "u-late", "c-early", "c-late"]);
    expect(sortForBoard(sortForBoard(list)).map((a) => a.id)).toEqual(sortForBoard(list).map((a) => a.id)); // idempotent
  });

  it("completed tasks stay visible (bottom section) and progress is unchanged by the layout", () => {
    const w = groupWeek(base, startOfWeek(NOW), NOW);
    expect(w.completed.length).toBeGreaterThan(0);
    expect({ total: w.total, done: w.done, pct: w.pct }).toEqual(weeklyProgress(base, NOW));
  });

  it("REGRESSION: an unfinished Sunday task renders ABOVE a completed Saturday task (completed leave the day grouping)", () => {
    const sat = mk("completed-sat", "2026-11-21T10:00", true);
    const sun = mk("open-sun", "2026-11-22T10:00");
    const w = groupWeek([sat, sun], startOfWeek(NOW), NOW);
    expect(renderedOrder(w)).toEqual(["open-sun", "completed-sat"]);
    expect(w.days[5].items).toEqual([]); // Saturday has no open items…
    expect(w.days[5].completedCount).toBe(1); // …but remembers it had a completed one
    expect(w.completed[0].dueDate).toBe(sat.dueDate); // original due date preserved
  });

  it("all completed tasks sit after ALL unfinished tasks of the week, sorted by original due date", () => {
    const list = [
      mk("done-mon", "2026-11-16T09:00", true), mk("open-tue", "2026-11-17T09:00"),
      mk("done-sun", "2026-11-22T09:00", true), mk("open-sat", "2026-11-21T09:00"),
      mk("done-wed", "2026-11-18T09:00", true),
    ];
    expect(renderedOrder(groupWeek(list, startOfWeek(NOW), NOW))).toEqual(["open-tue", "open-sat", "done-mon", "done-wed", "done-sun"]);
  });

  it("marking complete moves a task to the bottom; marking incomplete returns it to its weekday", () => {
    const list = [mk("t1", "2026-11-18T09:00"), mk("t2", "2026-11-20T09:00")];
    const done = list.map((a) => (a.id === "t1" ? { ...a, completed: true } : a));
    expect(renderedOrder(groupWeek(done, startOfWeek(NOW), NOW))).toEqual(["t2", "t1"]);
    const undone = done.map((a) => (a.id === "t1" ? { ...a, completed: false } : a));
    const w = groupWeek(undone, startOfWeek(NOW), NOW);
    expect(w.days[2].items.map((a) => a.id)).toEqual(["t1"]); // back on Wednesday
    expect(renderedOrder(w)).toEqual(["t1", "t2"]);
  });

  it("every assignment appears exactly once and progress is unchanged", () => {
    const list = setSubmissionStatus(base, "a3", "closed", NOW);
    const w = groupWeek(list, startOfWeek(NOW), NOW);
    const ids = renderedOrder(w);
    expect(new Set(ids).size).toBe(ids.length);
    expect(w.completed.every((a) => a.completed)).toBe(true);
    expect(w.days.flatMap((d) => d.items).every((a) => !a.completed)).toBe(true);
    expect({ total: w.total, done: w.done, pct: w.pct }).toEqual(weeklyProgress(list, NOW));
  });

  it("minimal week view: only weekdays with unfinished work are shown (no empty day sections)", () => {
    const list = [mk("done-sat", "2026-11-21T10:00", true), mk("open-sun", "2026-11-22T10:00"), mk("open-tue", "2026-11-17T10:00")];
    const w = groupWeek(list, startOfWeek(NOW), NOW);
    expect(visibleDays(w).map((d) => d.date.toLocaleDateString("en-US", { weekday: "long" }))).toEqual(["Tuesday", "Sunday"]);
    expect(visibleDays(w).map((d) => d.index)).toEqual([1, 6]); // anchors keep their weekday index
    expect(hasOpenWork(w)).toBe(true);
    expect(w.completed.map((a) => a.id)).toEqual(["done-sat"]); // Saturday's completed note is only at the bottom
  });

  it("a week with nothing unfinished shows no day sections (single empty state) but keeps completed notes", () => {
    const w = groupWeek([mk("done-mon", "2026-11-16T10:00", true), mk("done-fri", "2026-11-20T10:00", true)], startOfWeek(NOW), NOW);
    expect(visibleDays(w)).toEqual([]);
    expect(hasOpenWork(w)).toBe(false);
    expect(w.completed).toHaveLength(2);
    expect(w.pct).toBe(100);
  });

  it("carried-over overdue work counts as open work even if no weekday has any", () => {
    const w = groupWeek([mk("old", "2026-11-10T10:00")], startOfWeek(NOW), NOW);
    expect(visibleDays(w)).toEqual([]);
    expect(hasOpenWork(w)).toBe(true);
  });

  it("Needs attention stays at the top, never below completed", () => {
    const list = [mk("done", "2026-11-17T09:00", true), mk("closed", "2026-11-18T09:00", false, { submission: "closed" })];
    expect(renderedOrder(groupWeek(list, startOfWeek(NOW), NOW))).toEqual(["closed", "done"]);
  });

  it("All Tasks view: unfinished first, then completed, needs-attention separate", () => {
    const list = [mk("done-early", "2026-11-10T09:00", true), mk("open-late", "2026-12-01T09:00"), mk("closed", "2026-11-18T09:00", false, { submission: "closed" })];
    const v = splitAllTasks(list);
    expect([...v.needsAttention, ...v.open, ...v.completed].map((a) => a.id)).toEqual(["closed", "open-late", "done-early"]);
  });
});

describe("overdue vs submission closed vs completed", () => {
  const a3 = base.find((a) => a.id === "a3")!;

  it("a passed deadline alone means overdue with UNKNOWN availability, never closed", () => {
    expect(boardStatus(a3, NOW)).toBe("overdue");
    expect(a3.submission).toBeUndefined();
    expect(needsAttention(a3)).toBe(false);
  });

  it("student can mark late-allowed or closed without completing it", () => {
    const late = setSubmissionStatus(base, "a3", "late-allowed", NOW).find((a) => a.id === "a3")!;
    expect(boardStatus(late, NOW)).toBe("late-allowed");
    expect(late.completed).toBe(false);
    const closed = setSubmissionStatus(base, "a3", "closed", NOW).find((a) => a.id === "a3")!;
    expect(boardStatus(closed, NOW)).toBe("closed");
    expect(closed.completed).toBe(false);
    expect(needsAttention(closed)).toBe(true);
  });

  it("is reversible, immutable, and only touches the target assignment", () => {
    const closedList = setSubmissionStatus(base, "a3", "closed", NOW);
    const undone = setSubmissionStatus(closedList, "a3", "unknown", NOW);
    expect(undone.find((a) => a.id === "a3")!.submission).toBeUndefined();
    expect(base.find((a) => a.id === "a3")!.submission).toBeUndefined(); // original untouched
    expect(undone.filter((a) => a.id !== "a3")).toEqual(base.filter((a) => a.id !== "a3"));
    expect(undone).toHaveLength(base.length); // never deleted
  });

  it("completion takes precedence: a closed item the student later completes is completed, not in Needs attention", () => {
    const list = setSubmissionStatus(base, "a3", "closed", NOW).map((a) => (a.id === "a3" ? { ...a, completed: true } : a));
    const a = list.find((x) => x.id === "a3")!;
    expect(boardStatus(a, NOW)).toBe("completed");
    expect(needsAttention(a)).toBe(false);
  });

  it("closed items appear ONLY in Needs attention (no duplicates) and are never counted as completed", () => {
    const list = setSubmissionStatus(base, "a3", "closed", NOW);
    const w = groupWeek(list, startOfWeek(NOW), NOW);
    expect(w.needsAttention.map((a) => a.id)).toEqual(["a3"]);
    const elsewhere = [...w.carriedOver, ...w.days.flatMap((d) => d.items), ...w.completed].map((a) => a.id);
    expect(elsewhere).not.toContain("a3");
    const before = groupWeek(base, startOfWeek(NOW), NOW);
    expect(w.total).toBe(before.total); // still part of the week's history
    expect(w.done).toBe(before.done); // not counted as completed
  });
});

describe("cross-module effects", () => {
  it("dashboard alerts distinguish overdue / late-allowed / closed", () => {
    const recs = (list: Assignment[]) => buildRecommendations(makeState({ assignments: list }), NOW);
    expect(recs(base).find((r) => r.id === "ov-a3")!.detail).toMatch(/Check whether late submission is allowed/);
    expect(recs(setSubmissionStatus(base, "a3", "late-allowed", NOW)).find((r) => r.id === "late-a3")!.severity).toBe("warning");
    const closed = recs(setSubmissionStatus(base, "a3", "closed", NOW)).find((r) => r.id === "closed-a3")!;
    expect(closed.title).toMatch(/Needs attention/);
    expect(closed.detail).toMatch(/You reported/);
  });

  it("the study planner doesn't schedule time for closed submissions", () => {
    const blocks = (list: Assignment[]) => buildWorkloadPlan(list, NOW).days.flatMap((d) => d.blocks.map((b) => b.assignmentId));
    expect(blocks(base)).toContain("a3");
    expect(blocks(setSubmissionStatus(base, "a3", "closed", NOW))).not.toContain("a3");
  });

  it("the assistant sees the student-reported status in its facts", () => {
    const facts = (list: Assignment[]) => buildAssistantContext("What should I work on this week?", makeState({ assignments: list }), NOW).facts.map((f) => f.text).join("\n");
    expect(facts(base)).toMatch(/API documentation draft.*submission availability unknown/);
    expect(facts(setSubmissionStatus(base, "a3", "closed", NOW))).toMatch(/API documentation draft.*SUBMISSION CLOSED \(student-reported, not completed\)/);
  });

  it("extension request is an editable draft with placeholders and the assignment details", () => {
    const e = extensionRequestEmail(base.find((a) => a.id === "a3")!);
    expect(e.subject).toBe("Extension request: API documentation draft (ELE 4 · Technical Writing)");
    expect(e.body).toMatch(/\[Name\]/);
    expect(e.body).toMatch(/\[proposed date\]/);
  });
});
