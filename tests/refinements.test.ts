// Regression tests for the four Assistant ↔ Study Board refinements. Gemini is MOCKED (no network).
import { describe, expect, it, vi } from "vitest";
import { answerQuestion, applyAction, type AskModelResult } from "@/lib/assistant";
import { composeRuleAnswer } from "@/lib/assistant/answer";
import { buildAssistantContext } from "@/lib/assistant/context";
import { checkCompletedMentions, checkSubmissionClaims, validateAIAnswer } from "@/lib/assistant/validate";
import { seedAssignments } from "@/lib/demo-data";
import { priorityOf, prioritize } from "@/lib/prioritize";
import { setSubmissionStatus } from "@/lib/submission";
import type { Assignment } from "@/lib/types";
import { buildWorkloadPlan, CHECK_POLICY_HOURS } from "@/lib/workload";
import { makeState } from "./helpers";

const NOW = new Date("2026-11-19T14:00:00");
const Q = "What should I work on this week?";
const H = 3600_000;
const at = (h: number) => new Date(NOW.getTime() + h * H).toISOString();
const mk = (id: string, title: string, dueInHours: number, extra: Partial<Assignment> = {}): Assignment => ({
  id, title, course: "TEST 101", dueDate: at(dueInHours), priority: "medium", completed: false, color: "lavender", estimatedHours: 2, ...extra,
});
const ctxOf = (list: Assignment[]) => buildAssistantContext(Q, makeState({ assignments: list }), NOW);
const fidOf = (list: Assignment[], title: string) => ctxOf(list).facts.find((f) => f.text.includes(`"${title}"`))!.id;

// Two overdue assignments with DIFFERENT statuses.
const A = mk("A", "Essay draft", -48, { submission: "closed" });
const B = mk("B", "Lab report", -30);
const C = mk("C", "Problem set", -72, { submission: "late-allowed" });
const DONE = mk("D", "HCI usability study", -20, { completed: true });
const two = [A, B, C, DONE];

