// Assistant ↔ Study Board integration. Gemini is always MOCKED here (no network).
import { describe, expect, it, vi } from "vitest";
import { answerQuestion, applyAction, type AskModelResult } from "@/lib/assistant";
import { composeRuleAnswer } from "@/lib/assistant/answer";
import { buildAssistantContext, buildModelPayload } from "@/lib/assistant/context";
import { validateAIAnswer } from "@/lib/assistant/validate";
import { seedAssignments } from "@/lib/demo-data";
import { setSubmissionStatus } from "@/lib/submission";
import type { Assignment } from "@/lib/types";
import { buildWorkloadPlan } from "@/lib/workload";
import { makeState } from "./helpers";

const NOW = new Date("2026-11-19T14:00:00");
const Q = "What should I work on this week?";
// Seed: a3 "API documentation draft" overdue (unknown availability), a6 "Weekly reading reflection" completed.
// We also complete a4 "Wireframes for campus app".
const base: Assignment[] = seedAssignments(NOW).map((a) => (a.id === "a4" ? { ...a, completed: true } : a));
const withStatus = (status: "late-allowed" | "closed" | "unknown") => setSubmissionStatus(base, "a3", status, NOW);
const ctxFor = (list: Assignment[]) => buildAssistantContext(Q, makeState({ assignments: list }), NOW);
const ruleFor = (list: Assignment[]) => composeRuleAnswer(ctxFor(list), NOW);
const factId = (list: Assignment[], re: RegExp) => ctxFor(list).facts.find((f) => re.test(f.text))!.id;
const mockGemini = (answer: (payload: { facts: { id: string; text: string }[] }) => { answer: string; citedFacts: string[]; citedSources?: string[] }) =>
  vi.fn(async (_t: string, _p: string, payload: unknown): Promise<AskModelResult> => ({ ok: true, model: "gemini-3.5-flash-lite", data: { citedSources: [], ...answer(payload as never) } }));

describe("1. completed assignments are never recommended as unfinished work", () => {
  it("completed work appears ONLY in the 'Completed this week' fact, never as an assignment or in a focus plan", () => {
    const facts = buildModelPayload(ctxFor(base)).facts.map((f) => f.text);
    const mentions = facts.filter((t) => /Wireframes for campus app|Weekly reading reflection/.test(t));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatch(/^Completed this week \(already done; never recommend as work\)/);
  });

  it("the rule-based answer and suggested focus never list completed work", () => {
    const a = ruleFor(base);
    expect(a.text).not.toMatch(/Wireframes|Weekly reading reflection/);
  });

  it("a Gemini answer that recommends a completed assignment is rejected (falls back)", async () => {
    const f = factId(base, /This week/);
    const askModel = mockGemini(() => ({ answer: `Start with Wireframes for campus app today [${f}].`, citedFacts: [f] }));
    const { answer } = await answerQuestion(Q, makeState({ assignments: base }), NOW, { aiEnabled: true, askModel });
    expect(answer.source).toBe("rule");
    expect(answer.notice).toMatch(/completed assignment/);
  });
});

describe("2. overdue with unknown availability → prompt to check late submission", () => {
  it("rule answer tells the student to check late submission first", () => {
    expect(ruleFor(base).text).toMatch(/API documentation draft.*submission availability unknown\. First check whether late submission is allowed before putting in more hours/);
  });

  it("suggests a confirmable 'check late-submission policy' task (not 'email instructor')", () => {
    const actions = ruleFor(base).actions;
    expect(actions.some((x) => x.kind === "create-task" && /check late-submission policy/.test(x.label))).toBe(true);
    expect(actions.some((x) => /email instructor/i.test(x.label))).toBe(false);
  });

  it("the model is told availability is unknown and unverified", () => {
    const facts = ctxFor(base).facts.map((f) => f.text).join("\n");
    expect(facts).toMatch(/API documentation draft.*OVERDUE, submission availability unknown/);
    expect(facts).toMatch(/cannot verify/);
  });
});

