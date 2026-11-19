// All data in this file is FICTIONAL demo data. It is not BAU policy, not a real student, and not real job listings.
import type {
  Assignment,
  CareerOpportunity,
  CareerProfile,
  Course,
  DegreeRequirement,
  IntlProfile,
  Prerequisite,
  Student,
  Term,
} from "./types";

export const DEMO_STUDENT: Student = {
  id: "demo-alex",
  name: "Alex Morgan",
  firstName: "Alex",
  university: "Bay Atlantic University — demo profile",
  major: "Software Engineering (B.S.)",
  expectedGraduation: "May 2028",
  location: "Washington, DC",
  targetTermId: "2028-SP",
};

// ---------- Fictional B.S. Software Engineering program (120 credits) ----------
const c = (id: string, title: string, category: Course["category"], credits = 3): Course => ({
  id,
  code: id.replace(/([A-Z]+)(\d+)/, "$1 $2"),
  title,
  credits,
  category,
});

export const COURSES: Course[] = [
  c("CS101", "Programming I", "Core"),
  c("CS102", "Programming II", "Core"),
  c("CS201", "Data Structures", "Core"),
  c("CS210", "Discrete Mathematics", "Core"),
  c("CS220", "Computer Organization", "Core"),
  c("CS230", "Database Systems", "Core"),
  c("CS240", "Web Development", "Core"),
  c("SWE250", "Software Engineering Fundamentals", "Core"),
  c("CS301", "Algorithms", "Core"),
  c("CS310", "Operating Systems", "Core"),
  c("CS320", "Computer Networks", "Core"),
  c("SWE330", "Software Testing & QA", "Core"),
  c("SWE340", "Human-Computer Interaction", "Core"),
  c("CS350", "Introduction to AI", "Core"),
  c("CS360", "Machine Learning", "Core"),
  c("CS370", "Cybersecurity Fundamentals", "Core"),
  c("CS380", "Cloud Computing", "Core"),
  c("SWE410", "Advanced Software Engineering", "Core"),
  c("SWE420", "Software Architecture", "Core"),
  c("SWE490", "Capstone Project I", "Capstone"),
  c("SWE491", "Capstone Project II", "Capstone"),
  c("MATH110", "Calculus I", "Math & Science"),
  c("MATH120", "Calculus II", "Math & Science"),
  c("MATH220", "Linear Algebra", "Math & Science"),
  c("STAT210", "Probability & Statistics", "Math & Science"),
  c("SCI110", "Physics I", "Math & Science"),
  c("ENG101", "Composition I", "General Education"),
  c("ENG102", "Composition II", "General Education"),
  c("COM110", "Public Speaking", "General Education"),
  c("HIS101", "U.S. History", "General Education"),
  c("ECO101", "Principles of Economics", "General Education"),
  c("PHI210", "Ethics in Technology", "General Education"),
  c("BUS200", "Entrepreneurship", "General Education"),
  c("PSY101", "Introduction to Psychology", "General Education"),
  c("ELE1", "Free Elective I", "Elective"),
  c("ELE2", "Free Elective II", "Elective"),
  c("ELE3", "Free Elective III", "Elective"),
  c("ELE4", "Free Elective IV", "Elective"),
  c("ELE5", "Free Elective V", "Elective"),
  c("ELE6", "Free Elective VI", "Elective"),
];

