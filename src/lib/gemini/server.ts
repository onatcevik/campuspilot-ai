// Server-only Gemini client with free-tier safeguards. Never import this from client components.
//
// What code CAN do: pin a free-tier model, refuse paid models, never auto-switch models, rate-limit locally,
// cache and de-duplicate identical requests, stop calling after a quota error, and fall back to rule-based answers.
// What code CANNOT do: guarantee zero charges if a billing account is linked to the Google Cloud project.
// That is an account setting — see README "Gemini free-tier setup".
import { createHash } from "node:crypto";

/** Verified on the official Gemini pricing page (Nov 2026): input + output "Free of charge" on the Free Tier. */
export const FREE_TIER_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const ALLOWED_TASKS = ["assistant", "career-analysis", "daily-briefing", "study-plan", "immigration-rag"] as const;

export const HARD_MAX_PER_MINUTE = 10;
export const HARD_MAX_PER_DAY = 200;

export type GeminiFailureReason =
  | "missing-key" | "invalid-key" | "model-not-allowed" | "quota" | "local-limit" | "billing-or-permission"
  | "model-mismatch" | "timeout" | "upstream-error" | "invalid-response" | "bad-request";

export type GeminiResult =
  | { ok: true; text: string; data?: unknown; model: string; cached: boolean }
  | { ok: false; reason: GeminiFailureReason; message: string; retryAfterSec?: number };

export interface GeminiRequest { task: string; prompt: string; context: unknown; format: "text" | "json" }

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  perMinute?: number;
  perDay?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

const SYSTEM = `You are CampusPilot, a warm, concise student-success companion inside a university hackathon demo.
The student and course data you receive is FICTIONAL demo data. Job listings are fictional demo listings unless labeled otherwise.
Rules:
- Use only the provided facts and passages. Do not invent requirements, deadlines, policies, eligibility decisions, citations, or job opportunities.
- Never recompute or alter numbers, dates, credits or scores; copy them exactly as given.
- For F-1, CPT, OPT or STEM OPT: general information only, grounded in the provided official-source passages; the DSO and USCIS decide eligibility. Not legal advice.
- Never claim an employer sponsors visas or accepts CPT/OPT unless a fact states the listing says so.
- When asked for JSON, return only a JSON object matching the requested schema.`;

const RESPONSE_HINT_SAFE: Record<GeminiFailureReason, string> = {
  "missing-key": "Gemini isn't configured (no GEMINI_API_KEY on the server).",
  "invalid-key": "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local and restart the server.",
  "model-not-allowed": "The configured Gemini model isn't on CampusPilot's free-tier allowlist, so AI is disabled.",
  quota: "The Gemini free-tier limit was reached.",
  "local-limit": "CampusPilot's own request limit was reached to protect your free quota.",
  "billing-or-permission": "Gemini refused the request (billing, key permissions, or project verification). CampusPilot never retries this automatically.",
  "model-mismatch": "Gemini answered with a different model than the pinned free-tier model, so the answer was discarded.",
  timeout: "Gemini took too long to respond.",
  "upstream-error": "Gemini is temporarily unavailable.",
  "invalid-response": "Gemini returned a response CampusPilot couldn't read.",
  "bad-request": "The request to Gemini was invalid.",
};

/** Parses Google's RetryInfo ("37s") from an error body, if present. */
export function parseRetryDelay(body: unknown): number | undefined {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details;
  const d = Array.isArray(details) ? details.find((x) => typeof x?.retryDelay === "string")?.retryDelay : undefined;
  const m = d?.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.ceil(Number(m[1])) : undefined;
}

/** Google reports a bad key as HTTP 400 with reason API_KEY_INVALID. */
export function isInvalidKey(body: unknown): boolean {
  const e = (body as { error?: { status?: string; message?: string; details?: { reason?: string }[] } })?.error;
  return !!e && ((Array.isArray(e.details) && e.details.some((d) => d?.reason === "API_KEY_INVALID")) || /api key not valid|invalid api key/i.test(e.message ?? ""));
}

