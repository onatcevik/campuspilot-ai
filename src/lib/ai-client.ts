"use client";

import { useEffect, useState } from "react";

export interface AiServerStatus {
  configured: boolean;
  hasKey: boolean;
  model: string;
  modelAllowed: boolean;
  cooldownSec: number;
  limits: { perMinute: number; perDay: number };
  usedToday: number;
}

let cached: AiServerStatus | null = null;
let inflight: Promise<AiServerStatus | null> | null = null;

function loadStatus(): Promise<AiServerStatus | null> {
  if (!inflight)
    inflight = fetch("/api/ai")
      .then((r) => r.json())
      .then((d: AiServerStatus) => (cached = d))
      .catch(() => null);
  return inflight;
}

/** "gemini" when a key is set AND the model is on the free-tier allowlist; otherwise "fallback". */
export function useAiStatus() {
  const [status, setStatus] = useState<"loading" | "gemini" | "fallback">(cached ? (cached.configured ? "gemini" : "fallback") : "loading");
  useEffect(() => {
    if (cached) return;
    loadStatus().then((d) => setStatus(d?.configured ? "gemini" : "fallback"));
  }, []);
  return status;
}

export function useAiInfo() {
  const [info, setInfo] = useState<AiServerStatus | null>(cached);
  useEffect(() => { if (!cached) loadStatus().then(setInfo); }, []);
  return info;
}

/** Result of a model call, including WHY it failed so the UI can explain the fallback. */
export type ModelResult =
  | { ok: true; data: unknown; model?: string }
  | { ok: false; reason: string; message: string; retryAfterSec?: number };

export async function askAIDetailed(task: string, prompt: string, context: unknown): Promise<ModelResult> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, prompt, context, format: "json" }),
    });
    const d = await res.json();
    if (d.source === "gemini" && d.data && typeof d.data === "object") return { ok: true, data: d.data, model: d.model };
    return { ok: false, reason: String(d.reason ?? "unavailable"), message: String(d.message ?? "Gemini is unavailable."), ...(d.retryAfterSec ? { retryAfterSec: Number(d.retryAfterSec) } : {}) };
  } catch {
    return { ok: false, reason: "network", message: "Couldn't reach the CampusPilot server." };
  }
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
  const r = await askAIDetailed(task, prompt, context);
  return r.ok ? r.data : null;
}
