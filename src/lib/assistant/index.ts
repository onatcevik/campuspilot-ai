// CampusPilot Assistant orchestration: context → deterministic answer → optional Gemini phrasing → validation.
import type { CampusState } from "../store";
import { composeRuleAnswer, type AssistantAnswer } from "./answer";
import { buildAssistantContext, buildModelPayload, type AssistantContext } from "./context";
import { validateAIAnswer } from "./validate";

export type { AssistantAnswer } from "./answer";
export type { AssistantContext, AssistantModule } from "./context";
export { applyAction, type ProposedAction } from "./actions";

export type AskModelResult =
  | { ok: true; data: unknown; model?: string; servedModel?: string | null }
  | { ok: false; reason: string; message: string; retryAfterSec?: number };
export type AskModel = (task: string, prompt: string, payload: unknown) => Promise<AskModelResult>;

const PROMPT = `Answer the student's question as a warm, natural, conversational companion (not a template).
Lead with a direct answer, explain the "why" by connecting the relevant modules, and end with one concrete next step.
Use ONLY the facts and passages provided. Copy numbers, dates, credits and scores exactly. Cite facts as [F#] and passages as [S#].
You may rephrase the referenceAnswer, but never add requirements, rules, eligibility decisions, citations or job opportunities that aren't in the facts.
Return JSON {"answer": string, "citedFacts": string[], "citedSources": string[]}.`;

export function fallbackNotice(r: Extract<AskModelResult, { ok: false }>): string {
  const retry = r.retryAfterSec ? ` Try again in about ${r.retryAfterSec}s.` : "";
  if (r.reason === "quota" || r.reason === "local-limit") return `${r.message}${retry} Showing CampusPilot's rule-based answer. No charges are made by falling back.`;
  return `${r.message} Showing CampusPilot's rule-based answer.`;
}

export async function answerQuestion(
  question: string,
  state: CampusState,
  now: Date,
  opts: { aiEnabled: boolean; askModel: AskModel },
): Promise<{ answer: AssistantAnswer; ctx: AssistantContext }> {
  const ctx = buildAssistantContext(question, state, now);
  const rule = composeRuleAnswer(ctx, now);
  if (!opts.aiEnabled) return { answer: rule, ctx };

  const payload = { ...buildModelPayload(ctx), referenceAnswer: rule.text };
  const r = await opts.askModel("assistant", PROMPT, payload);
  if (!r.ok) return { answer: { ...rule, notice: fallbackNotice(r) }, ctx };
  const v = validateAIAnswer(r.data, ctx, rule);
  // Show the model Google reports it actually used (modelVersion); fall back to the configured name.
  if (v.ok) return { answer: { ...v.answer, model: r.servedModel || r.model }, ctx };
  return { answer: { ...rule, notice: `Gemini's answer was withheld because it failed verification (${v.reasons.join(" ")}). Showing the rule-based answer.` }, ctx };
}
