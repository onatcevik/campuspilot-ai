import { describe, expect, it, vi } from "vitest";
import { answerQuestion, applyAction } from "@/lib/assistant";
import { composeRuleAnswer } from "@/lib/assistant/answer";
import { makeTaskAction, type ProposedAction } from "@/lib/assistant/actions";
import { buildAssistantContext, buildModelPayload, classifyIntents } from "@/lib/assistant/context";
import { validateAIAnswer } from "@/lib/assistant/validate";
import { DEFAULT_CAREER, OPPORTUNITIES, seedAssignments } from "@/lib/demo-data";
import { buildScenarioPlan, degreeTotals, SCENARIOS } from "@/lib/graduation";
import { matchOpportunity } from "@/lib/matching";
import { makeState } from "./helpers";

const NOW = new Date("2026-11-19T14:00:00");
const state = (over = {}) => makeState({ assignments: seedAssignments(NOW), ...over });
const accelerated = buildScenarioPlan(SCENARIOS.find((s) => s.id === "accelerated")!);
const Q = {
  gradIntern: "Can I graduate by May 2028 and still complete a summer internship?",
  next: "Which courses should I prioritize next semester?",
  skills: "What skills should I improve for my top internship matches?",
  week: "What should I work on this week?",
  ask: "What should I ask my academic advisor or DSO?",
  cpt: "Does CPT affect OPT?",
};

// ---------------------------------------------------------------- context retrieval
describe("context retrieval", () => {
  it("classifies the example questions", () => {
    expect(classifyIntents(Q.gradIntern)).toEqual(["grad-internship"]);
    expect(classifyIntents(Q.next)).toEqual(["next-semester"]);
    expect(classifyIntents(Q.skills)).toEqual(["skills"]);
    expect(classifyIntents(Q.week)).toEqual(["this-week"]);
    expect(classifyIntents(Q.ask)).toEqual(["advisor-dso"]);
    expect(classifyIntents(Q.cpt)).toEqual(["immigration"]);
    expect(classifyIntents("hello")).toEqual(["overview"]);
  });

  it("retrieves only the modules a question needs (data minimization)", () => {
    expect(buildAssistantContext(Q.next, state(), NOW).modules).toEqual(["graduation"]);
    expect(buildAssistantContext(Q.week, state(), NOW).modules).toEqual(["study"]);
    expect(buildAssistantContext(Q.gradIntern, state(), NOW).modules).toEqual(["graduation", "international", "career"]);
    const next = buildAssistantContext(Q.next, state(), NOW);
    expect(next.facts.every((f) => f.module === "graduation")).toBe(true);
    expect(next.passages).toEqual([]);
  });

  it("drops international data for non-F-1 students unless asked", () => {
    const s = state({ intl: { ...makeState().intl, status: "Not an international student" } });
    expect(buildAssistantContext(Q.gradIntern, s, NOW).modules).not.toContain("international");
  });

  it("facts carry the exact deterministic values from the engines", () => {
    const t = degreeTotals();
    const ctx = buildAssistantContext(Q.next, state(), NOW);
    expect(ctx.facts.some((f) => f.text === `Credits: ${t.completed} completed, ${t.inProgress} in progress, ${t.remaining} remaining of ${t.required} required.`)).toBe(true);
    const skills = buildAssistantContext(Q.skills, state(), NOW);
    const o1 = OPPORTUNITIES.find((o) => o.id === "o1")!;
    expect(skills.facts.some((f) => f.text.includes(`scores ${matchOpportunity(o1, DEFAULT_CAREER).score}%`))).toBe(true);
  });

  it("grounds immigration questions in the official-source library", () => {
    const ctx = buildAssistantContext(Q.cpt, state(), NOW);
    expect(ctx.passages.length).toBeGreaterThan(0);
    expect(ctx.passages[0].text).toMatch(/CPT/);
    expect(ctx.officialSources.every((s) => /uscis\.gov|studyinthestates\.dhs\.gov|ecfr\.gov/.test(s.url))).toBe(true);
  });

  it("the model payload never contains the student's name, notes, or raw state", () => {
    const s = state();
    for (const q of Object.values(Q)) {
      const json = JSON.stringify(buildModelPayload(buildAssistantContext(q, s, NOW)));
      expect(json).not.toMatch(/Alex|Morgan/);
      expect(json).not.toContain("Summarize 5 participant sessions"); // assignment note from seed data
      expect(json).not.toMatch(/@[a-z]+\./i); // no email addresses
      expect(json).not.toContain("checklist\":"); // no raw state keys
    }
  });
});

