"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Bot, Briefcase, CalendarPlus, Check, ChevronDown, ExternalLink, Globe2, GraduationCap, Info, Lock, Mail, NotebookPen, Send, ShieldCheck, Sparkles, User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { RecommendationList } from "@/components/RecommendationList";
import { Badge, Button, Card, inputCls, PageHeader, SourceLabel, toneBg, type Tone } from "@/components/ui";
import { askAIDetailed, useAiInfo, useAiStatus } from "@/lib/ai-client";
import { answerQuestion, applyAction, type AssistantAnswer, type AssistantModule, type ProposedAction } from "@/lib/assistant";
import type { Fact } from "@/lib/assistant/context";
import { PENDING_QUESTION_KEY } from "@/lib/assistant/handoff";
import { formatDue, toLocalInputValue } from "@/lib/deadlines";
import { advisorEmail, dsoEmail } from "@/lib/emails";
import { validatePlan } from "@/lib/graduation";
import { buildRecommendations } from "@/lib/recommendations";
import { useCampus, useNow } from "@/lib/store";

interface BotMsg { id: number; role: "bot"; answer: AssistantAnswer; facts: Fact[] }
interface UserMsg { id: number; role: "user"; text: string }
type Msg = BotMsg | UserMsg;

const SUGGESTIONS = [
  "Can I graduate by May 2028 and still complete a summer internship?",
  "Which courses should I prioritize next semester?",
  "What skills should I improve for my top internship matches?",
  "What should I work on this week?",
  "What should I ask my academic advisor or DSO?",
];

const MODULE_META: Record<AssistantModule, { label: string; icon: typeof Bot; tone: Tone }> = {
  study: { label: "Study Board", icon: NotebookPen, tone: "butter" },
  graduation: { label: "Graduation Planner", icon: GraduationCap, tone: "sage" },
  international: { label: "International Advisor", icon: Globe2, tone: "powder" },
  career: { label: "Career Navigator", icon: Briefcase, tone: "blush" },
};

