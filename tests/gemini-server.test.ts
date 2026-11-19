// Free-tier safeguards for the server-side Gemini client. All upstream calls are mocked here;
// real-API verification is done manually after the key is configured.
import { describe, expect, it, vi } from "vitest";
import { createGeminiClient, DEFAULT_MODEL, FREE_TIER_MODELS, HARD_MAX_PER_DAY, HARD_MAX_PER_MINUTE, parseRetryDelay } from "@/lib/gemini/server";

const KEY = "test-key-not-real-1234567890";
const okBody = (text: string, modelVersion = DEFAULT_MODEL) => ({ candidates: [{ content: { parts: [{ text }] } }], modelVersion });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const req = (prompt = "hi", format: "text" | "json" = "json") => ({ task: "assistant", prompt, context: { facts: [] }, format });

function client(fetchImpl: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  let t = 1_800_000_000_000;
  const c = createGeminiClient({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => t, ...extra });
  return { c, advance: (ms: number) => (t += ms) };
}

describe("model selection", () => {
  it("defaults to a verified free-tier model", () => {
    expect(FREE_TIER_MODELS).toContain(DEFAULT_MODEL);
    expect(createGeminiClient({ apiKey: KEY }).status().model).toBe("gemini-3.5-flash-lite");
  });

  it("refuses models that aren't on the free-tier allowlist and never calls the API", async () => {
    const f = vi.fn();
    for (const paid of ["gemini-4-carbon", "gemini-3.1-pro-preview", "gemini-2.5-flash"]) {
      const c = createGeminiClient({ apiKey: KEY, model: paid, fetchImpl: f as unknown as typeof fetch });
      expect(c.status().configured).toBe(false);
      expect(await c.generate(req())).toMatchObject({ ok: false, reason: "model-not-allowed" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("discards answers served by a different model (no silent switching)", async () => {
    const f = vi.fn(async () => json(okBody('{"answer":"x"}', "gemini-4-neon-001")));
    expect(await client(f).c.generate(req())).toMatchObject({ ok: false, reason: "model-mismatch" });
  });

  it("calls the pinned model with the key in a header, minimal thinking, JSON mode", async () => {
    const f = vi.fn(async () => json(okBody('{"answer":"ok"}', "gemini-3.5-flash-lite-002")));
    const r = await client(f).c.generate(req());
    expect(r).toMatchObject({ ok: true, data: { answer: "ok" }, model: DEFAULT_MODEL, servedModel: "gemini-3.5-flash-lite-002" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    expect(url).not.toContain(KEY); // key never in the URL
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 1024, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } });
  });
});

describe("missing key", () => {
  it("returns a clear reason without calling the API", async () => {
    const f = vi.fn();
    const c = createGeminiClient({ fetchImpl: f as unknown as typeof fetch });
    expect(c.status()).toMatchObject({ configured: false, hasKey: false });
    expect(await c.generate(req())).toMatchObject({ ok: false, reason: "missing-key" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("free quota exhausted (HTTP 429)", () => {
  it("stops calling Gemini for the retry window, then recovers", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37s" }] } }, 429))
      .mockResolvedValue(json(okBody('{"answer":"back"}')));
    const { c, advance } = client(f);
    expect(await c.generate(req("a"))).toMatchObject({ ok: false, reason: "quota", retryAfterSec: 37 });
    expect(await c.generate(req("b"))).toMatchObject({ ok: false, reason: "quota" });
    expect(f).toHaveBeenCalledTimes(1); // no retry storm during cooldown
    expect(c.status().cooldownSec).toBe(37);
    advance(38_000);
    expect(await c.generate(req("c"))).toMatchObject({ ok: true });
  });

  it("defaults to a 60s cooldown when no retry delay is given", async () => {
    const f = vi.fn(async () => json({ error: { code: 429 } }, 429));
    const { c } = client(f);
    expect(await c.generate(req())).toMatchObject({ ok: false, reason: "quota", retryAfterSec: 60 });
  });

  it("parses Google RetryInfo", () => {
    expect(parseRetryDelay({ error: { details: [{ retryDelay: "12.5s" }] } })).toBe(13);
    expect(parseRetryDelay({})).toBeUndefined();
  });
});

describe("billing / permission refusals", () => {
  it.each([401, 402, 403])("HTTP %i is not retried automatically", async (code) => {
    const f = vi.fn(async () => json({ error: { code } }, code));
    const { c } = client(f);
    expect(await c.generate(req("a"))).toMatchObject({ ok: false, reason: "billing-or-permission" });
    expect(await c.generate(req("b"))).toMatchObject({ ok: false, reason: "quota" }); // cooled down
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("invalid key", () => {
  it("maps Google's API_KEY_INVALID to a clear message and pauses calls", async () => {
    const f = vi.fn(async () => json({ error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }, 400));
    const { c } = client(f);
    const r = await c.generate(req("a"));
    expect(r).toMatchObject({ ok: false, reason: "invalid-key" });
    expect(!r.ok && r.message).toMatch(/\.env\.local/);
    await c.generate(req("b"));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("local request limits", () => {
  it("enforces a per-minute limit before calling upstream", async () => {
    const f = vi.fn(async () => json(okBody('{"answer":"ok"}')));
    const { c, advance } = client(f, { perMinute: 2 });
    expect((await c.generate(req("1"))).ok).toBe(true);
    expect((await c.generate(req("2"))).ok).toBe(true);
    expect(await c.generate(req("3"))).toMatchObject({ ok: false, reason: "local-limit" });
    expect(f).toHaveBeenCalledTimes(2);
    advance(61_000);
    expect((await c.generate(req("4"))).ok).toBe(true);
  });

  it("enforces a per-day limit", async () => {
    const f = vi.fn(async () => json(okBody('{"answer":"ok"}')));
    const { c, advance } = client(f, { perDay: 2, perMinute: 10 });
    await c.generate(req("1"));
    await c.generate(req("2"));
    advance(120_000);
    expect(await c.generate(req("3"))).toMatchObject({ ok: false, reason: "local-limit" });
  });

  it("env overrides can't raise limits above the hard caps", () => {
    const s = createGeminiClient({ apiKey: KEY, perMinute: 9999, perDay: 99999 }).status();
    expect(s.limits).toEqual({ perMinute: HARD_MAX_PER_MINUTE, perDay: HARD_MAX_PER_DAY });
  });
});

describe("avoiding unnecessary calls", () => {
  it("caches identical requests", async () => {
    const f = vi.fn(async () => json(okBody('{"answer":"ok"}')));
    const { c } = client(f);
    await c.generate(req("same"));
    expect(await c.generate(req("same"))).toMatchObject({ ok: true, cached: true });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent identical requests", async () => {
    let resolve!: (r: Response) => void;
    const f = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const { c } = client(f);
    const a = c.generate(req("dup"));
    const b = c.generate(req("dup"));
    resolve(json(okBody('{"answer":"ok"}')));
    await Promise.all([a, b]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown tasks and empty prompts without calling upstream", async () => {
    const f = vi.fn();
    const { c } = client(f);
    expect(await c.generate({ ...req(), task: "write-my-essay" })).toMatchObject({ ok: false, reason: "bad-request" });
    expect(await c.generate(req("   "))).toMatchObject({ ok: false, reason: "bad-request" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("secrets never leak", () => {
  it("results and status never contain the key, even on errors", async () => {
    for (const r of [json({ error: { message: `bad key ${KEY}` } }, 400), json({ error: {} }, 500), json(okBody("not json"))]) {
      const { c } = client(vi.fn(async () => r));
      const out = await c.generate(req(String(Math.random())));
      expect(JSON.stringify(out)).not.toContain(KEY);
      expect(JSON.stringify(c.status())).not.toContain(KEY);
    }
  });

  it("network failures and timeouts degrade gracefully", async () => {
    const { c } = client(vi.fn(async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); }));
    expect(await c.generate(req())).toMatchObject({ ok: false, reason: "timeout" });
  });
});
