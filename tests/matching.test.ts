import { describe, expect, it } from "vitest";
import { DEFAULT_CAREER, OPPORTUNITIES } from "@/lib/demo-data";
import { MATCH_WEIGHTS, matchOpportunity, skillGaps } from "@/lib/matching";
import { listing } from "./helpers";

describe("deterministic skill matching", () => {
  it("weights sum to 100", () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("preserves the original demo scores exactly (regression baseline from commit c8b4dc0)", () => {
    const baseline = { o1: 83, o2: 55, o3: 60, o4: 13, o5: 25, o6: 72, o7: 40, o8: 33 };
    const now = Object.fromEntries(OPPORTUNITIES.map((o) => [o.id, matchOpportunity(o, DEFAULT_CAREER).score]));
    expect(now).toEqual(baseline);
  });

  it("computes each component from the documented formula", () => {
    // 1/2 required (30) + 0/1 preferred (0) + field match (10) + location match (5) = 45
    const m = matchOpportunity(listing(), { skills: ["python"], interests: ["Software Engineering"], preferredRegions: ["Washington, DC"] });
    expect(m.matchedRequired).toEqual(["Python"]); // case-insensitive
    expect(m.missingRequired).toEqual(["SQL"]);
    expect(m.score).toBe(45);
  });

  it("remote roles count as a location fit", () => {
    const m = matchOpportunity(listing({ region: "Maryland", remote: "Remote" }), { skills: [], interests: [], preferredRegions: ["Washington, DC"] });
    expect(m.locationMatch).toBe(true);
  });

  it("does not inflate scores when a listing has no preferred skills", () => {
    const p = { skills: [], interests: [], preferredRegions: [] as never[] };
    expect(matchOpportunity(listing({ preferredSkills: [] }), p).score).toBe(0);
  });

  it("flags listings with no skills as insufficient data", () => {
    const m = matchOpportunity(listing({ requiredSkills: [], preferredSkills: [] }), DEFAULT_CAREER);
    expect(m.insufficientData).toBe(true);
    expect(m.score).toBe(0);
  });

  it("adding a skill increases the score of listings that require it", () => {
    const o = OPPORTUNITIES.find((x) => x.id === "o2")!;
    const before = matchOpportunity(o, DEFAULT_CAREER).score;
    const after = matchOpportunity(o, { ...DEFAULT_CAREER, skills: [...DEFAULT_CAREER.skills, "Machine Learning"] }).score;
    expect(after).toBe(before + 20); // 1 more of 3 required = +20
  });

  it("skill gaps rank required gaps above preferred ones", () => {
    const gaps = skillGaps(OPPORTUNITIES, DEFAULT_CAREER);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].weight).toBeGreaterThanOrEqual(gaps[gaps.length - 1].weight);
  });
});
