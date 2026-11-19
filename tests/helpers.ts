import { DEFAULT_CAREER, DEFAULT_INTL, INITIAL_PLAN, OPPORTUNITIES } from "@/lib/demo-data";
import type { CampusState } from "@/lib/store";
import type { CareerOpportunity } from "@/lib/types";

export function makeState(over: Partial<CampusState> = {}): CampusState {
  return {
    assignments: [],
    plan: { ...INITIAL_PLAN },
    career: { ...DEFAULT_CAREER, skills: [...DEFAULT_CAREER.skills] },
    saved: [],
    statuses: {},
    intl: { ...DEFAULT_INTL, checklist: {} },
    notifications: [],
    ...over,
  };
}

export const byId = (id: string) => OPPORTUNITIES.find((o) => o.id === id)!;

export function listing(over: Partial<CareerOpportunity> = {}): CareerOpportunity {
  return {
    id: "t1", company: "Test Co", role: "Software Intern", type: "Internship", field: "Software Engineering",
    location: "Washington, DC", region: "Washington, DC", remote: "On-site",
    requiredSkills: ["Python", "SQL"], preferredSkills: ["Docker"],
    workAuth: "unknown", workAuthNote: "No information.", description: "", source: { kind: "demo" },
    ...over,
  };
}
