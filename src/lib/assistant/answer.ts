// Deterministic answer composer. Used as the fallback when Gemini is unavailable or fails validation,
// and always as the source of actions. Every number here comes from the context's deterministic facts.
import { deadlineState } from "../deadlines";
import { fmtDate } from "../immigration";
import type { OfficialSource } from "../types";
import { dueIn, makeTaskAction, type ProposedAction } from "./actions";
import type { AssistantContext, AssistantModule, Intent } from "./context";

export interface AssistantAnswer {
  source: "gemini" | "rule";
  text: string;
  citedFacts: string[]; // fact ids actually used
  citedSources: string[]; // passage ids actually used
  modules: AssistantModule[];
  officialSources: OfficialSource[];
  actions: ProposedAction[];
  notice?: string; // e.g. why an AI answer was withheld
  model?: string; // Gemini model that produced the wording (only when source === "gemini")
}

interface Section { text: string[]; facts: string[]; sources: string[]; actions: ProposedAction[] }
const empty = (): Section => ({ text: [], facts: [], sources: [], actions: [] });

const findFact = (ctx: AssistantContext, re: RegExp) => ctx.facts.filter((f) => re.test(f.text)).map((f) => f.id);

function gradInternship(ctx: AssistantContext, now: Date): Section {
  const s = empty();
  const d = ctx.data;
  const summer = d.profile.availability.find((a) => a.season === "Summer");
  const planValid = d.validation.prereqIssues.length === 0 && d.validation.loadIssues.length === 0;
  const fullTime = d.scenarios.filter((sc) => sc.onTime && sc.summers.some((x) => x.level === "full-time"));
  const partTime = d.scenarios.filter((sc) => sc.onTime && sc.summers.some((x) => x.level === "part-time"));
  const currentPartTime = planValid && d.profile.graduationOnTrack && !!summer && summer.level !== "limited";
  s.text.push(
    fullTime.length
      ? `**Short answer: likely yes.** The ${fullTime[0].name} scenario meets ${d.profile.targetGraduation} and leaves a summer free.`
      : partTime.length || currentPartTime
        ? `**Short answer: possibly, part-time only.** No generated plan meets ${d.profile.targetGraduation} with a completely free summer.`
        : `**Short answer: not with the generated plans.** Meeting ${d.profile.targetGraduation} needs summer courses, so a summer internship would be limited unless your advisor finds another sequence.`,
  );
  s.text.push(`Your current plan projects **${d.profile.projectedGraduation}** (target ${d.profile.targetGraduation})${planValid ? "." : ", but it has a conflict, so it isn't achievable as written."}`);
  if (summer) s.text.push(`In that plan, ${summer.label} has ${summer.credits} credits planned, so internship availability is **${summer.level}** (a planning heuristic, not a rule).`);
  else s.text.push("Your current plan has no summer term before graduation.");
  const both = d.scenarios.filter((sc) => sc.onTime && sc.summers.some((x) => x.level === "full-time"));
  d.scenarios.forEach((sc) => s.text.push(`- ${sc.name}: ${sc.projected}; ${sc.summers.map((x) => `${x.label} ${x.credits} cr (${x.level})`).join(", ") || "no summer before graduation"}.`));
  if (!both.length) s.text.push("The trade-off is a part-time or limited summer internship, or graduating later. Your advisor can confirm options such as course substitutions or overloads.");
  if (d.validation.prereqIssues.length) s.text.push(`First fix: ${d.validation.prereqIssues[0].message}`);
  if (d.profile.isF1) {
    s.text.push("As an F-1 student, a summer internship would normally require CPT, which your DSO authorizes before you start. This tool doesn't decide eligibility.");
    s.sources.push(...ctx.passages.slice(0, 2).map((p) => p.id));
    s.actions.push({ id: "dso-email", kind: "draft-email", label: "Draft DSO email about CPT", mutates: false, to: "dso" });
    s.actions.push(makeTaskAction("task-dso-cpt", "Add task: ask DSO about summer CPT timing", "Ask DSO about CPT for a summer internship", "Ask about curriculum fit, timeline and required documents.", 0.5, dueIn(now, 5), "high"));
  }
  s.facts.push(...findFact(ctx, /Current plan projects|Target graduation|scenario projects|Current plan, Summer|Prerequisite conflict|Student status: F-1/));
  s.actions.push({ id: "advisor-email", kind: "draft-email", label: "Draft advisor email", mutates: false, to: "advisor" });
  s.actions.push({ id: "open-grad", kind: "open", label: "Compare scenarios", mutates: false, href: "/graduation" });
  return s;
}

