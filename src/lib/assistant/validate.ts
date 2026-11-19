// Validates a Gemini answer against the deterministic context before it is shown.
// Rejected answers are replaced by the deterministic answer, and the reason is surfaced to the student.
import type { AssistantAnswer } from "./answer";
import type { AssistantContext } from "./context";

export type ValidationResult = { ok: true; answer: AssistantAnswer } | { ok: false; reasons: string[] };

const MAX_LEN = 1500;
const FORM_TOKENS = /\b(F-1|I-20|I-765|I-983|H-1B|8 CFR 214\.2)\b/gi;
// Matches single and grouped citations: [F3], [S1], [F7, F9], [F2, S1]
const CITATION = /\[\s*[FS]\d+(?:\s*,\s*[FS]\d+)*\s*\]/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;
/** Decisions this assistant must never make. */
const DECISION = /\b(you are|you're|you will be|you'll be|you are not|you're not)\s+(?:\w+\s+){0,2}(eligible|ineligible|authorized|approved|allowed to work)\b|\byou (qualify|do not qualify|don't qualify)\b|\bguarantee[sd]?\b/i;
const SPONSOR = /\b(sponsor\w*|h-?1b)\b/i;

const numbersIn = (text: string) => new Set((text.replace(FORM_TOKENS, " ").replace(CITATION, " ").match(NUMBER) ?? []).map((n) => n.replace(",", "")));

/** Every number in the answer must already appear in the facts, passages, or question (small list counts ≤ 5 allowed). */
export function ungroundedNumbers(answer: string, ctx: AssistantContext): string[] {
  const allowed = numbersIn([ctx.question, ...ctx.facts.map((f) => f.text), ...ctx.passages.map((p) => p.text)].join(" "));
  return [...numbersIn(answer)].filter((n) => !allowed.has(n) && !(Number(n) <= 5 && Number.isInteger(Number(n))));
}

export function validateAIAnswer(raw: unknown, ctx: AssistantContext, fallback: AssistantAnswer): ValidationResult {
  if (!raw || typeof raw !== "object") return { ok: false, reasons: ["Response was not a JSON object."] };
  const r = raw as Record<string, unknown>;
  const reasons: string[] = [];
  const text = typeof r.answer === "string" ? r.answer.trim() : "";
  if (!text) reasons.push("Missing answer text.");
  if (text.length > MAX_LEN) reasons.push("Answer too long.");

  const factIds = new Set(ctx.facts.map((f) => f.id));
  const passageIds = new Set(ctx.passages.map((p) => p.id));
  const citedFacts = Array.isArray(r.citedFacts) ? r.citedFacts.filter((x): x is string => typeof x === "string") : [];
  const citedSources = Array.isArray(r.citedSources) ? r.citedSources.filter((x): x is string => typeof x === "string") : [];
  const inlineIds = [...text.matchAll(CITATION)].flatMap((m) => m[0].replace(/[[\]\s]/g, "").split(","));
  const inlineFacts = inlineIds.filter((id) => id.startsWith("F"));
  const inlineSources = inlineIds.filter((id) => id.startsWith("S"));
  const allFacts = [...new Set([...citedFacts, ...inlineFacts])];
  const allSources = [...new Set([...citedSources, ...inlineSources])];

  const badFacts = allFacts.filter((id) => !factIds.has(id));
  const badSources = allSources.filter((id) => !passageIds.has(id));
  if (badFacts.length) reasons.push(`Cited facts that don't exist: ${badFacts.join(", ")}.`);
  if (badSources.length) reasons.push(`Cited sources that weren't provided: ${badSources.join(", ")}.`);
  if (ctx.facts.length && !allFacts.length) reasons.push("Answer did not cite any facts.");

  const nums = text ? ungroundedNumbers(text, ctx) : [];
  if (nums.length) reasons.push(`Contains numbers not in your data: ${nums.join(", ")}.`);
  if (DECISION.test(text)) reasons.push("Made an eligibility/authorization decision.");
  if (SPONSOR.test(text)) reasons.push("Made a sponsorship claim.");
  if (ctx.modules.includes("international") && ctx.data.profile.isF1 && /\b(cpt|opt)\b/i.test(text) && !allSources.length)
    reasons.push("Discussed CPT/OPT without citing an official-source passage.");

  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    answer: {
      ...fallback, // modules, official sources and ACTIONS always come from deterministic code — model output can't add actions
      source: "gemini",
      text,
      citedFacts: allFacts,
      citedSources: allSources,
    },
  };
}
