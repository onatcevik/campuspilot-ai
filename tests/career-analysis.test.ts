import { describe, expect, it } from "vitest";
import { buildAnalysisContext, deterministicAnalysis, sanitizeAIAnalysis } from "@/lib/career-analysis";
import { matchOpportunity } from "@/lib/matching";
import { deriveStudentProfile } from "@/lib/profile";
import { byId, makeState } from "./helpers";

const p = deriveStudentProfile(makeState());
const o = byId("o2"); // ML intern, verification-required
const m = matchOpportunity(o, makeState().career);

describe("deterministic analysis", () => {
  it("lists only matched skills as strengths and missing skills as gaps", () => {
    const a = deterministicAnalysis(o, m, p);
    expect(a.source).toBe("rule");
    expect(a.strengths.map((s) => s.skill).sort()).toEqual(["Python", "Statistics"]);
    expect(a.gaps.map((g) => g.skill)).toEqual(["Machine Learning", "PyTorch", "Pandas", "LLMs"]);
    expect(a.summary).toContain("55%");
  });

  it("links gaps to courses only when they exist in the student's plan", () => {
    const a = deterministicAnalysis(o, m, p);
    const ml = a.recommendations.find((r) => r.skill === "Machine Learning")!;
    expect(ml.course?.code).toBe("CS 360");
    expect(ml.course?.when).toBe("Spring 2028");
    expect(a.recommendations.find((r) => r.skill === "Pandas")?.course).toBeUndefined();
  });

  it("never claims evidence beyond the skill list (no invented projects)", () => {
    const a = deterministicAnalysis(o, m, p);
    for (const s of a.strengths) expect(s.evidence).toMatch(/profile skills/);
  });
});

describe("LLM context", () => {
  it("contains only facts and explicit rules, no PII beyond major", () => {
    const ctx = buildAnalysisContext(o, m, p);
    expect(ctx.listing.missingSkills).toEqual(["Machine Learning", "PyTorch", "Pandas", "LLMs"]);
    expect(ctx.listing.workAuthorization.status).toBe("verification-required");
    expect(JSON.stringify(ctx)).not.toContain("Alex");
  });
});

describe("AI output sanitizer", () => {
  it("accepts grounded output and labels it as Gemini", () => {
    const r = sanitizeAIAnalysis({
      summary: "Your Python and statistics background fits the modeling work in this role.",
      strengths: [{ skill: "python", evidence: "Core language for the role's prototyping." }],
      recommendations: [{ skill: "PyTorch", action: "Follow the official 60-minute tutorial and train a small classifier." }],
    }, o, m, p)!;
    expect(r.source).toBe("gemini");
    expect(r.strengths[0].skill).toBe("Python");
    expect(r.recommendations[0].skill).toBe("PyTorch");
    expect(r.recommendations[0].course?.code).toBe("CS 360"); // attached from verified data
  });

  it("drops invented strengths and recommendations for skills not in the listing", () => {
    const r = sanitizeAIAnalysis({
      summary: "Good fit.",
      strengths: [{ skill: "Kubernetes", evidence: "You led a K8s migration at your last internship." }, { skill: "Python", evidence: "Fits." }],
      recommendations: [{ skill: "Rust", action: "Learn Rust." }, { skill: "Pandas", action: "Do a Pandas project." }],
    }, o, m, p)!;
    expect(r.strengths.map((s) => s.skill)).toEqual(["Python"]);
    expect(r.recommendations.map((x) => x.skill)).toEqual(["Pandas"]);
    expect(r.caveats.join(" ")).toMatch(/2 AI statement/);
  });

  it("ignores course claims made by the model", () => {
    const r = sanitizeAIAnalysis({ summary: "ok", recommendations: [{ skill: "Pandas", action: "Take it.", course: { code: "CS 999", title: "Fake", when: "now" } }] }, o, m, p)!;
    expect(r.recommendations[0].course).toBeUndefined();
  });

  it("rejects output made only of employer-policy claims (UI falls back to rule-based)", () => {
    const r = sanitizeAIAnalysis({
      summary: "This company sponsors visas and is CPT-friendly.",
      strengths: [{ skill: "Python", evidence: "They accept CPT students who know Python." }],
      recommendations: [],
    }, o, m, p);
    expect(r).toBeNull();
  });

  it("strips a policy claim but keeps the grounded parts", () => {
    const r = sanitizeAIAnalysis({
      summary: "This company sponsors visas.",
      strengths: [{ skill: "Python", evidence: "Used for model prototyping in this role." }],
      recommendations: [],
    }, o, m, p)!;
    expect(r.summary).toBe(deterministicAnalysis(o, m, p).summary);
    expect(r.strengths.map((s) => s.skill)).toEqual(["Python"]);
    expect(r.caveats.join(" ")).toMatch(/1 AI statement/);
  });

  it("allows policy wording when the listing itself confirms it", () => {
    const o1 = byId("o1");
    const m1 = matchOpportunity(o1, makeState().career);
    const r = sanitizeAIAnalysis({ summary: "The listing states it accepts CPT students.", strengths: [], recommendations: [] }, o1, m1, p)!;
    expect(r.summary).toContain("accepts CPT");
  });

  it("returns null for garbage so the UI falls back to rule-based", () => {
    expect(sanitizeAIAnalysis(null, o, m, p)).toBeNull();
    expect(sanitizeAIAnalysis("text", o, m, p)).toBeNull();
    expect(sanitizeAIAnalysis({ strengths: [{ skill: "Rust", evidence: "x" }] }, o, m, p)).toBeNull();
  });
});
