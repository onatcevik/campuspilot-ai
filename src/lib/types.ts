// Core domain types for CampusPilot AI. Kept storage-agnostic so a database can replace localStorage later.

export type Priority = "high" | "medium" | "low";
export type NoteColor = "lavender" | "sage" | "powder" | "blush" | "butter";

export interface Student {
  id: string;
  name: string;
  firstName: string;
  university: string;
  major: string;
  expectedGraduation: string; // e.g. "May 2028"
  location: string;
  targetTermId: TermId;
}

export interface Course {
  id: string; // e.g. "CS102"
  code: string;
  title: string;
  credits: number;
  category: "Core" | "Math & Science" | "General Education" | "Elective" | "Capstone";
}

export interface Prerequisite {
  courseId: string;
  requires: string[]; // all must be completed before courseId
}

export interface DegreeRequirement {
  id: string;
  label: string;
  requiredCredits: number;
  categories: Course["category"][];
}

export type TermSeason = "Spring" | "Summer" | "Fall";
export type TermId = string; // e.g. "2027-SP"

export interface Term {
  id: TermId;
  season: TermSeason;
  year: number;
  label: string;
  order: number;
}

export interface SemesterPlan {
  termId: TermId;
  courseIds: string[];
  credits: number;
}

export interface Assignment {
  id: string;
  course: string;
  title: string;
  dueDate: string; // ISO
  priority: Priority;
  completed: boolean;
  completedAt?: string;
  color: NoteColor;
  estimatedHours: number;
  notes?: string;
  /**
   * Student-reported submission availability after the deadline. CampusPilot is NOT connected to LearningBAU,
   * so this is never inferred from the due date: undefined = unknown.
   */
  submission?: "late-allowed" | "closed";
  submissionUpdatedAt?: string;
  /** Set when a task was created from another module (e.g. Career Navigator) after user confirmation. */
  origin?: { module: "career"; opportunityId: string } | { module: "assistant"; actionId: string };
}

export type MilestoneKind = "verified-rule" | "planning-guidance";

export interface ImmigrationMilestone {
  id: string;
  title: string;
  date?: string; // ISO date, only when deterministically derivable from a verified rule
  kind: MilestoneKind;
  explanation: string;
  sourceIds: string[];
}

export interface OfficialSource {
  id: string;
  title: string;
  url: string;
  publisher: "USCIS" | "Study in the States (DHS)" | "eCFR";
}

export type WorkAuthStatus = "confirmed" | "verification-required" | "unknown" | "restricted";
export type ApplicationStatus = "not-started" | "interested" | "applied" | "interviewing" | "offer";
export type CareerField =
  | "Software Engineering"
  | "Artificial Intelligence"
  | "Machine Learning"
  | "Data Science"
  | "Cybersecurity"
  | "Cloud Computing"
  | "IT Support";

/** Where a listing came from. Demo listings are fictional; live listings come from a public job-board API. */
export type JobSource =
  | { kind: "demo" }
  | {
      kind: "live";
      provider: "greenhouse" | "lever";
      providerLabel: string;
      boardId: string;
      applyUrl: string; // verified https URL returned by the provider API
      postedAt?: string; // ISO
      postedAtLabel: "Posted" | "Updated";
      deadline?: string; // ISO, only when the provider API supplies one
      fetchedAt: string; // ISO
    };

export interface CareerOpportunity {
  id: string;
  company: string;
  role: string;
  type: "Internship" | "Co-op" | "Full-time (new grad)" | "Part-time (on-campus)";
  field: CareerField;
  location: string;
  region: "Washington, DC" | "Northern Virginia" | "Maryland";
  remote: "On-site" | "Hybrid" | "Remote";
  requiredSkills: string[];
  preferredSkills: string[];
  workAuth: WorkAuthStatus;
  workAuthNote: string;
  description: string;
  source: JobSource;
  /** true when skills were keyword-extracted from posting text rather than curated. */
  skillsExtracted?: boolean;
}

export interface CareerProfile {
  skills: string[];
  interests: CareerField[];
  preferredRegions: CareerOpportunity["region"][];
}

export interface IntlProfile {
  status: "F-1" | "Not an international student" | "Other / unsure";
  programStartDate: string; // ISO date
  programEndDate: string; // ISO date (from I-20)
  degreeLevel: "Bachelor's" | "Master's";
  stemInterest: boolean;
  cptInterest: boolean;
  checklist: Record<string, boolean>;
}

export type Severity = "critical" | "warning" | "info" | "success";
export type ModuleKey = "study" | "graduation" | "international" | "career" | "assistant";

export interface RecommendationAction {
  label: string;
  href?: string;
  kind?: "advisor-email" | "dso-email";
}

export interface Recommendation {
  id: string;
  module: ModuleKey;
  severity: Severity;
  title: string;
  detail: string;
  action?: RecommendationAction;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  module: ModuleKey;
}
