// Source-grounded F-1 planning helpers. NOT legal advice. Every date below is derived only from a
// published timing rule that is cited; eligibility and authorization are always decided by the DSO / USCIS.
import type { ImmigrationMilestone, IntlProfile, OfficialSource } from "./types";

export const SOURCES: OfficialSource[] = [
  { id: "sits-work", publisher: "Study in the States (DHS)", title: "F-1 practical training (CPT & OPT) overview",
    url: "https://studyinthestates.dhs.gov/students/work/working-in-the-united-states" },
  { id: "sits-stem", publisher: "Study in the States (DHS)", title: "STEM OPT Hub",
    url: "https://studyinthestates.dhs.gov/stem-opt-hub" },
  { id: "sits-students", publisher: "Study in the States (DHS)", title: "Students: maintaining status & resources",
    url: "https://studyinthestates.dhs.gov/students" },
  { id: "uscis-opt", publisher: "USCIS", title: "Optional Practical Training (OPT) for F-1 Students",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students" },
  { id: "uscis-stem", publisher: "USCIS", title: "STEM OPT Extension",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-extension-for-stem-students-stem-opt" },
  { id: "uscis-i765", publisher: "USCIS", title: "Form I-765, Application for Employment Authorization",
    url: "https://www.uscis.gov/i-765" },
  { id: "ecfr", publisher: "eCFR", title: "8 CFR 214.2(f) — F-1 student regulations",
    url: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-214/section-214.2" },
];
export const sourceById = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<string, OfficialSource>;

export interface InfoTopic {
  id: string;
  title: string;
  color: "lavender" | "sage" | "powder" | "blush" | "butter";
  summary: string;
  points: string[];
  sourceIds: string[];
}

// Summaries of published guidance. Wording is intentionally general; students must confirm with their DSO.
export const TOPICS: InfoTopic[] = [
  {
    id: "f1", title: "F-1 status basics", color: "lavender",
    summary: "F-1 students must maintain status, which generally includes a full course of study and keeping the Form I-20 accurate.",
    points: [
      "Your Designated School Official (DSO) manages your SEVIS record and Form I-20.",
      "If you will not finish by the program end date on your I-20, you generally need to request a program extension from your DSO before that date.",
      "Report address and program changes to your DSO as your school requires.",
    ],
    sourceIds: ["sits-students", "ecfr"],
  },
  {
    id: "cpt", title: "Curricular Practical Training (CPT)", color: "sage",
    summary: "CPT is work authorization that must be an integral part of your curriculum and is authorized by your DSO, not USCIS.",
    points: [
      "Generally available after one full academic year of lawful full-time enrollment (some graduate programs differ).",
      "Authorized for a specific employer and dates; the DSO records it in SEVIS and on your I-20 before you start work.",
      "12 months or more of full-time CPT makes you ineligible for OPT. Part-time CPT does not count toward that limit.",
    ],
    sourceIds: ["sits-work", "ecfr"],
  },
  {
    id: "opt", title: "Optional Practical Training (OPT)", color: "powder",
    summary: "OPT is temporary employment directly related to your major, generally up to 12 months per degree level.",
    points: [
      "Requires a DSO recommendation in SEVIS and an approved Form I-765 from USCIS (an EAD) before you work.",
      "Post-completion OPT: file up to 90 days before your program end date and no later than 60 days after it.",
      "USCIS must receive your I-765 within 30 days of the date your DSO enters the recommendation in SEVIS.",
      "Post-completion OPT allows up to 90 days of unemployment in total.",
    ],
    sourceIds: ["uscis-opt", "uscis-i765", "ecfr"],
  },
  {
    id: "stem", title: "STEM OPT extension", color: "butter",
    summary: "Students with a degree on the DHS STEM Designated Degree Program List may apply for a 24-month extension.",
    points: [
      "Your degree's CIP code must be on the DHS STEM list — confirm with your DSO; do not assume.",
      "Employer must be enrolled in E-Verify; you and your employer complete Form I-983 (training plan).",
      "You may file up to 90 days before your current OPT EAD expires, within 60 days of the DSO recommendation.",
      "Adds 60 days to the unemployment allowance (150 days total across OPT and STEM OPT).",
    ],
    sourceIds: ["uscis-stem", "sits-stem"],
  },
  {
    id: "dso", title: "Working with your DSO", color: "blush",
    summary: "Your DSO is the official point of contact for CPT authorization, OPT recommendations, and I-20 updates.",
    points: [
      "Ask early: CPT and OPT requests take processing time at the school before any USCIS step.",
      "Bring your offer letter (for CPT), your expected completion date, and academic advisor confirmation if required.",
      "Never begin work until authorization is in place (CPT on your I-20, or OPT EAD in hand and its start date reached).",
    ],
    sourceIds: ["sits-work", "sits-students"],
  },
];

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const addMonths = (iso: string, months: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Deterministic planning dates from published timing rules (cited). Eligibility is NOT determined here. */
export function buildMilestones(p: IntlProfile): ImmigrationMilestone[] {
  if (p.status !== "F-1") return [];
  const end = p.programEndDate;
  const m: ImmigrationMilestone[] = [];
  if (p.cptInterest) {
    m.push({
      id: "cpt-earliest", kind: "planning-guidance", date: addMonths(p.programStartDate, 9),
      title: "Approximate earliest CPT conversation",
      explanation: "CPT generally requires one full academic year of full-time enrollment. This date is an estimate (program start + ~9 months / two semesters); your DSO confirms actual eligibility.",
      sourceIds: ["sits-work", "ecfr"],
    });
  }
  m.push(
    { id: "dso-meeting", kind: "planning-guidance", date: addDays(end, -150),
      title: "Suggested: meet your DSO about OPT",
      explanation: "A planning suggestion (not a rule): talk with your DSO a few months before the filing window opens so the SEVIS recommendation is ready.",
      sourceIds: ["sits-work"] },
    { id: "opt-open", kind: "verified-rule", date: addDays(end, -90),
      title: "Post-completion OPT filing window opens",
      explanation: "USCIS accepts post-completion OPT I-765 filings up to 90 days before the program end date.",
      sourceIds: ["uscis-opt", "uscis-i765"] },
    { id: "program-end", kind: "verified-rule", date: end,
      title: "Program end date (from your I-20)",
      explanation: "The date you entered. If your graduation plan moves later, ask your DSO about a program extension before this date.",
      sourceIds: ["ecfr", "sits-students"] },
    { id: "opt-close", kind: "verified-rule", date: addDays(end, 60),
      title: "Post-completion OPT filing window closes / grace period ends",
      explanation: "The I-765 must be filed no later than 60 days after the program end date. Without OPT or another status step, the F-1 grace period is also 60 days.",
      sourceIds: ["uscis-opt", "ecfr"] },
  );
  if (p.stemInterest) {
    m.push({
      id: "stem-plan", kind: "planning-guidance",
      title: "STEM OPT extension (if eligible)",
      explanation: "Filing opens 90 days before your OPT EAD expires. That expiration date is set by USCIS on your EAD, so it cannot be calculated here. Confirm your degree's STEM designation with your DSO.",
      sourceIds: ["uscis-stem", "sits-stem"],
    });
  }
  return m.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export const CHECKLIST = [
  { id: "i20", label: "Confirm program end date on my I-20 matches my graduation plan" },
  { id: "dso-contact", label: "Save my DSO's contact info and office hours" },
  { id: "cpt-curriculum", label: "Ask how CPT fits my curriculum (course or credit requirement)" },
  { id: "offer", label: "Keep a copy of any internship offer letter for CPT review" },
  { id: "stem-cip", label: "Ask DSO whether my degree's CIP code is STEM-designated" },
  { id: "uscis-account", label: "Read the USCIS I-765 instructions before my OPT window" },
  { id: "unemployment", label: "Understand OPT unemployment-day limits" },
];