// ---------------------------------------------------------------- deterministic answers
describe("deterministic answers", () => {
  it("grad+internship answer reflects the scenarios and requires CPT via DSO for F-1", () => {
    const a = composeRuleAnswer(buildAssistantContext(Q.gradIntern, state(), NOW), NOW);
    expect(a.text).toMatch(/Short answer/);
    expect(a.text).toContain("Standard load: May 2029");
    expect(a.text).toContain("Accelerated load: May 2028");
    expect(a.text).toMatch(/CPT.*DSO/);
    expect(a.citedSources.length).toBeGreaterThan(0);
  });

  it("next-semester puts blocked courses last and the critical-path course first", () => {
    const a = composeRuleAnswer(buildAssistantContext(Q.next, state(), NOW), NOW);
    const lines = a.text.split("\n").filter((l) => /^\d\./.test(l));
    expect(lines[0]).toMatch(/CS 102/);
    expect(lines.at(-1)).toMatch(/SWE 410.*blocked/);
  });

  it("every cited fact exists in the context", () => {
    for (const q of Object.values(Q)) {
      const ctx = buildAssistantContext(q, state(), NOW);
      const ids = new Set(ctx.facts.map((f) => f.id));
      expect(composeRuleAnswer(ctx, NOW).citedFacts.every((id) => ids.has(id))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- AI response validation
describe("AI response validation", () => {
  const ctx = buildAssistantContext(Q.gradIntern, state(), NOW);
  const fallback = composeRuleAnswer(ctx, NOW);
  const fid = (re: RegExp) => ctx.facts.find((f) => re.test(f.text))!.id;
  const projF = fid(/Current plan projects/);
  const good = { answer: `Your plan projects May 2028 [${projF}]. A summer internship needs CPT from your DSO [S1].`, citedFacts: [projF], citedSources: ["S1"] };

  it("accepts a grounded, cited answer and labels it Gemini", () => {
    const v = validateAIAnswer(good, ctx, fallback);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.answer.source).toBe("gemini");
  });

  it("rejects numbers that aren't in the student's data", () => {
    const v = validateAIAnswer({ ...good, answer: `You still need 27 credits [${projF}] and CPT [S1].` }, ctx, fallback);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join()).toMatch(/27/);
  });

  it("does not flag form names like I-20 or F-1 as invented numbers", () => {
    const v = validateAIAnswer({ ...good, answer: `As an F-1 student, check your I-20 date with your DSO about CPT [${projF}] [S1].` }, ctx, fallback);
    expect(v.ok).toBe(true);
  });

  it("rejects citations to facts or sources that weren't provided", () => {
    expect(validateAIAnswer({ ...good, citedFacts: ["F999"] }, ctx, fallback).ok).toBe(false);
    expect(validateAIAnswer({ ...good, answer: good.answer + " [S42]" }, ctx, fallback).ok).toBe(false);
  });

  it("rejects uncited answers", () => {
    expect(validateAIAnswer({ answer: "Sure, sounds fine!", citedFacts: [], citedSources: [] }, ctx, fallback).ok).toBe(false);
  });

  it("rejects eligibility or authorization decisions", () => {
    for (const bad of ["You are eligible for CPT", "You're definitely authorized to work", "You qualify for OPT", "This is guaranteed"]) {
      expect(validateAIAnswer({ ...good, answer: `${bad} [${projF}] [S1].` }, ctx, fallback).ok).toBe(false);
    }
  });

  it("rejects sponsorship claims", () => {
    expect(validateAIAnswer({ ...good, answer: `Potomac Civic Labs sponsors visas [${projF}] [S1].` }, ctx, fallback).ok).toBe(false);
  });

  it("rejects CPT/OPT statements with no official-source citation", () => {
    expect(validateAIAnswer({ answer: `You should apply for CPT [${projF}].`, citedFacts: [projF], citedSources: [] }, ctx, fallback).ok).toBe(false);
  });

  it("ignores any actions the model tries to add (permission boundary)", () => {
    const evil = { ...good, actions: [{ kind: "create-task", task: { title: "Delete everything" } }] };
    const v = validateAIAnswer(evil, ctx, fallback);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.answer.actions).toEqual(fallback.actions);
  });

  it("rejects non-objects", () => {
    expect(validateAIAnswer("plain text", ctx, fallback).ok).toBe(false);
    expect(validateAIAnswer(null, ctx, fallback).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- permission boundaries
describe("permission boundaries for actions", () => {
  const task = makeTaskAction("t1", "Add task", "Practice Pandas", "notes", 2, new Date("2026-11-25T18:00:00"));
  const base = { existing: seedAssignments(NOW), now: NOW };

  it("never creates data without explicit confirmation", () => {
    expect(applyAction(task, { ...base, confirmed: false })).toEqual({ ok: false, reason: "confirmation-required" });
  });

  it("creates the task only when confirmed, without mutating existing data", () => {
    const before = JSON.stringify(base.existing);
    const r = applyAction(task, { ...base, confirmed: true });
    expect(r.ok && r.kind === "task-created" && r.assignment.title).toBe("Practice Pandas");
    expect(r.ok && r.kind === "task-created" && r.assignment.origin).toEqual({ module: "assistant", actionId: "t1" });
    expect(JSON.stringify(base.existing)).toBe(before);
  });

  it("rejects duplicates, past due dates and tampered origins", () => {
    expect(applyAction(makeTaskAction("t2", "x", "Usability test report", "", 1, new Date("2026-11-25")), { ...base, confirmed: true })).toEqual({ ok: false, reason: "duplicate" });
    expect(applyAction(task, { ...base, confirmed: true, dueOverride: "2026-11-01T00:00:00" })).toEqual({ ok: false, reason: "past-due-date" });
    if (task.kind !== "create-task") throw new Error("expected task action");
    const tampered = { ...task, task: { ...task.task, origin: { module: "career", opportunityId: "o1" } } } as ProposedAction;
    expect(applyAction(tampered, { ...base, confirmed: true })).toEqual({ ok: false, reason: "invalid-action" });
  });

  it("navigation is limited to app routes; email drafts change no data", () => {
    expect(applyAction({ id: "x", kind: "open", label: "", mutates: false, href: "https://evil.example" }, { ...base, confirmed: false })).toEqual({ ok: false, reason: "disallowed-link" });
    expect(applyAction({ id: "x", kind: "open", label: "", mutates: false, href: "/career" }, { ...base, confirmed: false })).toEqual({ ok: true, kind: "no-data-change" });
    expect(applyAction({ id: "x", kind: "draft-email", label: "", mutates: false, to: "dso" }, { ...base, confirmed: false })).toEqual({ ok: true, kind: "no-data-change" });
  });

  it("rejects malformed actions", () => {
    expect(applyAction({} as ProposedAction, { ...base, confirmed: true })).toEqual({ ok: false, reason: "invalid-action" });
    expect(applyAction({ ...task, mutates: false } as unknown as ProposedAction, { ...base, confirmed: true })).toEqual({ ok: false, reason: "invalid-action" });
  });
});

// ---------------------------------------------------------------- orchestration + cross-module
describe("orchestration and cross-module actions", () => {
  it("does not call the model when Gemini isn't configured", async () => {
    const askModel = vi.fn();
    const { answer } = await answerQuestion(Q.week, state(), NOW, { aiEnabled: false, askModel });
    expect(askModel).not.toHaveBeenCalled();
    expect(answer.source).toBe("rule");
    expect(answer.notice).toBeUndefined();
  });

  it("uses the validated Gemini answer when it passes, sending only the minimal payload", async () => {
    const askModel = vi.fn(async (_t: string, _p: string, payload: unknown) => {
      const facts = (payload as { facts: { id: string; text: string }[] }).facts;
      const f = facts.find((x) => x.text.startsWith("This week"))!;
      return { answer: `Check your weekly progress [${f.id}].`, citedFacts: [f.id], citedSources: [] };
    });
    const { answer } = await answerQuestion(Q.week, state(), NOW, { aiEnabled: true, askModel });
    expect(answer.source).toBe("gemini");
    expect(JSON.stringify(askModel.mock.calls[0][2])).not.toMatch(/Alex|Morgan/);
  });

  it("falls back with a visible notice when Gemini fails or is rejected", async () => {
    const down = await answerQuestion(Q.week, state(), NOW, { aiEnabled: true, askModel: async () => null });
    expect(down.answer.source).toBe("rule");
    expect(down.answer.notice).toMatch(/didn't respond/);
    const bad = await answerQuestion(Q.week, state(), NOW, { aiEnabled: true, askModel: async () => ({ answer: "You have 99 assignments.", citedFacts: [] }) });
    expect(bad.answer.source).toBe("rule");
    expect(bad.answer.notice).toMatch(/withheld/);
  });

  it("answers change when another module changes (Graduation Planner → assistant)", () => {
    const draft = composeRuleAnswer(buildAssistantContext(Q.gradIntern, state(), NOW), NOW);
    const fixed = composeRuleAnswer(buildAssistantContext(Q.gradIntern, state({ plan: accelerated }), NOW), NOW);
    expect(draft.text).toMatch(/isn't achievable as written/);
    expect(fixed.text).not.toMatch(/isn't achievable as written/);
  });

  it("a confirmed assistant task lands on the Study Board and shows up in the next answer", () => {
    const s = state();
    const ctx = buildAssistantContext(Q.week, s, NOW);
    const action = composeRuleAnswer(ctx, NOW).actions.find((x) => x.kind === "create-task")!;
    expect(action).toBeDefined();
    const r = applyAction(action, { confirmed: true, existing: s.assignments, now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== "task-created") return;
    const next = { ...s, assignments: [...s.assignments, r.assignment] };
    const after = buildAssistantContext(Q.week, next, NOW);
    expect(after.data.open.some((a) => a.title === r.assignment.title)).toBe(true);
  });
});
