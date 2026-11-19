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
/** Submission-status claims must match what the student reported (present in facts). */
const CLAIM_CLOSED = /\bsubmissions? (is |are |has been |have been |was |were )?(now )?closed\b|\bclosed for submissions?\b|\bcan(no|')t (still )?submit\b/i;
const CLAIM_LATE_OK = /\blate (submissions?|work) (is |are )?(still )?(definitely )?(allowed|accepted|permitted|possible)\b/i;
/** Hedged wording is advice, not a status claim ("check whether late submission is allowed"). */
const HEDGE = /\b(whether|if|check|ask|confirm|find out|unknown|unsure|not sure|might|may|could|possibly|depends)\b/i;
/** Acknowledging finished work vs. recommending it as work. */
const ACK = /\b(completed|finished|done|submitted|turned in|great job|well done|nice work|congrat\w*)\b/i;
const ACTION_VERBS = "(?:start|begin|work on|focus on|study|tackle|finish|complete|prioriti[sz]e|spend (?:time|\\d+h?) on|schedule|continue|resume|redo|review)";
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
/** CampusPilot has no LMS integration, so any claim of verified LMS data is false. */
const CLAIM_VERIFIED = /\b(learningbau|lms|canvas|blackboard|moodle)\b[^.]{0,60}\b(confirm\w*|show\w*|verif\w*|says|indicat\w*|report\w*)\b|\bverified\b[^.]{0,40}\bsubmission/i;

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
  reasons.push(...checkSubmissionClaims(text, ctx));
  // Sentence-level, so honest negations ("CampusPilot is not connected to LearningBAU and cannot verify…") are allowed.
  const claimsVerification = text.split(/(?<=[.!?])\s+/).some((sent) => CLAIM_VERIFIED.test(sent) && !/\b(not|cannot|can't|isn't|no|never|unable)\b/i.test(sent));
  if (claimsVerification) reasons.push("Claimed verified LMS/LearningBAU data, which CampusPilot does not have.");
  reasons.push(...checkCompletedMentions(text, ctx));
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

/**
 * Per-assignment check of submission-status claims. Each sentence that asserts "closed" or "late allowed" is matched
 * to assignments by title and by the facts it cites; the claim must hold for EVERY matched assignment.
 * Unmatched claims are rejected (we can't verify them). Hedged advice is not a claim.
 */
export function checkSubmissionClaims(text: string, ctx: AssistantContext): string[] {
  const reasons: string[] = [];
  const open = ctx.data.open;
  const refByFact = new Map(ctx.facts.filter((f) => f.ref).map((f) => [f.id, f.ref!]));
  for (const sent of sentencesOf(text)) {
    const closedClaim = CLAIM_CLOSED.test(sent);
    const lateClaim = CLAIM_LATE_OK.test(sent);
    if ((!closedClaim && !lateClaim) || HEDGE.test(sent)) continue;
    const ids = new Set<string>();
    const lower = sent.toLowerCase();
    open.forEach((a) => { if (lower.includes(a.title.toLowerCase())) ids.add(a.id); });
    [...sent.matchAll(CITATION)].flatMap((m) => m[0].replace(/[[\]\s]/g, "").split(",")).forEach((fid) => { const r = refByFact.get(fid); if (r) ids.add(r); });
    const short = sent.length > 90 ? `${sent.slice(0, 87)}…` : sent;
    if (!ids.size) { reasons.push(`Submission-status claim couldn't be matched to a specific assignment: "${short}"`); continue; }
    for (const id of ids) {
      const a = open.find((x) => x.id === id);
      if (!a) continue;
      if (closedClaim && a.submission !== "closed") reasons.push(`Claimed submission is closed for "${a.title}", but the student didn't report that.`);
      if (lateClaim && a.submission !== "late-allowed") reasons.push(`Claimed late submission is allowed for "${a.title}", but the student didn't report that.`);
    }
  }
  return reasons;
}

/**
 * Completed assignments may be acknowledged ("You completed X, great job!") but never recommended as work.
 * A sentence naming a completed title must read as an acknowledgment and must not attach an action verb to it.
 */
export function checkCompletedMentions(text: string, ctx: AssistantContext): string[] {
  const reasons: string[] = [];
  const titles = (ctx.data.completedTitles ?? []).filter((t) => t.length > 3);
  for (const sent of sentencesOf(text)) {
    for (const t of titles) {
      if (!sent.toLowerCase().includes(t.toLowerCase())) continue;
      const actionOnTitle = new RegExp(`\\b${ACTION_VERBS}\\s+(?:on\\s+)?(?:with\\s+)?(?:your\\s+|the\\s+)?["“']?${escapeRe(t)}`, "i").test(sent);
      if (actionOnTitle || !ACK.test(sent)) reasons.push(`Recommended completed assignment "${t}" as current work.`);
    }
  }
  return reasons;
}
