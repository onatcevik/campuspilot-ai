// Single shared student profile derived from the store. Every module reads from here instead of duplicating data.
import { COMPLETED_COURSE_IDS, DEMO_STUDENT, FUTURE_TERMS, IN_PROGRESS_COURSE_IDS } from "./demo-data";
import { courseById, termById, termToGraduationDate, validatePlan } from "./graduation";
import type { CampusState } from "./store";
import type { CareerProfile, IntlProfile, Term } from "./types";

export type AvailabilityLevel = "full-time" | "part-time" | "limited";

export interface TermAvailability {
  termId: string;
  label: string;
  season: Term["season"];
  credits: number;
  level: AvailabilityLevel;
  note: string;
}

export interface StudentProfile {
  name: string;
  firstName: string;
  major: string;
  university: string;
  targetGraduation: string;
  projectedGraduation: string;
  projectedTermId: string | null;
  graduationOnTrack: boolean;
  skills: string[];
  interests: CareerProfile["interests"];
  preferredRegions: CareerProfile["preferredRegions"];
  completedCourses: { id: string; code: string; title: string }[];
  inProgressCourses: { id: string; code: string; title: string }[];
  plannedCourses: { id: string; code: string; title: string; termId: string; termLabel: string }[];
  availability: TermAvailability[];
  nextInternshipWindow: TermAvailability | null;
  intl: IntlProfile;
  isF1: boolean;
  workAuthSummary: string;
}

/**
 * Availability is a planning heuristic from planned credits (not a policy):
 * summer 0 cr → full-time, ≤6 → part-time, more → limited; fall/spring ≤12 → part-time, more → limited.
 */
export function availabilityFor(t: Term, credits: number): TermAvailability {
  let level: AvailabilityLevel;
  if (t.season === "Summer") level = credits === 0 ? "full-time" : credits <= 6 ? "part-time" : "limited";
  else level = credits <= 12 ? "part-time" : "limited";
  const note =
    level === "full-time"
      ? `No courses planned in ${t.label} — open for a full-time internship.`
      : level === "part-time"
        ? `${credits} credits planned in ${t.label} — a part-time role may fit.`
        : `${credits} credits planned in ${t.label} — little room for work alongside classes.`;
  return { termId: t.id, label: t.label, season: t.season, credits, level, note };
}

export function deriveStudentProfile(s: Pick<CampusState, "plan" | "career" | "intl">): StudentProfile {
  const v = validatePlan(s.plan);
  const target = termById[DEMO_STUDENT.targetTermId];
  const last = v.projectedTerm;
  const termsUntilDone = FUTURE_TERMS.filter((t) => !last || t.order <= last.order);
  const availability = termsUntilDone.map((t) => {
    const sem = v.semesters.find((x) => x.termId === t.id);
    return availabilityFor(t, sem?.credits ?? 0);
  });
  const toCourse = (id: string) => ({ id, code: courseById[id].code, title: courseById[id].title });
  const isF1 = s.intl.status === "F-1";
  return {
    name: DEMO_STUDENT.name,
    firstName: DEMO_STUDENT.firstName,
    major: DEMO_STUDENT.major,
    university: DEMO_STUDENT.university,
    targetGraduation: DEMO_STUDENT.expectedGraduation,
    projectedGraduation: termToGraduationDate(last),
    projectedTermId: last?.id ?? null,
    graduationOnTrack: !!last && last.order <= target.order && v.prereqIssues.length === 0,
    skills: s.career.skills,
    interests: s.career.interests,
    preferredRegions: s.career.preferredRegions,
    completedCourses: COMPLETED_COURSE_IDS.map(toCourse),
    inProgressCourses: IN_PROGRESS_COURSE_IDS.map(toCourse),
    plannedCourses: Object.entries(s.plan)
      .filter(([, t]) => !!t)
      .map(([id, t]) => ({ ...toCourse(id), termId: t!, termLabel: termById[t!].label }))
      .sort((a, b) => termById[a.termId].order - termById[b.termId].order),
    availability,
    nextInternshipWindow: availability.find((a) => a.season === "Summer") ?? null,
    intl: s.intl,
    isF1,
    workAuthSummary: isF1
      ? "F-1 student — any CPT/OPT requires DSO/USCIS authorization"
      : s.intl.status === "Other / unsure"
        ? "Status not confirmed — check with your international office"
        : "Not an international student",
  };
}
