// Per-listing work-authorization guidance. Uses only (a) what the listing itself states and (b) cited F-1 rules.
// It never infers employer CPT/OPT acceptance or sponsorship from missing information.
import { buildMilestones, fmtDate } from "./immigration";
import type { StudentProfile } from "./profile";
import type { CareerOpportunity } from "./types";

export interface WorkAuthGuidance {
  pathway: "CPT" | "OPT" | "on-campus" | "none" | "unknown";
  headline: string;
  points: string[];
  sourceIds: string[];
  employerQuestion: string | null; // what the student still needs to ask the employer
}

export function workAuthGuidance(o: CareerOpportunity, p: StudentProfile): WorkAuthGuidance {
  if (!p.isF1) {
    return {
      pathway: p.intl.status === "Other / unsure" ? "unknown" : "none",
      headline: p.intl.status === "Other / unsure" ? "Confirm your status first" : "No F-1 work-authorization steps needed",
      points: p.intl.status === "Other / unsure" ? ["Your status isn't set. Check with your international student office before applying."] : [],
      sourceIds: [],
      employerQuestion: null,
    };
  }

  if (o.workAuth === "restricted") {
    return {
      pathway: "none",
      headline: "Listing states a restriction",
      points: [`The listing says: “${o.workAuthNote}” CPT or OPT does not change an employer's stated eligibility requirement.`],
      sourceIds: [],
      employerQuestion: null,
    };
  }

  // On-campus employment is a separate F-1 category (not CPT/OPT). We don't state limits here; the DSO confirms.
  if (o.type === "Part-time (on-campus)") {
    return {
      pathway: "on-campus",
      headline: "On-campus job: confirm eligibility with your DSO",
      points: [
        "On-campus employment for F-1 students falls under different rules than CPT and OPT.",
        "Before accepting, confirm with your DSO that you're eligible and what hour limits apply to you.",
      ],
      sourceIds: ["ecfr", "sits-work"],
      employerQuestion: null,
    };
  }

  const employerQuestion =
    o.workAuth === "confirmed"
      ? null
      : `Ask ${o.company} whether this role can host an F-1 student on ${o.type === "Full-time (new grad)" ? "OPT" : "CPT"}. The listing does not say.`;

  if (o.type === "Full-time (new grad)") {
    const ms = buildMilestones(p.intl);
    const open = ms.find((m) => m.id === "opt-open");
    const close = ms.find((m) => m.id === "opt-close");
    const points = [
      open?.date && close?.date
        ? `Post-completion OPT filing window for your program end date: ${fmtDate(open.date)} – ${fmtDate(close.date)} (USCIS timing rule).`
        : "Post-completion OPT filing window depends on your program end date.",
      "You need a DSO recommendation and an approved EAD before you start working.",
    ];
    if (p.intl.stemInterest)
      points.push("A STEM OPT extension later requires an employer enrolled in E-Verify. This listing does not say whether it is.");
    return { pathway: "OPT", headline: "Pathway to discuss with your DSO: post-completion OPT", points, sourceIds: ["uscis-opt", "uscis-i765", ...(p.intl.stemInterest ? ["uscis-stem"] : [])], employerQuestion };
  }

  const win = p.nextInternshipWindow;
  return {
    pathway: "CPT",
    headline: "Pathway to discuss with your DSO: CPT",
    points: [
      "CPT is authorized by your DSO for a specific employer and dates, and must be in place before you start.",
      "It must be an integral part of your curriculum. Ask how your program handles this.",
      "12 months or more of full-time CPT removes OPT eligibility. Part-time CPT does not count toward that limit.",
      ...(win ? [`Your plan: ${win.note}`] : []),
    ],
    sourceIds: ["sits-work", "ecfr"],
    employerQuestion,
  };
}
