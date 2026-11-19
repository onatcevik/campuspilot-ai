import type { CareerOpportunity, CareerProfile } from "./types";

export const MATCH_WEIGHTS = { required: 60, preferred: 25, interest: 10, location: 5 };

const norm = (s: string) => s.trim().toLowerCase();

export interface MatchResult {
  score: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
  interestMatch: boolean;
  locationMatch: boolean;
  /** true when the listing has no skills at all, so a skill score would be meaningless. */
  insufficientData: boolean;
}

/** Deterministic, explainable score: weighted coverage of required + preferred skills, plus field and region fit. */
export function matchOpportunity(o: CareerOpportunity, p: CareerProfile): MatchResult {
  const have = new Set(p.skills.map(norm));
  const split = (list: string[]) => [list.filter((s) => have.has(norm(s))), list.filter((s) => !have.has(norm(s)))];
  const [matchedRequired, missingRequired] = split(o.requiredSkills);
  const [matchedPreferred, missingPreferred] = split(o.preferredSkills);
  const interestMatch = p.interests.includes(o.field);
  const locationMatch = p.preferredRegions.includes(o.region) || o.remote === "Remote";
  const ratio = (a: number, b: number) => (b ? a / b : 1);
  const requiredCoverage = ratio(matchedRequired.length, o.requiredSkills.length);
  // Listings without a separate "preferred" list (e.g. skills extracted from live postings) reuse required coverage,
  // so missing data never inflates a score. Curated demo listings always have both lists, so their scores are unchanged.
  const preferredCoverage = o.preferredSkills.length ? matchedPreferred.length / o.preferredSkills.length : requiredCoverage;
  const insufficientData = o.requiredSkills.length + o.preferredSkills.length === 0;
  const score = insufficientData ? 0 : Math.round(
    MATCH_WEIGHTS.required * requiredCoverage +
      MATCH_WEIGHTS.preferred * preferredCoverage +
      (interestMatch ? MATCH_WEIGHTS.interest : 0) +
      (locationMatch ? MATCH_WEIGHTS.location : 0),
  );
  return { score, matchedRequired, missingRequired, matchedPreferred, missingPreferred, interestMatch, locationMatch, insufficientData };
}

/** Skills that appear most often as gaps across the student's best-fit opportunities. */
export function skillGaps(opps: CareerOpportunity[], p: CareerProfile, top = 4) {
  const counts: Record<string, number> = {};
  for (const o of opps) {
    const m = matchOpportunity(o, p);
    if (m.score < 40) continue;
    m.missingRequired.forEach((s) => (counts[s] = (counts[s] ?? 0) + 2));
    m.missingPreferred.forEach((s) => (counts[s] = (counts[s] ?? 0) + 1));
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, top).map(([skill, weight]) => ({ skill, weight }));
}

export function resumeTips(p: CareerProfile, opps: CareerOpportunity[]) {
  const gaps = skillGaps(opps, p);
  const tips: { title: string; detail: string }[] = [];
  if (gaps.length)
    tips.push({ title: `Build evidence for ${gaps.slice(0, 2).map((g) => g.skill).join(" and ")}`,
      detail: "These are the most common gaps in your best-fit listings. A small project with a public repo is the fastest proof." });
  tips.push({ title: "Lead bullets with impact", detail: "Use action + metric: “Reduced page load time 40% by…” instead of “Worked on…”." });
  if (p.skills.some((s) => ["React", "TypeScript", "Next.js"].includes(s)))
    tips.push({ title: "Feature one shipped web project", detail: "Link a live demo and repo for a React/TypeScript project — e.g. this hackathon build." });
  if (p.interests.some((i) => i.includes("Learning") || i.includes("Intelligence")))
    tips.push({ title: "Show applied AI work", detail: "Add a section for ML/AI coursework (CS 350/360 are planned) and any model you trained or evaluated." });
  tips.push({ title: "Keep it to one page", detail: "Recruiters at DC-area internships typically skim. Put skills and projects above coursework." });
  return tips;
}
