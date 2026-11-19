import { NextResponse } from "next/server";
import { geminiFromEnv } from "@/lib/gemini/server";

// Server-only Gemini proxy. The API key is read from the server environment and never sent to the browser,
// never included in responses, and never logged.
export const dynamic = "force-dynamic";

export async function GET() {
  // Status only: no key, no key prefix, no project info.
  return NextResponse.json(geminiFromEnv().status());
}

export async function POST(req: Request) {
  let body: { task?: unknown; prompt?: unknown; context?: unknown; format?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ source: "error", reason: "bad-request", message: "Invalid JSON" }, { status: 400 });
  }
  const r = await geminiFromEnv().generate({
    task: String(body.task ?? ""),
    prompt: String(body.prompt ?? ""),
    context: body.context ?? {},
    format: body.format === "json" ? "json" : "text",
  });
  if (r.ok) return NextResponse.json({ source: "gemini", model: r.model, cached: r.cached, ...(r.data !== undefined ? { data: r.data } : { text: r.text }) });
  const source = r.reason === "missing-key" || r.reason === "invalid-key" || r.reason === "model-not-allowed" ? "unavailable" : r.reason === "quota" || r.reason === "local-limit" ? "quota" : "error";
  return NextResponse.json({ source, reason: r.reason, message: r.message, ...(r.retryAfterSec ? { retryAfterSec: r.retryAfterSec } : {}) });
}
