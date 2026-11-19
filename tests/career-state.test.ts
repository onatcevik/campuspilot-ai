import { describe, expect, it } from "vitest";
import { filterListings, setApplicationStatus, toggleSavedList } from "@/lib/career-state";
import { DEFAULT_CAREER, OPPORTUNITIES } from "@/lib/demo-data";
import { matchOpportunity } from "@/lib/matching";
import { listing } from "./helpers";

const items = [
  ...OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, DEFAULT_CAREER) })),
  { o: listing({ id: "live1", source: { kind: "live", provider: "lever", providerLabel: "Lever job board", boardId: "x", applyUrl: "https://jobs.lever.co/x/1", postedAtLabel: "Posted", fetchedAt: "2026-11-19T00:00:00Z" } }), m: matchOpportunity(listing(), DEFAULT_CAREER) },
];
const base = { savedOnly: false, saved: [] as string[], authFilter: "all" as const, source: "all" as const };

describe("saved jobs", () => {
  it("toggles on and off without duplicates", () => {
    let s = toggleSavedList([], "o1");
    s = toggleSavedList(s, "o2");
    expect(s).toEqual(["o1", "o2"]);
    s = toggleSavedList(s, "o1");
    expect(s).toEqual(["o2"]);
  });
});

describe("application tracking", () => {
  it("sets and updates status per listing", () => {
    let st = setApplicationStatus({}, "o1", "applied");
    st = setApplicationStatus(st, "o1", "interviewing");
    st = setApplicationStatus(st, "o3", "interested");
    expect(st).toEqual({ o1: "interviewing", o3: "interested" });
  });
  it("resetting to not-started removes the entry", () => {
    expect(setApplicationStatus({ o1: "applied" }, "o1", "not-started")).toEqual({});
  });
});

describe("filtering", () => {
  it("returns everything with no filters", () => {
    expect(filterListings(items, base)).toHaveLength(items.length);
  });
  it("saved-only shows only saved listings", () => {
    expect(filterListings(items, { ...base, savedOnly: true, saved: ["o1", "o6"] }).map((x) => x.o.id)).toEqual(["o1", "o6"]);
  });
  it("filters by work-authorization category", () => {
    const r = filterListings(items, { ...base, authFilter: "restricted" });
    expect(r.map((x) => x.o.id)).toEqual(["o4"]);
  });
  it("filters by data source", () => {
    expect(filterListings(items, { ...base, source: "live" }).map((x) => x.o.id)).toEqual(["live1"]);
    expect(filterListings(items, { ...base, source: "demo" })).toHaveLength(OPPORTUNITIES.length);
  });
  it("filters by application status, treating missing as not-started", () => {
    const statuses = { o1: "applied" as const };
    expect(filterListings(items, { ...base, statusFilter: "applied", statuses }).map((x) => x.o.id)).toEqual(["o1"]);
    expect(filterListings(items, { ...base, statusFilter: "not-started", statuses })).toHaveLength(items.length - 1);
  });
  it("filters by field and free-text search (role, company, skills)", () => {
    expect(filterListings(items, { ...base, field: "Cybersecurity" }).map((x) => x.o.id).sort()).toEqual(["o4", "o8"]);
    expect(filterListings(items, { ...base, query: "pytorch" }).map((x) => x.o.id)).toEqual(["o2"]);
    expect(filterListings(items, { ...base, query: "  ROSSLYN " }).map((x) => x.o.id)).toEqual(["o5"]);
    expect(filterListings(items, { ...base, query: "no-such-thing" })).toEqual([]);
  });

  it("combines filters", () => {
    const r = filterListings(items, { ...base, savedOnly: true, saved: ["o1", "o2"], authFilter: "confirmed" });
    expect(r.map((x) => x.o.id)).toEqual(["o1"]);
  });
});
