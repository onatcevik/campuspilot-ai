import { describe, expect, it } from "vitest";
import { handOffQuestion } from "@/lib/assistant/handoff";
import { addWeeks, groupWeek, startOfWeek, weekLabel, weeklyProgress } from "@/lib/deadlines";
import { INITIAL_PLAN, seedAssignments } from "@/lib/demo-data";
import {
  buildScenarioPlan, courseById, criticalPath, eligibleCreditsAtStart, explainConflicts, explainScenario, longestChains, SCENARIOS, termToGraduationDate, validatePlan,
} from "@/lib/graduation";
import type { Assignment } from "@/lib/types";

const NOW = new Date("2026-11-19T14:00:00"); // Thursday
const list = seedAssignments(NOW);

describe("Study Board week view", () => {
  it("groups the current week by day with Monday first", () => {
    const w = groupWeek(list, startOfWeek(NOW), NOW);
    expect(w.days).toHaveLength(7);
    expect(w.days[0].date.getDay()).toBe(1); // Monday
    expect(w.days[3].isToday).toBe(true); // Thursday
    expect(w.isCurrent).toBe(true);
    const ids = w.days.flatMap((d) => d.items.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length); // no assignment appears twice
  });

  it("matches the dashboard's weekly progress for the current week (single source of truth)", () => {
    const w = groupWeek(list, startOfWeek(NOW), NOW);
    const p = weeklyProgress(list, NOW);
    expect({ total: w.total, done: w.done, pct: w.pct }).toEqual(p);
  });

  it("carries open overdue work from earlier weeks into the current week only", () => {
    const old: Assignment = { ...list[0], id: "old", dueDate: "2026-11-10T12:00:00", completed: false };
    const cur = groupWeek([...list, old], startOfWeek(NOW), NOW);
    expect(cur.carriedOver.map((a) => a.id)).toContain("old");
    const prev = groupWeek([...list, old], addWeeks(startOfWeek(NOW), -1), NOW);
    expect(prev.carriedOver).toEqual([]);
    expect(prev.days.flatMap((d) => d.items).map((a) => a.id)).toContain("old");
  });

  it("navigates weeks and labels them", () => {
    const next = addWeeks(startOfWeek(NOW), 1);
    expect(weekLabel(startOfWeek(NOW))).toBe("Nov 16 – Nov 22");
    expect(weekLabel(next)).toBe("Nov 23 – Nov 29");
    expect(groupWeek(list, next, NOW).isCurrent).toBe(false);
  });

  it("keeps day boundaries correct across a daylight-saving change", () => {
    const dstWeek = new Date("2026-10-26T00:00:00"); // US DST ends Sun Nov 1, 2026
    const a: Assignment = { ...list[0], id: "late-sunday", dueDate: new Date("2026-11-01T23:30:00").toISOString(), completed: false };
    const w = groupWeek([a], dstWeek, new Date("2026-10-28T12:00:00"));
    expect(w.days[6].items.map((x) => x.id)).toEqual(["late-sunday"]);
    expect(w.days[6].date.getHours()).toBe(0);
  });
});

describe("Graduation explanations (deterministic)", () => {
  it("finds the longest prerequisite chains", () => {
    const chains = longestChains();
    expect(chains.length).toBeGreaterThan(1);
    expect(chains.every((c) => c.length === 4)).toBe(true);
    expect(chains.map((c) => c.join(">"))).toContain("CS102>SWE410>SWE490>SWE491");
    expect(criticalPath()[0]).toBe("CS102");
  });

  it("only CS 101-dependent courses are eligible at the start (9 credits)", () => {
    expect(eligibleCreditsAtStart()).toBe(9);
  });

  it("explains the demo conflict with the earliest valid term and downstream impact", () => {
    const [fix] = explainConflicts(INITIAL_PLAN);
    expect(fix.courseId).toBe("SWE410");
    expect(fix.missing).toBe("CS102");
    expect(fix.earliestTermId).toBe("2027-SU");
    expect(fix.blocks.sort()).toEqual(["SWE420", "SWE490", "SWE491"]);
  });

  it("applying the suggested fix actually resolves the conflict", () => {
    const [fix] = explainConflicts(INITIAL_PLAN);
    const fixed = validatePlan({ ...INITIAL_PLAN, [fix.courseId]: fix.earliestTermId! });
    expect(fixed.prereqIssues).toEqual([]);
  });

  it("scenario explanations agree with the scheduler's own results", () => {
    for (const s of SCENARIOS) {
      const why = explainScenario(s);
      const v = validatePlan(buildScenarioPlan(s));
      expect(why.projected).toBe(termToGraduationDate(v.projectedTerm));
      expect(why.reasons[0]).toContain(why.chain.map((id) => courseById[id].code).join(" → "));
    }
    expect(explainScenario(SCENARIOS[0]).reasons.join(" ")).toMatch(/spill into Spring 2029/);
    expect(explainScenario(SCENARIOS[1]).projected).toBe("May 2028");
  });
});

describe("Assistant handoff", () => {
  it("fails safely when sessionStorage is unavailable (never throws)", () => {
    expect(handOffQuestion("What should I work on this week?")).toBe(false);
  });
});
