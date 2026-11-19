import { describe, expect, it } from "vitest";
import { deterministicAnalysis } from "@/lib/career-analysis";
import { workAuthGuidance } from "@/lib/career-guidance";
import { careerTaskSuggestions } from "@/lib/career-tasks";
import { CAMPUS_OPPORTUNITIES, DEFAULT_CAREER, OPPORTUNITIES } from "@/lib/demo-data";
import { matchOpportunity } from "@/lib/matching";
import { deriveStudentProfile } from "@/lib/profile";
import { makeState } from "./helpers";

const job = CAMPUS_OPPORTUNITIES[0];
const profile = deriveStudentProfile(makeState());

describe("Campus opportunity (fictional demo)", () => {
  it("is the requested fictional role with no application URL", () => {
    expect(job).toMatchObject({ role: "Student IT Support Assistant", type: "Part-time (on-campus)", source: { kind: "demo" } });
    expect(job.company).toMatch(/Bay Atlantic University · Campus IT \(fictional demo\)/);
    expect([...job.requiredSkills, ...job.preferredSkills]).toEqual(["IT Support", "Troubleshooting", "Communication", "Basic Networking"]);
    expect(JSON.stringify(job)).not.toMatch(/https?:\/\//);
  });

  it("is kept out of the shared external listings (dashboard/Assistant unchanged)", () => {
    expect(OPPORTUNITIES.some((o) => o.id === job.id)).toBe(false);
  });

  it("uses the same deterministic matcher and grows with matching skills", () => {
    const base = matchOpportunity(job, DEFAULT_CAREER).score;
    const more = matchOpportunity(job, { ...DEFAULT_CAREER, skills: [...DEFAULT_CAREER.skills, "Troubleshooting"] }).score;
    expect(more).toBeGreaterThan(base);
  });

  it("demo profile (with IT Support, Communication, Basic Networking) scores 70% by the documented formula", () => {
    // required 2/3 → 40, preferred 1/1 → 25, field not targeted → 0, location DC → 5
    expect(matchOpportunity(job, DEFAULT_CAREER).score).toBe(70);
  });

  it("Fit Analysis works and lists real gaps only", () => {
    const a = deterministicAnalysis(job, matchOpportunity(job, DEFAULT_CAREER), profile);
    expect(a.gaps.map((g) => g.skill)).toEqual(["Troubleshooting"]);
    expect(a.strengths.map((x) => x.skill)).toEqual(["IT Support", "Communication", "Basic Networking"]);
    expect(a.caveats.join(" ")).toMatch(/fictional demo listing/);
  });

  it("gets on-campus guidance (not CPT/OPT) and no CPT task", () => {
    const g = workAuthGuidance(job, profile);
    expect(g.pathway).toBe("on-campus");
    expect(g.points.join(" ")).toMatch(/different rules than CPT and OPT/);
    expect(g.points.join(" ")).not.toMatch(/\d+\s*hours?/i); // no invented hour limits
    const tasks = careerTaskSuggestions(job, profile, deterministicAnalysis(job, matchOpportunity(job, DEFAULT_CAREER), profile), g);
    expect(tasks.some((t) => t.key === "dso-cpt")).toBe(false);
  });
});
