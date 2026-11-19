// Fixtures are synthetic, modeled on the public Greenhouse / Lever API response shapes.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectRegion, detectType, extractSkills, isStale, LIVE_WORK_AUTH_NOTE, normalizeGreenhouse, normalizeLever, verifiedUrl,
} from "@/lib/jobs/normalize";
import { cacheTtlMs, fetchJobFeed, parseBoards } from "@/lib/jobs/providers";

const FETCHED = "2026-11-19T12:00:00.000Z";

const greenhouse = {
  jobs: [
    {
      id: 101, title: "Software Engineering Intern", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/101",
      location: { name: "Washington, DC" }, company_name: "Acme Civic", first_published: "2026-10-01T10:00:00-04:00",
      updated_at: "2026-11-01T10:00:00-04:00", application_deadline: "2026-12-15",
      content: "&lt;p&gt;Build tools in &lt;b&gt;TypeScript&lt;/b&gt; and React. We sponsor visas for eligible candidates.&lt;/p&gt;",
    },
    { id: 102, title: "Senior Staff Engineer", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/102", location: { name: "Washington, DC" }, content: "" },
    { id: 103, title: "Data Science Intern", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/103", location: { name: "San Francisco, CA" }, content: "Python" },
    { id: 104, title: "Cloud Engineering Co-op", absolute_url: "http://job-boards.greenhouse.io/acme/jobs/104", location: { name: "Reston, VA" }, content: "AWS" },
    { id: 105, title: "Security Analyst Intern", absolute_url: "https://evil.example.com/apply", location: { name: "Bethesda, MD" }, content: "Linux" },
    { id: 106, title: "ML Engineer, New Grad", absolute_url: "https://boards.greenhouse.io/acme/jobs/106", location: { name: "Arlington, VA (Hybrid)" }, updated_at: "2026-11-10T00:00:00Z", content: "PyTorch and machine learning" },
  ],
};

const lever = [
  {
    id: "abc", text: "Cybersecurity Intern", hostedUrl: "https://jobs.lever.co/shield/abc", createdAt: 1793000000000,
    categories: { location: "Fort Meade, MD" }, workplaceType: "onsite", descriptionPlain: "Linux, Splunk and networking. OPT-friendly team!",
  },
  { id: "def", text: "Marketing Intern", hostedUrl: "https://jobs.lever.co/shield/def", categories: { location: "Washington, DC" }, descriptionPlain: "" },
];

describe("Greenhouse normalizer", () => {
  const out = normalizeGreenhouse(greenhouse, "acme", FETCHED);

  it("keeps only DMV student tech roles with verified https provider URLs", () => {
    expect(out.map((o) => o.id)).toEqual(["gh-acme-101", "gh-acme-106"]);
  });

  it("maps source info, posting date and provider deadline", () => {
    const o = out[0];
    expect(o.source).toMatchObject({ kind: "live", provider: "greenhouse", boardId: "acme", applyUrl: "https://job-boards.greenhouse.io/acme/jobs/101", postedAtLabel: "Posted", fetchedAt: FETCHED });
    expect(o.source.kind === "live" && o.source.postedAt).toBe("2026-10-01T14:00:00.000Z");
    expect(o.source.kind === "live" && o.source.deadline).toBe("2026-12-15T00:00:00.000Z");
    expect(o.type).toBe("Internship");
    expect(o.region).toBe("Washington, DC");
  });

  it("falls back to updated_at labeled 'Updated' when first_published is missing", () => {
    const o = out[1];
    expect(o.source.kind === "live" && o.source.postedAtLabel).toBe("Updated");
    expect(o.remote).toBe("Hybrid");
    expect(o.type).toBe("Full-time (new grad)");
  });

  it("NEVER infers work authorization from posting text, even when it mentions sponsorship", () => {
    for (const o of out) {
      expect(o.workAuth).toBe("unknown");
      expect(o.workAuthNote).toBe(LIVE_WORK_AUTH_NOTE);
    }
  });

  it("extracts skills from decoded HTML and marks them as extracted", () => {
    expect(out[0].requiredSkills).toEqual(expect.arrayContaining(["TypeScript", "React"]));
    expect(out[0].skillsExtracted).toBe(true);
    expect(out[0].description).not.toContain("<");
  });

  it("handles malformed payloads", () => {
    expect(normalizeGreenhouse(null, "x", FETCHED)).toEqual([]);
    expect(normalizeGreenhouse({ jobs: "nope" }, "x", FETCHED)).toEqual([]);
  });
});

describe("Lever normalizer", () => {
  const out = normalizeLever(lever, "shield", FETCHED);
  it("keeps tech student roles and drops non-tech ones", () => {
    expect(out.map((o) => o.id)).toEqual(["lv-shield-abc"]);
  });
  it("maps fields and never infers OPT acceptance", () => {
    const o = out[0];
    expect(o.region).toBe("Maryland");
    expect(o.field).toBe("Cybersecurity");
    expect(o.workAuth).toBe("unknown");
    expect(o.source.kind === "live" && o.source.postedAt).toBe(new Date(1793000000000).toISOString());
  });
  it("handles malformed payloads", () => {
    expect(normalizeLever({}, "x", FETCHED)).toEqual([]);
  });
});

describe("helpers", () => {
  it("detects DMV regions", () => {
    expect(detectRegion("Washington, D.C.")).toBe("Washington, DC");
    expect(detectRegion("Tysons, VA")).toBe("Northern Virginia");
    expect(detectRegion("Silver Spring, MD")).toBe("Maryland");
    expect(detectRegion("Richmond, VA")).toBeNull();
    expect(detectRegion("Remote, United States")).toBeNull();
  });
  it("detects student role types", () => {
    expect(detectType("Summer 2027 Software Internship")).toBe("Internship");
    expect(detectType("Co-op, Platform")).toBe("Co-op");
    expect(detectType("Software Engineer, New Grad")).toBe("Full-time (new grad)");
    expect(detectType("Internal Tools Engineer")).toBeNull();
  });
  it("skill extraction avoids common false positives", () => {
    expect(extractSkills("We use JavaScript daily")).toEqual(["JavaScript"]); // not Java
    expect(extractSkills("Go beyond and check out our GitHub")).toEqual([]); // not Go, not Git
  });
  it("accepts only https URLs on allowed hosts", () => {
    expect(verifiedUrl("https://jobs.lever.co/a/1", ["lever.co"])).toBeTruthy();
    expect(verifiedUrl("https://lever.co.evil.com/a", ["lever.co"])).toBeNull();
    expect(verifiedUrl("javascript:alert(1)", ["lever.co"])).toBeNull();
  });
  it("flags stale postings", () => {
    const now = new Date("2026-11-19");
    expect(isStale("2021-07-01T00:00:00Z", now)).toBe(true);
    expect(isStale("2026-11-01T00:00:00Z", now)).toBe(false);
    expect(isStale(undefined, now)).toBe(false);
  });
  it("parses env board lists and rejects unsafe slugs", () => {
    expect(parseBoards(" acme, shield ,../etc, bad slug,")).toEqual(["acme", "shield"]);
  });
});

describe("provider layer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("isolates provider failures and merges results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("greenhouse")) return new Response(JSON.stringify(greenhouse));
      return new Response("down", { status: 503 });
    }));
    const feed = await fetchJobFeed({ greenhouse: "acme", lever: "shield" });
    expect(feed.configured).toBe(true);
    expect(feed.listings.map((o) => o.id)).toEqual(["gh-acme-101", "gh-acme-106"]);
    expect(feed.providers).toEqual([
      { id: "acme", provider: "greenhouse", ok: true, count: 2 },
      { id: "shield", provider: "lever", ok: false, count: 0, error: "HTTP 503" },
    ]);
  });

  it("caches full results for 30 min but failed results only briefly", () => {
    expect(cacheTtlMs({ providers: [{ id: "a", provider: "lever", ok: true, count: 3 }] })).toBe(30 * 60_000);
    expect(cacheTtlMs({ providers: [{ id: "a", provider: "lever", ok: true, count: 3 }, { id: "b", provider: "lever", ok: false, count: 0, error: "timeout" }] })).toBe(2 * 60_000);
  });

  it("is a no-op when nothing is configured", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const feed = await fetchJobFeed({});
    expect(feed).toMatchObject({ configured: false, listings: [] });
    expect(f).not.toHaveBeenCalled();
  });
});
