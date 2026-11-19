// CampusPilot Assistant orchestration: context → deterministic answer → optional Gemini phrasing → validation.
import type { CampusState } from "../store";
import { composeRuleAnswer, type AssistantAnswer } from "./answer";
import { buildAssistantContext, buildModelPayload, type AssistantContext } from "./context";
import { validateAIAnswer } from "./validate";

export type { AssistantAnswer } from "./answer";
export type { AssistantContext, AssistantModule } from "./context";
export { applyAction, type ProposedAction } from "./actions";

export type AskModel = (task: string, prompt: string, payload: unknown) => Promise<unknown | null>;

export async function answerQuestion(
  question: string,
  state: CampusState,
  now: Date,
  opts: { aiEnabled: boolean; askModel: AskModel },
): Promise<{ answer: AssistantAnswer; ctx: AssistantContext }> {
  const ctx = buildAssistantContext(question, state, now);
  const rule = composeRuleAnswer(ctx, now);
  if (!opts.aiEnabled) return { answer: rule, ctx };

  const raw = await opts.askModel(
    "assistant",
    "Answer the student's question using only the facts and passages. Return JSON {answer, citedFacts, citedSources}.",
    buildModelPayload(ctx),
  );
  if (raw === null) return { answer: { ...rule, notice: "Gemini didn't respond, so this is the rule-based answer." }, ctx };
  const v = validateAIAnswer(raw, ctx, rule);
  if (v.ok) return { answer: v.answer, ctx };
  return { answer: { ...rule, notice: `Gemini's answer was withheld because it failed verification (${v.reasons.join(" ")}). Showing the rule-based answer.` }, ctx };
}