/** Minimal formatter: **bold**, "- " bullets, and [F#]/[S#] citations as chips. No HTML injection. */
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").filter((l) => l.trim()).map((line, i) => {
        const bullet = /^\s*-\s+/.test(line);
        const parts = line.replace(/^\s*-\s+/, "").split(/(\*\*[^*]+\*\*|\[\s*[FS]\d+(?:\s*,\s*[FS]\d+)*\s*\])/g);
        return (
          <p key={i} className={bullet ? "flex gap-2 pl-1" : ""}>
            {bullet && <span className="text-lavender-deep">•</span>}
            <span>
              {parts.map((p, j) =>
                /^\*\*.+\*\*$/.test(p) ? <strong key={j}>{p.slice(2, -2)}</strong>
                  : /^\[\s*[FS]\d+(?:\s*,\s*[FS]\d+)*\s*\]$/.test(p) ? <sup key={j} className="ml-0.5 rounded bg-lavender px-1 text-[9px] font-bold text-lavender-deep">{p.replace(/[[\]\s]/g, "").replace(/,/g, " · ")}</sup>
                  : <span key={j}>{p}</span>,
              )}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function ActionButton({ action, onRun, done }: { action: ProposedAction; onRun: () => void; done: boolean }) {
  const Icon = action.kind === "create-task" ? CalendarPlus : action.kind === "draft-email" ? Mail : ArrowRight;
  return (
    <button onClick={onRun} disabled={done}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-default ${done ? "bg-sage text-sage-deep" : action.kind === "create-task" ? "bg-butter text-butter-deep hover:brightness-95" : "bg-lavender text-lavender-deep hover:bg-lavender-mid"}`}>
      {done ? <Check size={13} /> : <Icon size={13} />} {done ? "Added to Study Board" : action.label}
      {action.mutates && !done && <span className="rounded-full bg-white/70 px-1.5 text-[9px] uppercase tracking-wide">confirm</span>}
    </button>
  );
}

function AnswerCard({ m }: { m: BotMsg }) {
  const router = useRouter();
  const { plan, intl, assignments, addAssignment, notify } = useCampus();
  const { openDraft, toast } = useFeedback();
  const [showFacts, setShowFacts] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [pending, setPending] = useState<{ action: Extract<ProposedAction, { kind: "create-task" }>; due: string } | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const a = m.answer;
  const cited = m.facts.filter((f) => a.citedFacts.includes(f.id));

  function run(action: ProposedAction) {
    if (action.kind === "open") {
      if (applyAction(action, { confirmed: false, existing: assignments, now: new Date() }).ok) router.push(action.href);
    } else if (action.kind === "draft-email") {
      const v = validatePlan(plan);
      const e = action.to === "advisor" ? advisorEmail(v) : dsoEmail(intl, v.projectedTerm?.id);
      openDraft({ title: action.to === "advisor" ? "Academic advisor email" : "DSO email draft", ...e, source: "rule" });
    } else {
      // Mutating action: never executed directly — open the confirmation step first.
      setPending({ action, due: toLocalInputValue(action.task.dueDate) });
    }
  }

  function confirm() {
    if (!pending) return;
    const res = applyAction(pending.action, { confirmed: true, existing: assignments, now: new Date(), dueOverride: new Date(pending.due).toISOString() });
    if (!res.ok) {
      const why = { duplicate: "That task is already on your Study Board.", "past-due-date": "Pick a due date in the future.", "confirmation-required": "Confirmation required.", "invalid-action": "This action is invalid.", "disallowed-link": "Link not allowed." }[res.reason];
      toast("Task not added", why, "warning");
      return;
    }
    if (res.kind !== "task-created") return;
    const { id: _id, completed: _c, ...task } = res.assignment;
    void _id; void _c;
    const created = addAssignment(task);
    notify(`Assistant task added: ${created.title}`, `Due ${formatDue(created.dueDate)}. In-app reminders appear at 24h and 2h while CampusPilot is open.`, "assistant", `assistant-${created.id}`);
    toast("Added to Smart Study Board", created.title, "success");
    setDone((d) => [...d, pending.action.id]);
    setPending(null);
  }

  return (
    <div className="min-w-0 flex-1 rounded-3xl rounded-tl-md border border-line bg-cream/70 px-4 py-3 text-sm leading-relaxed">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {a.source === "gemini"
          ? <Badge tone="lavender"><ShieldCheck size={11} /> Generated by Gemini{a.model ? ` (${a.model})` : ""} · verified against your data</Badge>
          : <SourceLabel kind="rule" />}
      </div>
      {a.notice && <p className="mb-2 flex gap-1.5 rounded-xl bg-butter/70 px-2.5 py-1.5 text-[11px]"><Info size={13} className="mt-0.5 shrink-0" /> {a.notice}</p>}
      <RichText text={a.text} />

      {/* Provenance */}
      <div className="mt-3 space-y-2 border-t border-line/80 pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Based on</span>
          {a.modules.map((mod) => {
            const meta = MODULE_META[mod];
            return <span key={mod} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneBg[meta.tone]}`}><meta.icon size={10} /> {meta.label}</span>;
          })}
        </div>
        {a.officialSources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setShowSources((x) => !x)} aria-expanded={showSources} className="inline-flex items-center gap-1 text-[11px] font-semibold text-powder-deep">
              <ChevronDown size={12} className={`transition ${showSources ? "rotate-180" : ""}`} /> {a.officialSources.length} official source{a.officialSources.length > 1 ? "s" : ""}
            </button>
            {showSources && a.officialSources.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-powder-deep hover:underline">
                {s.publisher}: {s.title.length > 34 ? s.title.slice(0, 32) + "…" : s.title} <ExternalLink size={9} />
              </a>
            ))}
          </div>
        )}
        {cited.length > 0 && (
          <div>
            <button onClick={() => setShowFacts((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-lavender-deep" aria-expanded={showFacts}>
              <ChevronDown size={12} className={`transition ${showFacts ? "rotate-180" : ""}`} /> {cited.length} deterministic fact{cited.length > 1 ? "s" : ""} used
            </button>
            <AnimatePresence>
              {showFacts && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-1.5 space-y-1 overflow-hidden">
                  {cited.map((f) => (
                    <li key={f.id} className="flex gap-2 rounded-xl bg-white/80 px-2.5 py-1.5 text-[11px]">
                      <span className={`h-fit shrink-0 rounded px-1 font-bold ${toneBg[MODULE_META[f.module].tone]}`}>{f.id}</span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Actions */}
      {a.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.actions.map((ac) => <ActionButton key={ac.id} action={ac} done={done.includes(ac.id)} onRun={() => run(ac)} />)}
        </div>
      )}
      <AnimatePresence>
        {pending && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alertdialog" aria-label="Confirm Study Board task"
            className="mt-3 rounded-2xl border-2 border-butter-mid bg-butter/60 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Lock size={13} /> Add this task to your Study Board?</p>
            <p className="mt-1 text-xs"><b>{pending.action.task.title}</b> · {pending.action.task.estimatedHours}h</p>
            {pending.action.task.notes && <p className="text-[11px] text-ink/70">{pending.action.task.notes}</p>}
            <label className="mt-2 block text-[11px] font-semibold">Due
              <input type="datetime-local" className={`${inputCls} mt-1 !py-1.5`} value={pending.due} onChange={(e) => setPending({ ...pending, due: e.target.value })} />
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" className="!py-1 text-xs" onClick={() => setPending(null)}>Cancel</Button>
              <Button className="!py-1 text-xs" onClick={confirm} disabled={!pending.due}>Confirm & add</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Assistant() {
  const state = useCampus();
  const now = useNow();
  const ai = useAiStatus();
  const aiInfo = useAiInfo();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const recs = buildRecommendations(state, now);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim().slice(0, 500);
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: q }]);
    setBusy(true);
    const { answer, ctx } = await answerQuestion(q, state, new Date(), { aiEnabled: ai === "gemini", askModel: askAIDetailed });
    if (answer.source === "rule" && !answer.notice) await new Promise((r) => setTimeout(r, 350));
    setMsgs((m) => [...m, { id: Date.now() + 1, role: "bot", answer, facts: ctx.facts }]);
    setBusy(false);
  }

  // Questions handed over from the dashboard (sessionStorage, so they never appear in the URL).
  useEffect(() => {
    if (started.current || ai === "loading") return;
    started.current = true;
    try {
      const q = sessionStorage.getItem(PENDING_QUESTION_KEY);
      if (q) { sessionStorage.removeItem(PENDING_QUESTION_KEY); void send(q); }
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai]);

  return (
    <div>
      <PageHeader eyebrow="Module 5" title="CampusPilot Assistant" icon={Bot} tone="lavender"
        subtitle="One companion across all your modules. Credits, dates and scores are always calculated by CampusPilot; Gemini only phrases the answer, and only after it passes verification.">
        {ai === "gemini"
          ? <Badge tone="lavender"><Sparkles size={11} /> Gemini free tier · {aiInfo?.model}</Badge>
          : <Badge tone="neutral">{aiInfo && aiInfo.hasKey && !aiInfo.modelAllowed ? "AI off: model not on free-tier allowlist" : "Rule-based mode (Gemini not configured)"}</Badge>}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="flex h-[calc(100dvh-230px)] min-h-[520px] min-w-0 flex-col !p-0 xl:h-[min(76vh,760px)]">
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4 md:p-5" aria-live="polite">
            {msgs.length === 0 && (
              <div className="mx-auto max-w-xl py-6 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-lavender-mid via-powder-mid to-blush-mid"><Sparkles size={24} /></span>
                <h2 className="font-display mt-3 text-2xl font-semibold">How can I help, Alex?</h2>
                <p className="mt-1 text-sm text-muted">Ask about graduation timing, next semester, skills, this week, or what to ask your advisor or DSO.</p>
                <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-2xl border border-line bg-white/80 px-3 py-2.5 text-xs font-semibold transition hover:border-lavender-deep hover:bg-lavender/50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {msgs.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${m.role === "user" ? "bg-blush text-blush-deep" : "bg-lavender text-lavender-deep"}`}>
                    {m.role === "user" ? <User size={15} /> : <Bot size={15} />}
                  </span>
                  {m.role === "user"
                    ? <div className="max-w-[85%] rounded-3xl rounded-tr-md bg-ink px-4 py-2.5 text-sm text-white">{m.text}</div>
                    : <AnswerCard m={m} />}
                </motion.div>
              ))}
              {busy && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-lavender text-lavender-deep"><Bot size={15} /></span>
                  <div className="flex items-center gap-2 rounded-3xl border border-line bg-cream/70 px-4 py-3" aria-label="Thinking" role="status">
                    <span className="flex gap-1">{[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-lavender-deep" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />)}</span>
                    <span className="text-xs text-muted">{ai === "gemini" ? "Checking your modules, then asking Gemini…" : "Checking your modules…"}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
          <div className="border-t border-line p-3 md:p-4">
            {msgs.length > 0 && (
              <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy} className="shrink-0 rounded-full bg-lavender/70 px-3 py-1 text-[11px] font-semibold text-lavender-deep transition hover:bg-lavender-mid disabled:opacity-50">{s}</button>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask CampusPilot anything about your plan…"
                className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-lavender-deep focus:ring-4 focus:ring-lavender" aria-label="Message" />
              <button type="submit" disabled={busy || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-ink/85 disabled:opacity-40" aria-label="Send"><Send size={16} /></button>
            </form>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted">
              <Lock size={10} /> {ai === "gemini" ? "Only the numbered facts relevant to your question are sent to Gemini. Your name, notes and other data are not." : "Gemini isn't configured. Answers are rule-based and nothing leaves your browser."} Nothing changes without your confirmation.
            </p>
          </div>
        </Card>

        <Card className="h-fit">
          <div className="mb-3 flex items-center gap-2"><Sparkles size={16} className="text-lavender-deep" /><h2 className="font-display text-xl font-semibold">Automation feed</h2></div>
          <p className="mb-3 text-xs text-muted">Live cross-module alerts. Each one updates the moment you change a module.</p>
          <RecommendationList recs={recs} limit={6} />
        </Card>
      </div>
    </div>
  );
}