export const PREREQUISITES: Prerequisite[] = [
  { courseId: "CS102", requires: ["CS101"] },
  { courseId: "CS201", requires: ["CS102"] },
  { courseId: "CS210", requires: ["MATH110"] },
  { courseId: "CS220", requires: ["CS102"] },
  { courseId: "CS230", requires: ["CS201"] },
  { courseId: "CS240", requires: ["CS101"] },
  { courseId: "SWE250", requires: ["CS101"] },
  { courseId: "CS301", requires: ["CS201", "CS210"] },
  { courseId: "CS310", requires: ["CS201", "CS220"] },
  { courseId: "CS320", requires: ["CS220"] },
  { courseId: "SWE330", requires: ["SWE250"] },
  { courseId: "SWE340", requires: ["CS240"] },
  { courseId: "CS350", requires: ["CS201", "STAT210"] },
  { courseId: "CS360", requires: ["CS350", "MATH220"] },
  { courseId: "CS370", requires: ["CS320"] },
  { courseId: "CS380", requires: ["CS310"] },
  { courseId: "SWE410", requires: ["CS102"] },
  { courseId: "SWE420", requires: ["SWE410"] },
  { courseId: "SWE490", requires: ["SWE410"] },
  { courseId: "SWE491", requires: ["SWE490"] },
  { courseId: "MATH120", requires: ["MATH110"] },
  { courseId: "MATH220", requires: ["MATH120"] },
  { courseId: "STAT210", requires: ["MATH110"] },
  { courseId: "SCI110", requires: ["MATH110"] },
  { courseId: "ENG102", requires: ["ENG101"] },
];

export const DEGREE_REQUIREMENTS: DegreeRequirement[] = [
  { id: "core", label: "Software Engineering Core", requiredCredits: 57, categories: ["Core"] },
  { id: "capstone", label: "Capstone", requiredCredits: 6, categories: ["Capstone"] },
  { id: "math", label: "Math & Science", requiredCredits: 15, categories: ["Math & Science"] },
  { id: "gened", label: "General Education", requiredCredits: 24, categories: ["General Education"] },
  { id: "elective", label: "Free Electives", requiredCredits: 18, categories: ["Elective"] },
];
export const TOTAL_REQUIRED_CREDITS = 120;

export const COMPLETED_COURSE_IDS = [
  "CS101", "MATH110", "MATH120", "MATH220", "STAT210", "CS210", "CS240", "ENG101", "ENG102",
  "COM110", "HIS101", "ECO101", "PSY101", "SCI110", "PHI210", "ELE1", "ELE2", "BUS200",
];
export const IN_PROGRESS_COURSE_IDS = ["SWE340", "ELE3", "ELE4", "ELE5"];
export const CURRENT_TERM_LABEL = "Fall 2026";

const term = (year: number, season: Term["season"], order: number): Term => ({
  id: `${year}-${season === "Spring" ? "SP" : season === "Summer" ? "SU" : "FA"}`,
  season,
  year,
  label: `${season} ${year}`,
  order,
});

export const FUTURE_TERMS: Term[] = [
  term(2027, "Spring", 1),
  term(2027, "Summer", 2),
  term(2027, "Fall", 3),
  term(2028, "Spring", 4),
  term(2028, "Summer", 5),
  term(2028, "Fall", 6),
  term(2029, "Spring", 7),
  term(2029, "Summer", 8),
  term(2029, "Fall", 9),
];

// Alex's own draft plan. It intentionally contains one prerequisite conflict for the demo:
// Advanced Software Engineering (SWE410) is scheduled in the same term as Programming II (CS102).
export const INITIAL_PLAN: Record<string, string> = {
  CS102: "2027-SP", SWE410: "2027-SP", SWE250: "2027-SP", ELE6: "2027-SP",
  CS201: "2027-SU", CS220: "2027-SU",
  SWE490: "2027-FA", CS301: "2027-FA", CS230: "2027-FA", CS310: "2027-FA", CS320: "2027-FA", CS350: "2027-FA",
  SWE491: "2028-SP", CS360: "2028-SP", CS370: "2028-SP", CS380: "2028-SP", SWE420: "2028-SP", SWE330: "2028-SP",
};