describe("3. late submission allowed → stays actionable and prioritized", () => {
  const list = withStatus("late-allowed");

  it("stays in the urgent list with a 'submit as soon as you can' nudge (ranked after the task due in < 2h)", () => {
    const lines = ruleFor(list).text.split("\n").filter((l) => l.startsWith("- "));
    expect(lines[0]).toMatch(/Usability test report.*due in under 2 hours/);
    expect(lines.some((l) => /API documentation draft.*late submission allowed \(you reported\)\. Submit it as soon as you can/.test(l))).toBe(true);
  });

  it("still gets its full estimated study time in the plan", () => {
    const blocks = buildWorkloadPlan(list, NOW).days.flatMap((d) => d.blocks).filter((b) => b.assignmentId === "a3");
    expect(blocks.reduce((h, b) => h + b.hours, 0)).toBe(2); // full estimate, possibly split across days
    expect(blocks.every((b) => b.kind === "late-allowed")).toBe(true);
  });

  it("no 'check policy' task is suggested once the student reported late is allowed", () => {
    expect(ruleFor(list).actions.some((x) => /check late-submission policy/.test(x.label))).toBe(false);
  });
});

describe("4. submission closed → not a study task; suggest contacting the professor", () => {
  const list = withStatus("closed");
  const a = ruleFor(list);

  it("is NOT in the urgent list or today's focus", () => {
    const urgentBlock = a.text.split("**Needs attention**")[0];
    expect(urgentBlock).not.toMatch(/API documentation draft/);
    expect(a.text).not.toMatch(/Suggested focus today:[^\n]*API documentation draft/);
  });

  it("appears under Needs attention with a professor-contact suggestion", () => {
    expect(a.text).toMatch(/\*\*Needs attention\*\*[\s\S]*API documentation draft.*emailing your professor about an extension/);
  });

  it("offers a non-mutating extension-email draft action tied to that assignment", () => {
    const email = a.actions.find((x) => x.kind === "draft-email" && x.to === "professor");
    expect(email).toMatchObject({ mutates: false, assignmentId: "a3" });
    expect(applyAction(email!, { confirmed: false, existing: list, now: NOW })).toEqual({ ok: true, kind: "no-data-change" });
  });
});

