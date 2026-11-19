// Server-side job providers. Each provider fails independently; one broken board never breaks the page.
import type { CareerOpportunity } from "../types";
import { normalizeGreenhouse, normalizeLever } from "./normalize";

export interface ProviderResult {
  id: string;
  provider: "greenhouse" | "lever";
  ok: boolean;
  count: number;
  error?: string;
}

export interface JobFeed {
  configured: boolean;
  listings: CareerOpportunity[];
  providers: ProviderResult[];
  fetchedAt: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export function parseBoards(env: string | undefined): string[] {
  return (env ?? "").split(",").map((s) => s.trim()).filter((s) => SLUG.test(s));
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchJobFeed(env: { greenhouse?: string; lever?: string }): Promise<JobFeed> {
  const fetchedAt = new Date().toISOString();
  const gh = parseBoards(env.greenhouse);
  const lv = parseBoards(env.lever);
  const tasks = [
    ...gh.map((b) => ({ id: b, provider: "greenhouse" as const, run: async () => normalizeGreenhouse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${b}/jobs?content=true`), b, fetchedAt) })),
    ...lv.map((c) => ({ id: c, provider: "lever" as const, run: async () => normalizeLever(await getJson(`https://api.lever.co/v0/postings/${c}?mode=json`), c, fetchedAt) })),
  ];
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const providers: ProviderResult[] = settled.map((r, i) => ({
    id: tasks[i].id,
    provider: tasks[i].provider,
    ok: r.status === "fulfilled",
    count: r.status === "fulfilled" ? r.value.length : 0,
    ...(r.status === "rejected" ? { error: r.reason instanceof Error ? r.reason.message : "Request failed" } : {}),
  }));
  const seen = new Set<string>();
  const listings = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  return { configured: tasks.length > 0, listings, providers, fetchedAt };
}