describe("1. submission-status claims are validated PER ASSIGNMENT", () => {
  const ctx = ctxOf(two);
  const claims = (t: string) => checkSubmissionClaims(t, ctx);

  it("accepts a true claim about the right assignment (by title)", () => {
    expect(claims("Submission is closed for the Essay draft.")).toEqual([]);
    expect(claims("Late submission is allowed for the Problem set.")).toEqual([]);
  });

  it("rejects the same claim about a different assignment, even though another one IS closed", () => {
    expect(claims("Submission is closed for the Lab report.")).toEqual([expect.stringMatching(/closed for "Lab report"/)]);
    expect(claims("Late submission is allowed for the Lab report.")).toEqual([expect.stringMatching(/late submission is allowed for "Lab report"/)]);
  });

  it("matches by cited fact as well as by title", () => {
    expect(claims(`The submission is closed [${fidOf(two, "Essay draft")}].`)).toEqual([]);
    expect(claims(`The submission is closed [${fidOf(two, "Lab report")}].`)).toHaveLength(1);
  });

  it("rejects claims that can't be matched to a specific assignment", () => {
    expect(claims("Submission is closed, so don't bother.")).toEqual([expect.stringMatching(/couldn't be matched/)]);
  });

  it("rejects a sentence that applies one status to two assignments when only one has it", () => {
    expect(claims("Submission is closed for the Essay draft and the Lab report.")).toEqual([expect.stringMatching(/"Lab report"/)]);
  });

  it("does NOT reject truthful, hedged advice", () => {
    expect(claims("Check whether late submission is allowed for the Lab report.")).toEqual([]);
    expect(claims("Ask your instructor if submission is closed for the Lab report.")).toEqual([]);
    expect(claims("The Lab report's submission availability is unknown.")).toEqual([]);
  });

  it("treats 'late submission is possible' as a claim (never asserted for unknown status)", () => {
    expect(claims("Late submission is possible for the Lab report.")).toHaveLength(1);
  });
});

describe("2. completed assignments: acknowledgments allowed, recommendations rejected", () => {
  const ctx = ctxOf(two);
  const done = (t: string) => checkCompletedMentions(t, ctx);

  it("allows factual acknowledgments", () => {
    expect(done("You completed your HCI usability study. Great job!")).toEqual([]);
    expect(done("Nice work finishing the HCI usability study.")).toEqual([]);
    expect(done("You finished the HCI usability study, so now focus on the Lab report.")).toEqual([]);
  });

  it("rejects recommending it as work", () => {
    expect(done("Start with the HCI usability study today.")).toHaveLength(1);
    expect(done("Finish the HCI usability study tonight.")).toHaveLength(1);
    expect(done("Spend time on the HCI usability study after lunch.")).toHaveLength(1);
  });

  it("rejects a recommendation even when the sentence also contains praise", () => {
    expect(done("Great job so far, now start the HCI usability study.")).toHaveLength(1);
    expect(done("Nice work this week; focus on the HCI usability study tonight.")).toHaveLength(1);
  });

  it("rejects listing it without any acknowledgment (treated as current work)", () => {
    expect(done("HCI usability study is next on your list.")).toHaveLength(1);
  });

  it("never appears in the deterministic plan or as an assignment fact", () => {
    expect(buildWorkloadPlan(two, NOW).days.flatMap((d) => d.blocks).some((b) => b.assignmentId === "D")).toBe(false);
    expect(ctxOf(two).facts.filter((f) => f.ref === "D")).toEqual([]);
  });

  it("end-to-end with mocked Gemini: acknowledgment passes, recommendation falls back", async () => {
    const f = fidOf(two, "Lab report");
    const ask = (answer: string) => vi.fn(async (): Promise<AskModelResult> => ({ ok: true, model: "gemini-3.5-flash-lite", data: { answer, citedFacts: [f], citedSources: [] } }));
    const ok = await answerQuestion(Q, makeState({ assignments: two }), NOW, { aiEnabled: true, askModel: ask(`You completed the HCI usability study, great job! Next, check whether late submission is allowed for the Lab report [${f}].`) });
    expect(ok.answer.source).toBe("gemini");
    const bad = await answerQuestion(Q, makeState({ assignments: two }), NOW, { aiEnabled: true, askModel: ask(`Start with the HCI usability study, then the Lab report [${f}].`) });
    expect(bad.answer.source).toBe("rule");
    expect(bad.answer.notice).toMatch(/HCI usability study/);
  });
});

describe("3. overdue with UNKNOWN availability", () => {
  it("stays visible in the planner, but only as a short 'check the late policy first' block", () => {
    const blocks = buildWorkloadPlan([B], NOW).days.flatMap((d) => d.blocks);
    expect(blocks).toEqual([expect.objectContaining({ assignmentId: "B", kind: "check-late-policy", hours: CHECK_POLICY_HOURS })]);
  });

  it("is clearly labeled unknown in the Assistant's facts", () => {
    const text = ctxOf([B]).facts.map((f) => f.text).join("\n");
    expect(text).toMatch(/"Lab report".*submission availability unknown \(check the late policy before substantial work\)/);
    expect(text).toMatch(/Lab report 0\.5h \(check the late policy first; availability unknown\)/);
  });

  it("the Assistant recommends checking first and never says late submission is possible", () => {
    const a = composeRuleAnswer(ctxOf([B]), NOW);
    expect(a.text).toMatch(/Lab report.*First check whether late submission is allowed before putting in more hours/);
    expect(a.text).not.toMatch(/late submission (is )?(definitely )?(allowed|possible)\b(?! before)/i);
    expect(a.actions.some((x) => /check late-submission policy for "Lab report"/.test(x.label))).toBe(true);
  });

  it("once reported closed: removed from planning, professor contact suggested", () => {
    const closed = setSubmissionStatus([B], "B", "closed", NOW);
    expect(buildWorkloadPlan(closed, NOW).days.flatMap((d) => d.blocks)).toEqual([]);
    const a = composeRuleAnswer(ctxOf(closed), NOW);
    expect(a.text).toMatch(/Needs attention[\s\S]*Lab report.*emailing your professor/);
    expect(a.actions.some((x) => x.kind === "draft-email" && x.to === "professor" && x.assignmentId === "B")).toBe(true);
  });
});

describe("4. deterministic prioritization", () => {
  it("a task due in 2 hours beats one that was due 3 days ago with late submission allowed", () => {
    const soon = mk("soon", "Quiz prep", 1.5);
    const late = mk("late", "Old essay", -72, { submission: "late-allowed" });
    expect(prioritize([late, soon], NOW).map((a) => a.id)).toEqual(["soon", "late"]);
  });

  it("orders tiers: <2h > <24h > late-allowed > unknown overdue > within 3 days > later", () => {
    const list = [
      mk("later", "Later", 200), mk("d72", "In 3 days", 60), mk("unk", "Unknown overdue", -10),
      mk("lateok", "Late OK", -10, { submission: "late-allowed" }), mk("d24", "Tomorrow", 20), mk("d2", "In 2h", 1),
    ];
    expect(prioritize(list, NOW).map((a) => a.id)).toEqual(["d2", "d24", "lateok", "unk", "d72", "later"]);
  });

  it("priority and workload adjust within reason, deterministically", () => {
    expect(priorityOf(mk("h", "x", 60, { priority: "high" }), NOW)!.score).toBeGreaterThan(priorityOf(mk("l", "x", 60, { priority: "low" }), NOW)!.score);
    // estimate longer than the time left → bumped
    expect(priorityOf(mk("big", "x", 3, { estimatedHours: 6 }), NOW)!.score).toBeGreaterThan(priorityOf(mk("small", "x", 3, { estimatedHours: 1 }), NOW)!.score);
    // same tier/score → earlier due date, then smaller estimate, then id
    const t1 = mk("t1", "x", 100, { estimatedHours: 3 });
    const t2 = mk("t2", "x", 100, { estimatedHours: 1 });
    expect(prioritize([t1, t2], NOW).map((a) => a.id)).toEqual(["t2", "t1"]);
    // input order never matters
    const list = [t1, t2, mk("t3", "x", 5)];
    expect(prioritize([...list].reverse(), NOW).map((a) => a.id)).toEqual(prioritize(list, NOW).map((a) => a.id));
  });

  it("completed and closed are never prioritized", () => {
    expect(prioritize(two, NOW).map((a) => a.id).sort()).toEqual(["B", "C"]);
  });

  it("planner, Assistant facts and rule answer all use the same order", () => {
    const list = seedAssignments(NOW);
    const order = prioritize(list, NOW).map((a) => a.title);
    const ranks = ctxOf(list).facts.filter((f) => /priority rank \d+/.test(f.text))
      .map((f) => ({ t: f.text.match(/"([^"]+)"/)![1], r: Number(f.text.match(/priority rank (\d+)/)![1]) }))
      .sort((x, y) => x.r - y.r).map((x) => x.t);
    expect(ranks).toEqual(order.slice(0, ranks.length));
    const firstPlanned = [...new Set(buildWorkloadPlan(list, NOW).days.flatMap((d) => d.blocks.map((b) => b.title)))];
    expect(firstPlanned[0]).toBe(order[0]);
    const bullets = composeRuleAnswer(ctxOf(list), NOW).text.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).split(" (")[0]);
    expect(bullets).toEqual(order.slice(0, bullets.length));
  });
});

describe("state changes are reflected in the next Assistant answer", () => {
  it("unknown → late-allowed → closed changes priority, plan and advice", () => {
    const s0 = [B, mk("x", "Reading", 30)];
    const s1 = setSubmissionStatus(s0, "B", "late-allowed", NOW);
    const s2 = setSubmissionStatus(s0, "B", "closed", NOW);
    expect(priorityOf(s0[0], NOW)!.tier).toBe("overdue-unknown");
    expect(priorityOf(s1[0], NOW)!.tier).toBe("late-allowed");
    expect(priorityOf(s2[0], NOW)).toBeNull();
    const hoursFor = (l: Assignment[]) => buildWorkloadPlan(l, NOW).days.flatMap((d) => d.blocks).filter((b) => b.assignmentId === "B").reduce((h, b) => h + b.hours, 0);
    expect([hoursFor(s0), hoursFor(s1), hoursFor(s2)]).toEqual([CHECK_POLICY_HOURS, 2, 0]);
    expect(composeRuleAnswer(ctxOf(s1), NOW).text).toMatch(/Lab report.*late submission allowed \(you reported\)/);
  });
});

describe("no duplicate tasks or unconfirmed actions", () => {
  it("the check-policy task needs confirmation and can't be created twice", () => {
    const act = composeRuleAnswer(ctxOf([B]), NOW).actions.find((x) => x.kind === "create-task")!;
    expect(applyAction(act, { confirmed: false, existing: [B], now: NOW })).toEqual({ ok: false, reason: "confirmation-required" });
    const r = applyAction(act, { confirmed: true, existing: [B], now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== "task-created") return;
    expect(applyAction(act, { confirmed: true, existing: [B, r.assignment], now: NOW })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("a validated Gemini answer can't change actions", async () => {
    const f = fidOf(two, "Lab report");
    const askModel = vi.fn(async (): Promise<AskModelResult> => ({ ok: true, data: { answer: `Check whether late submission is allowed for the Lab report [${f}].`, citedFacts: [f], citedSources: [], actions: [{ kind: "create-task" }] } }));
    const { answer } = await answerQuestion(Q, makeState({ assignments: two }), NOW, { aiEnabled: true, askModel });
    expect(answer.source).toBe("gemini");
    expect(answer.actions).toEqual(composeRuleAnswer(ctxOf(two), NOW).actions);
  });

  it("a full validation pass on the mocked answer agrees with the per-claim checks", () => {
    const ctx = ctxOf(two);
    const f = fidOf(two, "Essay draft");
    expect(validateAIAnswer({ answer: `Submission is closed for the Essay draft, so email your professor [${f}].`, citedFacts: [f] }, ctx, composeRuleAnswer(ctx, NOW)).ok).toBe(true);
    expect(validateAIAnswer({ answer: `Submission is closed for the Lab report [${f}].`, citedFacts: [f] }, ctx, composeRuleAnswer(ctx, NOW)).ok).toBe(false);
  });
});
