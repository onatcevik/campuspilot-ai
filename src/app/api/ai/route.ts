import { NextResponse } from "next/server";

// Server-only Gemini proxy. The API key never reaches the browser.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM = `You are CampusPilot AI, a concise, warm student-success assistant for a university hackathon demo.
All student, course, and job data you receive is FICTIONAL demo data.
Rules:
- Use only the provided context. Do not invent deadlines, policies, employers' sponsorship decisions, or university approvals.
- For F-1, CPT, OPT, or STEM OPT topics: give general information only, cite the official sources provided (USCIS, Study in the States), and tell the student to confirm with their DSO. This is not legal advice.
- Keep answers under 180 words, using short paragraphs or bullets. Plain text, no markdown headings.`;

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ source: "unavailable", reason: "GEMINI_API_KEY not configured" });

  let body: { task?: string; prompt?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ source: "error", reason: "Invalid JSON" }, { status: 400 });
  }
  const prompt = String(body.prompt ?? "").slice(0, 4000);
  const context = JSON.stringify(body.context ?? {}).slice(0, 12000);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `Task: ${body.task ?? "chat"}\n\nStudent context (JSON):\n${context}\n\nRequest:\n${prompt}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return NextResponse.json({ source: "error", reason: `Gemini HTTP ${res.status}` });
    const data = await res.json();
    const text: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!text) return NextResponse.json({ source: "error", reason: "Empty response" });
    return NextResponse.json({ source: "gemini", text });
  } catch {
    return NextResponse.json({ source: "error", reason: "Gemini request failed" });
  }
}