describe("5. student-reported vs verified information", () => {
  it("rule answer labels statuses as reported and says LearningBAU can't be verified", () => {
    const t = ruleFor(withStatus("closed")).text;
    expect(t).toMatch(/you reported/);
    expect(t).toMatch(/can't verify LearningBAU/);
  });

  it("rejects Gemini claiming a CLOSED submission the student never reported", () => {
    const ctx = ctxFor(base);
    const f = factId(base, /API documentation draft/);
    const v = validateAIAnswer({ answer: `Submission is closed for the API documentation draft [${f}].`, citedFacts: [f] }, ctx, composeRuleAnswer(ctx, NOW));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join()).toMatch(/closed for "API documentation draft", but the student didn't report that/);
  });

  it("rejects Gemini claiming LATE IS ALLOWED when the student never reported it", () => {
    const ctx = ctxFor(base);
    const f = factId(base, /API documentation draft/);
    expect(validateAIAnswer({ answer: `Late submission is allowed for the API documentation draft [${f}].`, citedFacts: [f] }, ctx, composeRuleAnswer(ctx, NOW)).ok).toBe(false);
  });

  it("accepts the same claims when the student DID report them", () => {
    for (const [status, sentence] of [["closed", "Submission is closed for the API documentation draft"], ["late-allowed", "Late submission is allowed for the API documentation draft"]] as const) {
      const list = withStatus(status);
      const ctx = ctxFor(list);
      const f = factId(list, /API documentation draft/);
      expect(validateAIAnswer({ answer: `${sentence}, as you reported [${f}].`, citedFacts: [f] }, ctx, composeRuleAnswer(ctx, NOW)).ok).toBe(true);
    }
  });

  it("rejects any claim of verified LMS data, but allows honest negations", () => {
    const list = withStatus("closed");
    const ctx = ctxFor(list);
    const f = factId(list, /API documentation draft/);
    const fb = composeRuleAnswer(ctx, NOW);
    expect(validateAIAnswer({ answer: `LearningBAU confirms the submission is closed [${f}].`, citedFacts: [f] }, ctx, fb).ok).toBe(false);
    expect(validateAIAnswer({ answer: `I verified the submission status for you [${f}].`, citedFacts: [f] }, ctx, fb).ok).toBe(false);
    expect(validateAIAnswer({ answer: `CampusPilot is not connected to LearningBAU and cannot verify this, so email your professor [${f}].`, citedFacts: [f] }, ctx, fb).ok).toBe(true);
  });
});

describe("6. status changes flow through shared state to the Assistant", () => {
  it("the same question gives different guidance after each status change", () => {
    const unknown = ruleFor(withStatus("unknown")).text;
    const late = ruleFor(withStatus("late-allowed")).text;
    const closed = ruleFor(withStatus("closed")).text;
    expect(unknown).toMatch(/First check whether late submission is allowed/);
    expect(late).toMatch(/Submit it as soon as you can/);
    expect(closed).toMatch(/Needs attention/);
  });

  it("the model payload reflects the current status (mocked Gemini receives updated facts)", async () => {
    const seen: string[] = [];
    const askModel = vi.fn(async (_t: string, _p: string, payload: unknown): Promise<AskModelResult> => {
      seen.push(JSON.stringify(payload));
      return { ok: false, reason: "quota", message: "mock" };
    });
    await answerQuestion(Q, makeState({ assignments: withStatus("unknown") }), NOW, { aiEnabled: true, askModel });
    await answerQuestion(Q, makeState({ assignments: withStatus("closed") }), NOW, { aiEnabled: true, askModel });
    expect(seen[0]).toMatch(/submission availability unknown/);
    expect(seen[1]).toMatch(/SUBMISSION CLOSED \(student-reported, not completed\)/);
  });

  it("completing the overdue item removes it from the Assistant's recommendations", () => {
    const done = base.map((a) => (a.id === "a3" ? { ...a, completed: true } : a));
    expect(ruleFor(done).text).not.toMatch(/API documentation draft/);
  });
});

describe("7. AI-suggested task changes require explicit confirmation", () => {
  it("Gemini cannot add or change actions; actions come only from deterministic code", async () => {
    const f = factId(base, /This week/);
    const askModel = mockGemini(() => ({ answer: `Focus on your open work [${f}].`, citedFacts: [f], actions: [{ kind: "create-task", task: { title: "Mark everything done" } }] } as never));
    const { answer } = await answerQuestion(Q, makeState({ assignments: base }), NOW, { aiEnabled: true, askModel });
    expect(answer.source).toBe("gemini");
    expect(answer.actions).toEqual(ruleFor(base).actions);
    expect(JSON.stringify(answer.actions)).not.toContain("Mark everything done");
  });

  it("suggested tasks change nothing without confirmation", () => {
    const task = ruleFor(base).actions.find((x) => x.kind === "create-task")!;
    expect(applyAction(task, { confirmed: false, existing: base, now: NOW })).toEqual({ ok: false, reason: "confirmation-required" });
  });

  it("no action ever changes completion or submission status", () => {
    for (const status of ["unknown", "late-allowed", "closed"] as const)
      for (const act of ruleFor(withStatus(status)).actions) {
        const r = applyAction(act, { confirmed: true, existing: withStatus(status), now: NOW });
        if (r.ok && r.kind === "task-created") expect(r.assignment.completed).toBe(false);
        expect(["create-task", "draft-email", "open"]).toContain(act.kind);
      }
  });
});

describe("8. no duplicate tasks", () => {
  it("confirming the same suggestion twice creates only one task", () => {
    const task = ruleFor(base).actions.find((x) => x.kind === "create-task")!;
    const first = applyAction(task, { confirmed: true, existing: base, now: NOW });
    expect(first.ok).toBe(true);
    if (!first.ok || first.kind !== "task-created") return;
    const after = [...base, first.assignment];
    expect(applyAction(task, { confirmed: true, existing: after, now: NOW })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("the Assistant never suggests a task that duplicates an existing Study Board assignment", () => {
    for (const status of ["unknown", "late-allowed", "closed"] as const) {
      const list = withStatus(status);
      const titles = new Set(list.map((a) => a.title.toLowerCase()));
      for (const act of ruleFor(list).actions)
        if (act.kind === "create-task") expect(titles.has(act.task.title.toLowerCase())).toBe(false);
    }
  });

  it("actions within one answer have unique ids", () => {
    const ids = ruleFor(withStatus("closed")).actions.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