function nextSemester(ctx: AssistantContext, now: Date): Section {
  const s = empty();
  const d = ctx.data;
  if (!d.nextTerm) {
    s.text.push("There are no planned future terms. All required courses appear to be complete or unscheduled.");
    return s;
  }
  s.text.push(`For **${d.nextTerm.label}**, prioritize courses that unblock the most later courses:`);
  d.nextTermCourses.forEach((c, i) =>
    s.text.push(`${i + 1}. ${c.code} ${c.title}${c.blockedBy.length ? ` (blocked: take ${c.blockedBy.join(", ")} first)` : ""}: unlocks ${c.unlocks.length ? c.unlocks.join(", ") : "nothing directly"}; prerequisite chain of ${c.depth} term(s).`),
  );
  if (d.validation.prereqIssues.length) s.text.push(`Fix before registering: ${d.validation.prereqIssues.map((x) => x.message).join(" ")}`);
  s.facts.push(...findFact(ctx, /Next planned term|unlocks|Prerequisite conflict/));
  const top = d.nextTermCourses.find((c) => !c.blockedBy.length);
  if (top) s.actions.push(makeTaskAction("task-register", `Add task: confirm ${top.code} registration`, `Confirm ${top.code} ${top.title} registration for ${d.nextTerm.label}`, "Check section availability and confirm the sequence with your advisor.", 0.5, dueIn(now, 7)));
  s.actions.push({ id: "advisor-email", kind: "draft-email", label: "Draft advisor email", mutates: false, to: "advisor" });
  s.actions.push({ id: "open-grad", kind: "open", label: "Open Graduation Planner", mutates: false, href: "/graduation" });
  return s;
}

function skills(ctx: AssistantContext, now: Date): Section {
  const s = empty();
  const d = ctx.data;
  s.text.push("Your top (fictional demo) matches and their deterministic scores:");
  d.topMatches.forEach(({ o, m }) => s.text.push(`- ${o.role} at ${o.company}: ${m.score}%. Missing: ${[...m.missingRequired, ...m.missingPreferred].join(", ") || "none"}.`));
  if (d.gaps.length) {
    s.text.push("Skills to improve, most frequent gaps first:");
    d.gaps.forEach((g) => s.text.push(`- **${g.skill}**${
      !g.course ? ": not covered by a planned course. Build one small public project."
        : g.course.when === "completed" ? `: you completed ${g.course.code}, which covers it. If you can show it with a project, add it to your profile skills.`
        : `: covered in ${g.course.code} (${g.course.when}). Build a small project before then to show it early.`}`));
    const g = d.gaps.find((x) => x.course?.when !== "completed") ?? d.gaps[0];
    s.actions.push(makeTaskAction(`task-skill-${g.skill}`, `Add task: practice ${g.skill}`, `Practice ${g.skill}: small portfolio project`, `Closes the most common gap across your top matches.${g.course ? ` Related course: ${g.course.code}.` : ""}`, 3, dueIn(now, 7)));
  } else s.text.push("You already list every skill your top matches ask for.");
  s.facts.push(...findFact(ctx, /^Match:|Skill gap|Profile skills/));
  s.actions.push({ id: "open-career", kind: "open", label: "Open Career Navigator", mutates: false, href: "/career" });
  return s;
}