// ---------- Study board seed (dates relative to "now" so warning states are always visible in a demo) ----------
export function seedAssignments(now = new Date()): Assignment[] {
  const at = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();
  return [
    { id: "a1", course: "SWE 340 · HCI", title: "Usability test report", dueDate: at(1.5), priority: "high", completed: false, color: "blush", estimatedHours: 2, notes: "Summarize 5 participant sessions." },
    { id: "a2", course: "ELE 3 · Data Visualization", title: "Dashboard critique essay", dueDate: at(20), priority: "medium", completed: false, color: "butter", estimatedHours: 3 },
    { id: "a3", course: "ELE 4 · Technical Writing", title: "API documentation draft", dueDate: at(-26), priority: "high", completed: false, color: "powder", estimatedHours: 2 },
    { id: "a4", course: "SWE 340 · HCI", title: "Wireframes for campus app", dueDate: at(52), priority: "medium", completed: false, color: "lavender", estimatedHours: 4 },
    { id: "a5", course: "ELE 5 · Intro to Cloud Tools", title: "Deploy a static site lab", dueDate: at(76), priority: "low", completed: false, color: "sage", estimatedHours: 1.5 },
    { id: "a6", course: "ELE 3 · Data Visualization", title: "Weekly reading reflection", dueDate: at(-50), priority: "low", completed: true, completedAt: at(-60), color: "butter", estimatedHours: 1 },
    { id: "a7", course: "ELE 4 · Technical Writing", title: "Peer review: README", dueDate: at(100), priority: "medium", completed: false, color: "powder", estimatedHours: 1 },
  ];
}

// ---------- International student defaults (fictional) ----------
export const DEFAULT_INTL: IntlProfile = {
  status: "F-1",
  programStartDate: "2025-08-25",
  programEndDate: "2028-05-15",
  degreeLevel: "Bachelor's",
  stemInterest: true,
  cptInterest: true,
  checklist: {},
};

// ---------- Career (fictional organizations and listings) ----------
export const DEFAULT_CAREER: CareerProfile = {
  skills: ["TypeScript", "React", "Python", "SQL", "Git", "Figma", "HTML/CSS", "Statistics", "Communication", "Basic Networking", "IT Support"],
  interests: ["Software Engineering", "Artificial Intelligence", "Machine Learning"],
  preferredRegions: ["Washington, DC", "Northern Virginia"],
};

export const SKILL_LIBRARY = [
  "TypeScript", "JavaScript", "React", "Next.js", "Node.js", "Python", "Java", "C++", "Go", "SQL",
  "PostgreSQL", "Git", "Docker", "Kubernetes", "AWS", "Azure", "Linux", "Networking", "Security+",
  "PyTorch", "TensorFlow", "scikit-learn", "Pandas", "Statistics", "Machine Learning", "LLMs",
  "Data Visualization", "Figma", "HTML/CSS", "REST APIs", "Terraform", "Splunk", "Agile",
  "IT Support", "Troubleshooting", "Communication", "Basic Networking",
];

