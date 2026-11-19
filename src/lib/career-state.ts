// Pure state transitions for Career Navigator (used by the store, unit-tested directly).
import type { ApplicationStatus, CareerField, CareerOpportunity, WorkAuthStatus } from "./types";

export function toggleSavedList(saved: string[], id: string): string[] {
  return saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
}

export function setApplicationStatus(
  statuses: Record<string, ApplicationStatus>,
  id: string,
  status: ApplicationStatus,
): Record<string, ApplicationStatus> {
  if (status === "not-started") {
    const next = { ...statuses };
    delete next[id];
    return next;
  }
  return { ...statuses, [id]: status };
}

export type SourceFilter = "all" | "demo" | "live";

export interface ListingFilters {
  savedOnly: boolean;
  saved: string[];
  authFilter: WorkAuthStatus | "all";
  source: SourceFilter;
  statusFilter?: ApplicationStatus | "all";
  statuses?: Record<string, ApplicationStatus>;
  field?: CareerField | "all";
  /** Free-text search over role, company, location and skills (case-insensitive). */
  query?: string;
}

export function filterListings<T extends { o: CareerOpportunity }>(items: T[], f: ListingFilters): T[] {
  return items.filter(({ o }) => {
    if (f.savedOnly && !f.saved.includes(o.id)) return false;
    if (f.authFilter !== "all" && o.workAuth !== f.authFilter) return false;
    if (f.source !== "all" && o.source.kind !== f.source) return false;
    if (f.statusFilter && f.statusFilter !== "all" && (f.statuses?.[o.id] ?? "not-started") !== f.statusFilter) return false;
    if (f.field && f.field !== "all" && o.field !== f.field) return false;
    const q = f.query?.trim().toLowerCase();
    if (q && ![o.role, o.company, o.location, ...o.requiredSkills, ...o.preferredSkills].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}