export function createGeminiClient(cfg: GeminiConfig = {}) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const now = cfg.now ?? (() => Date.now());
  const model = (cfg.model || DEFAULT_MODEL).trim();
  const modelAllowed = (FREE_TIER_MODELS as readonly string[]).includes(model);
  const perMinute = Math.min(Math.max(1, cfg.perMinute ?? 8), HARD_MAX_PER_MINUTE);
  const perDay = Math.min(Math.max(1, cfg.perDay ?? 150), HARD_MAX_PER_DAY);
  const timeoutMs = cfg.timeoutMs ?? 20_000;

  let cooldownUntil = 0;
  const minuteLog: number[] = [];
  let day = new Date(now()).toDateString();
  let dayCount = 0;
  const cache = new Map<string, { at: number; value: GeminiResult }>();
  const inflight = new Map<string, Promise<GeminiResult>>();
  const CACHE_TTL = 10 * 60_000;
  const CACHE_MAX = 100;

  const fail = (reason: GeminiFailureReason, retryAfterSec?: number): GeminiResult => ({ ok: false, reason, message: RESPONSE_HINT_SAFE[reason], ...(retryAfterSec ? { retryAfterSec } : {}) });

  function status() {
    const t = now();
    if (new Date(t).toDateString() !== day) { day = new Date(t).toDateString(); dayCount = 0; }
    return {
      configured: Boolean(cfg.apiKey) && modelAllowed,
      hasKey: Boolean(cfg.apiKey),
      model,
      modelAllowed,
      allowedModels: [...FREE_TIER_MODELS],
      cooldownSec: cooldownUntil > t ? Math.ceil((cooldownUntil - t) / 1000) : 0,
      limits: { perMinute, perDay },
      usedToday: dayCount,
    };
  }

  async function call(req: GeminiRequest, key: string): Promise<GeminiResult> {
    const t = now();
    // local rate limits (count only requests that actually go upstream)
    while (minuteLog.length && t - minuteLog[0] > 60_000) minuteLog.shift();
    if (minuteLog.length >= perMinute) return fail("local-limit", Math.ceil((60_000 - (t - minuteLog[0])) / 1000));
    if (dayCount >= perDay) return fail("local-limit");
    minuteLog.push(t);
    dayCount++;

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Task: ${req.task}\n\nContext (JSON):\n${JSON.stringify(req.context ?? {}).slice(0, 12_000)}\n\nRequest:\n${req.prompt.slice(0, 4_000)}` }] }],
      generationConfig: {
        temperature: req.format === "json" ? 0.3 : 0.5,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingLevel: "minimal" },
        ...(req.format === "json" ? { responseMimeType: "application/json" } : {}),
      },
    };

    let res: Response;
    try {
      res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return fail(e instanceof Error && /timeout|abort/i.test(`${e.name} ${e.message}`) ? "timeout" : "upstream-error");
    }

    if (!res.ok) {
      let errBody: unknown = null;
      try { errBody = await res.json(); } catch { /* ignore */ }
      if (res.status === 429) {
        const retry = parseRetryDelay(errBody) ?? 60;
        cooldownUntil = now() + retry * 1000; // stop calling Gemini until the quota window passes
        return fail("quota", retry);
      }
      if (res.status === 402 || res.status === 403 || res.status === 401) {
        cooldownUntil = now() + 10 * 60_000; // don't hammer a refusing project
        return fail("billing-or-permission");
      }
      if (res.status === 400 && isInvalidKey(errBody)) {
        cooldownUntil = now() + 10 * 60_000;
        return fail("invalid-key");
      }
      if (res.status === 400 || res.status === 404) return fail("bad-request");
      return fail("upstream-error");
    }

    let data: { candidates?: { content?: { parts?: { text?: string }[] } }[]; modelVersion?: string };
    try { data = await res.json(); } catch { return fail("invalid-response"); }
    // No silent model switching: the answer must come from the pinned free-tier model.
    if (data.modelVersion && !data.modelVersion.startsWith(model)) return fail("model-mismatch");
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) return fail("invalid-response");
    if (req.format === "json") {
      try {
        return { ok: true, text, data: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")), model, cached: false };
      } catch {
        return fail("invalid-response");
      }
    }
    return { ok: true, text, model, cached: false };
  }

  async function generate(req: GeminiRequest): Promise<GeminiResult> {
    if (!(ALLOWED_TASKS as readonly string[]).includes(req.task) || typeof req.prompt !== "string" || !req.prompt.trim()) return fail("bad-request");
    if (!cfg.apiKey) return fail("missing-key");
    if (!modelAllowed) return fail("model-not-allowed");
    const t = now();
    if (cooldownUntil > t) return fail("quota", Math.ceil((cooldownUntil - t) / 1000));

    const key = createHash("sha256").update(JSON.stringify([model, req.task, req.format, req.prompt, req.context ?? null])).digest("hex");
    const hit = cache.get(key);
    if (hit && t - hit.at < CACHE_TTL) return hit.value.ok ? { ...hit.value, cached: true } : hit.value;
    const pending = inflight.get(key);
    if (pending) return pending;

    const p = call(req, cfg.apiKey).then((r) => {
      if (r.ok) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: now(), value: r });
      }
      return r;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return { generate, status };
}

let singleton: ReturnType<typeof createGeminiClient> | null = null;
/** Process-wide client built from environment variables (read once). */
export function geminiFromEnv() {
  if (!singleton)
    singleton = createGeminiClient({
      apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
      model: process.env.GEMINI_MODEL,
      perMinute: Number(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE) || undefined,
      perDay: Number(process.env.GEMINI_MAX_REQUESTS_PER_DAY) || undefined,
    });
  return singleton;
}
