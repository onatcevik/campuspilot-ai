"use client";

import { useEffect, useState } from "react";

let cached: "gemini" | "fallback" | null = null;

export function useAiStatus() {
  const [status, setStatus] = useState<"loading" | "gemini" | "fallback">(cached ?? "loading");
  useEffect(() => {
    if (cached) return;
    fetch("/api/ai")
      .then((r) => r.json())
      .then((d) => { cached = d.configured ? "gemini" : "fallback"; setStatus(cached); })
      .catch(() => { cached = "fallback"; setStatus("fallback"); });
  }, []);
  return status;
}

/** Ask the server AI route. Returns null when Gemini isn't configured or fails, so callers use a deterministic fallback. */
export async function askAI(task: string, prompt: string, context: unknown): Promise<string | null> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, prompt, context }),
    });
    const data = await res.json();
    return data.source === "gemini" && typeof data.text === "string" ? data.text : null;
  } catch {
    return null;
  }
}

/** JSON variant. Returns the parsed object, or null (not configured / failed / invalid) so callers fall back. */
export async function askAIJson(task: string, prompt: string, context: unknown): Promise<unknown | null> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, prompt, context, format: "json" }),
    });
    const data = await res.json();
    return data.source === "gemini" && data.data && typeof data.data === "object" ? data.data : null;
  } catch {
    return null;
  }
}