const DEMO_LISTINGS: Omit<CareerOpportunity, "source">[] = [
  {
    id: "o1", company: "Potomac Civic Labs (fictional)", role: "Software Engineering Intern", type: "Internship",
    field: "Software Engineering", location: "Washington, DC", region: "Washington, DC", remote: "Hybrid",
    requiredSkills: ["TypeScript", "React", "Git"], preferredSkills: ["Next.js", "REST APIs", "Figma"],
    workAuth: "confirmed", workAuthNote: "Sample listing states CPT-eligible students are welcome to apply (demo data).",
    description: "Build accessible web tools for local nonprofits.",
  },
  {
    id: "o2", company: "Capitol Signal AI (fictional)", role: "Machine Learning Intern", type: "Internship",
    field: "Machine Learning", location: "Arlington, VA", region: "Northern Virginia", remote: "On-site",
    requiredSkills: ["Python", "Machine Learning", "Statistics"], preferredSkills: ["PyTorch", "Pandas", "LLMs"],
    workAuth: "verification-required", workAuthNote: "Listing does not mention CPT/OPT. Ask the recruiter before applying.",
    description: "Prototype models that summarize public policy documents.",
  },
  {
    id: "o3", company: "Chesapeake Health Data (fictional)", role: "Data Science Intern", type: "Internship",
    field: "Data Science", location: "Baltimore, MD", region: "Maryland", remote: "Hybrid",
    requiredSkills: ["Python", "SQL", "Statistics"], preferredSkills: ["Pandas", "Data Visualization", "scikit-learn"],
    workAuth: "unknown", workAuthNote: "No work authorization information available for this sample listing.",
    description: "Analyze anonymized hospital operations data.",
  },
  {
    id: "o4", company: "Federal Shield Systems (fictional)", role: "Cybersecurity Analyst Intern", type: "Internship",
    field: "Cybersecurity", location: "Fort Meade, MD", region: "Maryland", remote: "On-site",
    requiredSkills: ["Networking", "Linux", "Security+"], preferredSkills: ["Splunk", "Python"],
    workAuth: "restricted", workAuthNote: "Sample listing requires U.S. citizenship for a security clearance.",
    description: "Support a security operations center for a government contractor.",
  },
  {
    id: "o5", company: "Rosslyn Cloudworks (fictional)", role: "Cloud Engineering Co-op", type: "Co-op",
    field: "Cloud Computing", location: "Rosslyn, VA", region: "Northern Virginia", remote: "Hybrid",
    requiredSkills: ["AWS", "Linux", "Python"], preferredSkills: ["Docker", "Terraform", "Kubernetes"],
    workAuth: "verification-required", workAuthNote: "Co-op structure may work with CPT; confirm with employer and DSO.",
    description: "Automate infrastructure for a SaaS analytics platform.",
  },
  {
    id: "o6", company: "Anacostia Learning Tech (fictional)", role: "AI Product Engineering Intern", type: "Internship",
    field: "Artificial Intelligence", location: "Washington, DC", region: "Washington, DC", remote: "Remote",
    requiredSkills: ["Python", "TypeScript", "REST APIs"], preferredSkills: ["LLMs", "React", "SQL"],
    workAuth: "confirmed", workAuthNote: "Sample listing states it has previously hosted F-1 students on CPT (demo data).",
    description: "Ship AI tutoring features for K-12 learning apps.",
  },
  {
    id: "o7", company: "Bethesda Quant Research (fictional)", role: "Junior Data Engineer (new grad)", type: "Full-time (new grad)",
    field: "Data Science", location: "Bethesda, MD", region: "Maryland", remote: "Hybrid",
    requiredSkills: ["SQL", "Python", "PostgreSQL"], preferredSkills: ["Docker", "AWS"],
    workAuth: "unknown", workAuthNote: "Sponsorship and OPT policy not listed in the sample posting.",
    description: "Build data pipelines for research teams.",
  },
  {
    id: "o8", company: "Tysons Secure Cloud (fictional)", role: "DevSecOps Intern", type: "Internship",
    field: "Cybersecurity", location: "Tysons, VA", region: "Northern Virginia", remote: "On-site",
    requiredSkills: ["Linux", "Docker", "Git"], preferredSkills: ["Kubernetes", "AWS", "Python"],
    workAuth: "verification-required", workAuthNote: "Some contracts may require citizenship; ask which teams do not.",
    description: "Harden CI/CD pipelines and container images.",
  },
];

export const OPPORTUNITIES: CareerOpportunity[] = DEMO_LISTINGS.map((o) => ({ ...o, source: { kind: "demo" } }));

/**
 * Fictional on-campus example for the Career Navigator's "Campus Opportunities" section.
 * NOT a real Bay Atlantic University vacancy: no application URL. Kept separate from OPPORTUNITIES so the
 * dashboard, Assistant and alerts are unchanged.
 */
export const CAMPUS_OPPORTUNITIES: CareerOpportunity[] = [
  {
    id: "campus-it-1",
    company: "Bay Atlantic University · Campus IT (fictional demo)",
    role: "Student IT Support Assistant",
    type: "Part-time (on-campus)",
    field: "IT Support",
    location: "Bay Atlantic University, Washington, DC",
    region: "Washington, DC",
    remote: "On-site",
    requiredSkills: ["IT Support", "Troubleshooting", "Communication"],
    preferredSkills: ["Basic Networking"],
    workAuth: "verification-required",
    workAuthNote: "Fictional demo listing. For F-1 students, confirm on-campus employment eligibility with your DSO.",
    description: "Help students and staff with basic technical issues, classroom equipment, and campus IT services.",
    source: { kind: "demo" },
  },
];
