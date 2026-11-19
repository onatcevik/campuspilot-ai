import { describe, expect, it } from "vitest";
import { workAuthGuidance } from "@/lib/career-guidance";
import { careerTaskSuggestions, careerTaskToAssignment, isAlreadyOnBoard } from "@/lib/career-tasks";
import { deterministicAnalysis } from "@/lib/career-analysis";
import { buildScenarioPlan, SCENARIOS } from "@/lib/graduation";
import { matchOpportunity } from "@/lib/matching";
import { availabilityFor, deriveStudentProfile } from "@/lib/profile";
import { buildRecommendations } from "@/lib/recommendations";
import { byId, makeState } from "./helpers";

const accelerated = buildScenarioPlan(SCENARIOS.find((s) => s.id === "accelerated")!);
const standard = buildScenarioPlan(SCENARIOS.find((s) => s.id === "standard")!);

describe("shared student profile (Graduation Planner → Career)", () => {
  it("projected graduation follows the graduation plan", () => {
    expect(deriveStudentProfile(makeState({ plan: accelerated })).projectedGraduation).toBe("May 2028");
    expect(deriveStudentProfile(makeState({ plan: standard })).projectedGraduation).toBe("May 2029");
  });

  it("draft plan with a prerequisite conflict is not on track", () => {
    expect(deriveStudentProfile(makeState()).graduationOnTrack).toBe(false);
    expect(deriveStudentProfile(makeState({ plan: accelerated })).graduationOnTrack).toBe(true);
  });

  it("internship availability changes with planned summer credits", () => {
    expect(deriveStudentProfile(makeState()).nextInternshipWindow?.level).toBe("part-time"); // draft: 6 cr in Summer 2027
    expect(deriveStudentProfile(makeState({ plan: accelerated })).nextInternshipWindow?.level).toBe("limited"); // 9 cr
    // standard plan schedules no summers before graduation → Summer 2027 is open
    const std = deriveStudentProfile(makeState({ plan: standard }));
    expect(std.nextInternshipWindow?.label).toBe("Summer 2027");
    expect(std.nextInternshipWindow?.level).toBe("full-time");
  });

  it("availability heuristic thresholds", () => {
    const summer = { id: "x", season: "Summer" as const, year: 2027, label: "Summer 2027", order: 2 };
    const fall = { ...summer, season: "Fall" as const, label: "Fall 2027" };
    expect(availabilityFor(summer, 0).level).toBe("full-time");
    expect(availabilityFor(summer, 6).level).toBe("part-time");
    expect(availabilityFor(summer, 9).level).toBe("limited");
    expect(availabilityFor(fall, 12).level).toBe("part-time");
    expect(availabilityFor(fall, 15).level).toBe("limited");
  });

  it("career skills edits flow into the profile (single source of truth)", () => {
    const s = makeState();
    s.career.skills.push("Docker");
    expect(deriveStudentProfile(s).skills).toContain("Docker");
  });
});

describe("International Advisor → Career guidance", () => {
  it("internships point to CPT and ask the employer when the listing is silent", () => {
    const g = workAuthGuidance(byId("o2"), deriveStudentProfile(makeState()));
    expect(g.pathway).toBe("CPT");
    expect(g.employerQuestion).toMatch(/does not say/);
  });

  it("confirmed listings need no employer question", () => {
    expect(workAuthGuidance(byId("o1"), deriveStudentProfile(makeState())).employerQuestion).toBeNull();
  });

  it("restricted listings never suggest CPT/OPT as a workaround", () => {
    const g = workAuthGuidance(byId("o4"), deriveStudentProfile(makeState()));
    expect(g.pathway).toBe("none");
    expect(g.points.join(" ")).toMatch(/does not change/);
  });

  it("new-grad roles use the OPT window computed from the I-20 end date", () => {
    const p = deriveStudentProfile(makeState({ intl: { ...makeState().intl, programEndDate: "2028-05-15" } }));
    const g = workAuthGuidance(byId("o7"), p);
    expect(g.pathway).toBe("OPT");
    expect(g.points[0]).toContain("Feb 15, 2028"); // 90 days before
    expect(g.points[0]).toContain("Jul 14, 2028"); // 60 days after
  });

  it("non-F-1 students get no immigration steps", () => {
    const p = deriveStudentProfile(makeState({ intl: { ...makeState().intl, status: "Not an international student" } }));
    expect(workAuthGuidance(byId("o2"), p).pathway).toBe("none");
  });
});

describe("Career → Study Board tasks", () => {
  const p = deriveStudentProfile(makeState());
  const o = byId("o2");
  const analysis = deterministicAnalysis(o, matchOpportunity(o, p as never), p);
  const tasks = careerTaskSuggestions(o, p, analysis, workAuthGuidance(o, p));

  it("suggests resume, employer question, DSO and skill tasks", () => {
    expect(tasks.map((t) => t.key)).toEqual(expect.arrayContaining(["resume", "ask-employer", "dso-cpt"]));
    expect(tasks.some((t) => t.key.startsWith("skill-"))).toBe(true);
  });

  it("converts to a Study Board assignment linked to the listing", () => {
    const a = careerTaskToAssignment(tasks[0], o, "2026-12-01T18:00:00.000Z");
    expect(a.origin).toEqual({ module: "career", opportunityId: "o2" });
    expect(a.course).toBe("Career · Capitol Signal AI");
    expect(a.dueDate).toBe("2026-12-01T18:00:00.000Z");
  });

  it("detects tasks already on the board", () => {
    const a = { ...careerTaskToAssignment(tasks[0], o, "2026-12-01T18:00:00.000Z"), id: "x", completed: false };
    expect(isAlreadyOnBoard([a], o, tasks[0].title)).toBe(true);
    expect(isAlreadyOnBoard([a], byId("o1"), tasks[0].title)).toBe(false);
  });
});

describe("dashboard recommendations react to other modules", () => {
  const now = new Date("2026-11-19T12:00:00");
  it("prerequisite alert disappears after applying the accelerated plan", () => {
    expect(buildRecommendations(makeState(), now).some((r) => r.id === "prereq")).toBe(true);
    expect(buildRecommendations(makeState({ plan: accelerated }), now).some((r) => r.id === "prereq")).toBe(false);
  });
  it("standard plan past the I-20 date raises a DSO alert", () => {
    expect(buildRecommendations(makeState({ plan: standard }), now).some((r) => r.id === "i20-ext")).toBe(true);
  });
  it("applying to an internship surfaces CPT planning", () => {
    expect(buildRecommendations(makeState({ statuses: { o2: "applied" } }), now).some((r) => r.id === "cpt-apps")).toBe(true);
  });
});