function thisWeek(ctx: AssistantContext, now: Date): Section {
  const s = empty();
  const d = ctx.data;
  const urgent = d.open.filter((a) => ["overdue", "due-2h", "due-24h"].includes(deadlineState(a, now)));
  if (!d.open.length) s.text.push("All your assignments are complete.");
  else {
    s.text.push(urgent.length ? `Start with the ${urgent.length} urgent item(s):` : "Nothing is urgent. Here's what's next:");
    (urgent.length ? urgent : d.open.slice(0, 3)).forEach((a) => {
      const st = deadlineState(a, now);
      s.text.push(`- ${a.title} (${a.course}): ${st === "overdue" ? "overdue" : st === "due-2h" ? "due in under 2 hours" : st === "due-24h" ? "due within 24 hours" : "upcoming"}.`);
    });
  }
  const today = d.workload.days[0];
  if (today?.blocks.length) s.text.push(`Suggested focus today: ${today.blocks.map((b) => `${b.title} (${b.hours}h)`).join(", ")}.`);
  d.criticalRecs.filter((r) => r.module !== "study").forEach((r) => s.text.push(`Also: ${r.title}.`));
  const overdue = d.open.find((a) => deadlineState(a, now) === "overdue");
  if (overdue) s.actions.push(makeTaskAction(`task-email-${overdue.id}`, `Add task: email instructor about "${overdue.title}"`, `Email instructor about overdue "${overdue.title}"`, `${overdue.course}. Ask about late submission options.`, 0.5, new Date(now.getTime() + 4 * 3600_000), "high"));
  s.facts.push(...findFact(ctx, /This week|Assignment "|Suggested focus|Workload warning|Critical alert/));
  s.actions.push({ id: "open-study", kind: "open", label: "Open Study Board", mutates: false, href: "/study-board" });
  return s;
}

function advisorDso(ctx: AssistantContext, now: Date): Section {
  const s = empty();
  const d = ctx.data;
  const adv: string[] = [];
  d.validation.prereqIssues.forEach((i) => adv.push(`How should I re-sequence? ${i.message}`));
  d.validation.loadIssues.forEach((l) => adv.push(`Is this load realistic or does it need approval? ${l.message}`));
  if (d.profile.projectedGraduation !== d.profile.targetGraduation) adv.push(`My plan projects ${d.profile.projectedGraduation}, not ${d.profile.targetGraduation}. What options keep me on track?`);
  adv.push("Which summer courses are offered, and could they shorten my path?");
  s.text.push("**For your academic advisor:**", ...adv.map((q) => `- ${q}`));
  if (d.profile.isF1) {
    const dso: string[] = [];
    if (d.i20Mismatch) dso.push("My plan ends after my I-20 program end date. What's the program-extension process and deadline?");
    dso.push("Am I eligible for CPT for a summer internship, and how does it fit my curriculum?");
    const opt = d.milestones.find((m) => m.id === "opt-open");
    if (opt?.date) dso.push(`My OPT filing window opens ${fmtDate(opt.date)}. When should I request the OPT recommendation?`);
    if (d.profile.intl.stemInterest) dso.push("Is my degree's CIP code on the DHS STEM Designated Degree Program List?");
    s.text.push("**For your DSO** (they decide eligibility; this tool does not):", ...dso.map((q) => `- ${q}`));
    s.sources.push(...ctx.passages.slice(0, 2).map((p) => p.id));
    s.actions.push({ id: "dso-email", kind: "draft-email", label: "Draft DSO email", mutates: false, to: "dso" });
  }
  s.facts.push(...findFact(ctx, /Prerequisite conflict|Overload|Current plan projects|I-20|OPT filing window opens|Student status/));
  s.actions.unshift({ id: "advisor-email", kind: "draft-email", label: "Draft advisor email", mutates: false, to: "advisor" });
  s.actions.push(makeTaskAction("task-book-advisor", "Add task: book advisor meeting", "Book a meeting with my academic advisor", "Bring the questions CampusPilot listed.", 0.5, dueIn(now, 3)));
  return s;
}

function immigration(ctx: AssistantContext): Section {
  const s = empty();
  const d = ctx.data;
  if (!d.profile.isF1) {
    s.text.push(`Your profile status is "${d.profile.intl.status}". F-1 timing rules don't apply. Please confirm your status with your international student office.`);
    s.facts.push(...findFact(ctx, /Student status/));
    return s;
  }
  if (ctx.passages.length) {
    s.text.push("From the curated official-source library:");
    ctx.passages.slice(0, 3).forEach((p) => s.text.push(`- ${p.text} [${p.id}]`));
    s.sources.push(...ctx.passages.slice(0, 3).map((p) => p.id));
  } else s.text.push("I couldn't find this in the curated official-source library, so I won't guess. Please ask your DSO.");
  const next = d.milestones.filter((m) => m.date && m.id !== "cpt-earliest").slice(0, 2);
  if (next.length) s.text.push("Your planning dates:", ...next.map((m) => `- ${m.title}: ${fmtDate(m.date!)} (${m.kind === "verified-rule" ? "cited rule" : "guidance"})`));
  s.text.push("This is general information, not legal advice. Your DSO and USCIS make eligibility and authorization decisions.");
  s.facts.push(...findFact(ctx, /Student status|I-20|filing window|Program end/));
  s.actions.push({ id: "dso-email", kind: "draft-email", label: "Draft DSO email", mutates: false, to: "dso" });
  s.actions.push({ id: "open-intl", kind: "open", label: "Open International Advisor", mutates: false, href: "/international" });
  return s;
}

function simple(ctx: AssistantContext, mod: AssistantModule, now: Date): Section {
  if (mod === "graduation") {
    const s = empty();
    const d = ctx.data;
    s.text.push(`Projected graduation: **${d.profile.projectedGraduation}** (target ${d.profile.targetGraduation}).`);
    s.text.push(d.validation.prereqIssues.length ? `Prerequisite conflict: ${d.validation.prereqIssues[0].message}` : "No prerequisite conflicts detected.");
    s.facts.push(...findFact(ctx, /Credits:|Current plan projects|Prerequisite conflict|Overload/));
    s.actions.push({ id: "open-grad", kind: "open", label: "Open Graduation Planner", mutates: false, href: "/graduation" });
    return s;
  }
  if (mod === "career") return skills(ctx, now);
  return thisWeek(ctx, now);
}

function overview(ctx: AssistantContext, now: Date): Section {
  const s = thisWeek(ctx, now);
  const d = ctx.data;
  s.text.unshift("Here's your snapshot across all modules:");
  s.text.push(`Graduation: projected ${d.profile.projectedGraduation}${d.validation.prereqIssues.length ? `, with ${d.validation.prereqIssues.length} prerequisite conflict(s)` : ""}.`);
  if (d.topMatches[0]) s.text.push(`Career: top match ${d.topMatches[0].o.role} (${d.topMatches[0].m.score}%).`);
  if (d.profile.isF1 && d.i20Mismatch) s.text.push("International: your plan ends after your I-20 date. Talk to your DSO.");
  s.text.push("Ask me about graduation timing, next semester, skills, this week, or questions for your advisor or DSO.");
  s.facts.push(...findFact(ctx, /Current plan projects|^Match:|I-20/));
  return s;
}

const COMPOSERS: Partial<Record<Intent, (ctx: AssistantContext, now: Date) => Section>> = {
  "grad-internship": gradInternship,
  "next-semester": nextSemester,
  skills,
  "this-week": thisWeek,
  "advisor-dso": advisorDso,
  immigration: (ctx) => immigration(ctx),
  overview,
};

export function composeRuleAnswer(ctx: AssistantContext, now: Date): AssistantAnswer {
  const sections = ctx.intents.map((i) => (COMPOSERS[i] ? COMPOSERS[i]!(ctx, now) : simple(ctx, i as AssistantModule, now)));
  const uniq = <T,>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];
  const facts = [...new Set(sections.flatMap((s) => s.facts))];
  const sources = [...new Set(sections.flatMap((s) => s.sources))];
  return {
    source: "rule",
    text: sections.map((s) => s.text.join("\n")).join("\n\n"),
    citedFacts: facts,
    citedSources: sources,
    modules: ctx.modules,
    officialSources: ctx.officialSources,
    actions: uniq(sections.flatMap((s) => s.actions), (a) => a.id).slice(0, 5),
  };
}
