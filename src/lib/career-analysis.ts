// Career fit analysis. The deterministic match score is the source of truth; the optional LLM layer only explains it.
// Every AI output passes through sanitizeAIAnalysis(), which drops anything not grounded in verified facts.
import type { MatchResult } from "./matching";
import type { StudentProfile } from "./profile";
import type { CareerOpportunity } from "./types";

export interface CourseRef { code: string; title: string; when: string }
export interface AnalysisRecommendation { skill: string; action: string; course?: CourseRef }

export interface CareerAnalysis {
  source: "gemini" | "rule";
  summary: string;
  strengths: { skill: string; evidence: string }[];
  gaps: { skill: string; importance: "required" | "preferred" }[];
  recommendations: AnalysisRecommendation[];
  caveats: string[];
}

/** Demo-curriculum mapping from skills to courses that cover them. Only used when the course is actually in the student's record or plan. */
export const SKILL_COURSES: Record<string, string> = {
  "Machine Learning": "CS360", PyTorch: "CS360", TensorFlow: "CS360", "scikit-learn": "CS360",
  LLMs: "CS350", Statistics: "STAT210", SQL: "CS230", PostgreSQL: "CS230",
  Linux: "CS310", Networking: "CS320", "Security+": "CS370", Splunk: "CS370",
  AWS: "CS380", Docker: "CS380", Kubernetes: "CS380", Terraform: "CS380",
  Git: "SWE250", Agile: "SWE250", "REST APIs": "CS240", "HTML/CSS": "CS240", JavaScript: "CS240",
};

const norm = (s: string) => s.trim().toLowerCase();

export function courseForSkill(skill: string, p: StudentProfile): CourseRef | undefined {
  const id = Object.entries(SKILL_COURSES).find(([k]) => norm(k) === norm(skill))?.[1];
  if (!id) return undefined;
  const done = p.completedCourses.find((c) => c.id === id);
  if (done) return { code: done.code, title: done.title, when: "completed" };
  const now = p.inProgressCourses.find((c) => c.id === id);
  if (now) return { code: now.code, title: now.title, when: "in progress" };
  const planned = p.plannedCourses.find((c) => c.id === id);
  if (planned) return { code: planned.code, title: planned.title, when: planned.termLabel };
  return undefined;
}

function actionFor(skill: string, course?: CourseRef): string {
  if (course && course.when !== "completed")
    return `Covered in ${course.code} ${course.title} (${course.when}). Build a small project with ${skill} before then to show it early.`;
  return `Build one small, public project that uses ${skill} and list it on your resume once it's done.`;
}

export function deterministicAnalysis(o: CareerOpportunity, m: MatchResult, p: StudentProfile): CareerAnalysis {
  const strengths = [...m.matchedRequired, ...m.matchedPreferred].map((skill) => {
    const c = courseForSkill(skill, p);
    return { skill, evidence: c?.when === "completed" ? `In your profile skills · related course ${c.code} completed` : "Listed in your profile skills" };
  });
  const gaps = [
    ...m.missingRequired.map((skill) => ({ skill, importance: "required" as const })),
    ...m.missingPreferred.map((skill) => ({ skill, importance: "preferred" as const })),
  ];
  const recommendations = gaps.slice(0, 4).map(({ skill }) => {
    const course = courseForSkill(skill, p);
    return { skill, action: actionFor(skill, course), ...(course ? { course } : {}) };
  });
  const req = o.requiredSkills.length;
  const summary = m.insufficientData
    ? "This listing has no skill information, so a fit can't be assessed. Read the original posting."
    : `${m.score}% match. You list ${m.matchedRequired.length} of ${req} required skills` +
      `${o.preferredSkills.length ? ` and ${m.matchedPreferred.length} of ${o.preferredSkills.length} preferred skills` : ""}. ` +
      `${m.interestMatch ? `${o.field} is one of your target fields` : `${o.field} isn't in your target fields`}` +
      `${m.locationMatch ? ", and the location fits your preferences." : ", and the location is outside your preferred regions."}`;
  return { source: "rule", summary, strengths, gaps, recommendations, caveats: baseCaveats(o) };
}

function baseCaveats(o: CareerOpportunity): string[] {
  const c = ["Strengths are based only on skills you listed; add evidence (projects, coursework) to your resume yourself."];
  if (o.skillsExtracted) c.push("Skills for this live listing were keyword-extracted from the posting text and may be incomplete.");
  if (o.source.kind === "demo") c.push("This is a fictional demo listing.");
  return c;
}

/** Facts-only context sent to the LLM. Nothing else about the student is shared. */
export function buildAnalysisContext(o: CareerOpportunity, m: MatchResult, p: StudentProfile) {
  return {
    rules: [
      "Use ONLY these facts. Do not invent projects, experience, courses, certifications, or employer policies.",
      "Do not state or imply the employer accepts CPT/OPT or sponsors visas unless listing.workAuthorization.status is 'confirmed'.",
      "Only recommend skills from listing.missingSkills. Only cite strengths from listing.matchedSkills.",
    ],
    student: {
      major: p.major,
      projectedGraduation: p.projectedGraduation,
      skills: p.skills,
      targetFields: p.interests,
      nextInternshipWindow: p.nextInternshipWindow?.note ?? null,
      courses: [
        ...p.completedCourses.map((c) => `${c.code} ${c.title} (completed)`),
        ...p.inProgressCourses.map((c) => `${c.code} ${c.title} (in progress)`),
        ...p.plannedCourses.map((c) => `${c.code} ${c.title} (planned ${c.termLabel})`),
      ],
    },
    listing: {
      role: o.role, company: o.company, type: o.type, field: o.field, location: o.location, description: o.description,
      requiredSkills: o.requiredSkills, preferredSkills: o.preferredSkills,
      matchedSkills: [...m.matchedRequired, ...m.matchedPreferred],
      missingSkills: [...m.missingRequired, ...m.missingPreferred],
      deterministicScore: m.score,
      workAuthorization: { status: o.workAuth, listingText: o.workAuthNote },
    },
    outputSchema: {
      summary: "2-3 sentences explaining the fit, referencing the deterministic score",
      strengths: [{ skill: "one of matchedSkills", evidence: "why it is relevant to THIS role (no invented experience)" }],
      recommendations: [{ skill: "one of missingSkills", action: "one concrete, realistic next step" }],
    },
  };
}

const POLICY_CLAIM = /\b(sponsor\w*|visa|h-?1b|accepts?\s+(cpt|opt)|(cpt|opt)[-\s]friendly|work authori[sz]ation)\b/i;
const MAX = 400;

/** Validates LLM output against verified facts. Returns null if nothing usable survives. */
export function sanitizeAIAnalysis(raw: unknown, o: CareerOpportunity, m: MatchResult, p: StudentProfile): CareerAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = deterministicAnalysis(o, m, p);
  const matched = new Map([...m.matchedRequired, ...m.matchedPreferred].map((s) => [norm(s), s]));
  const missing = new Map([...m.missingRequired, ...m.missingPreferred].map((s) => [norm(s), s]));
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX) : "");
  const policyOk = (t: string) => o.workAuth === "confirmed" || !POLICY_CLAIM.test(t);

  let summary = str(r.summary);
  const dropped: string[] = [];
  if (!summary || !policyOk(summary)) {
    if (summary) dropped.push("summary");
    summary = base.summary;
  }

  const strengths = (Array.isArray(r.strengths) ? r.strengths : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ skill: matched.get(norm(str(x?.skill))), evidence: str(x?.evidence) }))
    .filter((x): x is { skill: string; evidence: string } => {
      const ok = !!x.skill && !!x.evidence && policyOk(x.evidence);
      if (!ok) dropped.push("strength");
      return ok;
    });

  const recommendations = (Array.isArray(r.recommendations) ? r.recommendations : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => {
      const skill = missing.get(norm(str(x?.skill)));
      const course = skill ? courseForSkill(skill, p) : undefined; // course is attached from verified data, never from the model
      return { skill, action: str(x?.action), ...(course ? { course } : {}) };
    })
    .filter((x): x is AnalysisRecommendation => {
      const ok = !!x.skill && !!x.action && policyOk(x.action);
      if (!ok) dropped.push("recommendation");
      return ok;
    })
    .slice(0, 4);

  if (!strengths.length && !recommendations.length && summary === base.summary) return null;
  const caveats = [...base.caveats];
  if (dropped.length) caveats.push(`${dropped.length} AI statement(s) were removed because they weren't supported by your verified data.`);
  return {
    source: "gemini",
    summary,
    strengths: strengths.length ? strengths : base.strengths,
    gaps: base.gaps, // gaps always come from the deterministic comparison
    recommendations: recommendations.length ? recommendations : base.recommendations,
    caveats,
  };
}
