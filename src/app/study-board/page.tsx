"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Bot, Brain, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flame, Hourglass, Info, LayoutGrid, Lock, Mail, NotebookPen, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Button, Card, inputCls, PageHeader, ProgressBar, SourceLabel } from "@/components/ui";
import { askAI, useAiStatus } from "@/lib/ai-client";
import {
  addWeeks, deadlineState, formatDue, groupWeek, hasOpenWork, splitAllTasks, visibleDays, remainingLabel, startOfWeek, toLocalInputValue, weekLabel, weeklyAssignments, type DeadlineState,
} from "@/lib/deadlines";
import { useAskAssistant } from "@/lib/assistant/useAskAssistant";
import { extensionRequestEmail } from "@/lib/emails";
import { boardStatus, NOT_VERIFIED_NOTE, SUBMISSION_LABEL, type SubmissionStatus } from "@/lib/submission";
import { useCampus, useNow } from "@/lib/store";
import type { Assignment, NoteColor, Priority } from "@/lib/types";
import { buildWorkloadPlan } from "@/lib/workload";

const noteBg: Record<NoteColor, string> = {
  lavender: "bg-lavender", sage: "bg-sage", powder: "bg-powder", blush: "bg-blush", butter: "bg-butter",
};
const noteSwatch: Record<NoteColor, string> = {
  lavender: "bg-lavender-mid", sage: "bg-sage-mid", powder: "bg-powder-mid", blush: "bg-blush-mid", butter: "bg-butter-mid",
};
const prioTone = { high: "blush", medium: "butter", low: "sage" } as const;
const stateBadge: Record<DeadlineState, { tone: "blush" | "butter" | "powder" | "sage"; label: string } | null> = {
  overdue: { tone: "blush", label: "Overdue" },
  "due-2h": { tone: "blush", label: "Due < 2h" },
  "due-24h": { tone: "butter", label: "Due < 24h" },
  upcoming: null,
  done: null,
};
const tilts = ["-rotate-1", "rotate-1", "-rotate-[0.6deg]", "rotate-[0.8deg]", "rotate-0"];

type Filter = "all" | "active" | "completed";
type FormState = { id?: string; course: string; title: string; due: string; priority: Priority; color: NoteColor; estimatedHours: number; notes: string };

function StickyNote({ a, i, now, onToggle, onEdit, onDelete, onSubmission, onEmail }: {
  a: Assignment; i: number; now: Date; onToggle: () => void; onEdit: () => void; onDelete: () => void;
  onSubmission: (s: SubmissionStatus) => void; onEmail: () => void;
}) {
  const st = deadlineState(a, now);
  const bs = boardStatus(a, now);
  const badge = stateBadge[st];
  const done = a.completed;
  const closed = bs === "closed";
  const urgent = st === "due-2h" || bs === "overdue";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      whileHover={{ y: -4, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`group relative flex min-h-[230px] flex-col rounded-[1.25rem] p-5 shadow-note transition-colors duration-500 ${done ? "bg-[#e7e5e4] text-ink/55" : closed ? "bg-blush/70 note-paper" : `${noteBg[a.color]} note-paper`} ${tilts[i % tilts.length]} ${(urgent || closed) && !done ? "ring-2 ring-blush-deep/50" : ""}`}
    >
      {/* tape */}
      <span className={`absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-3deg] rounded-sm ${done ? "bg-white/60" : "bg-white/70"} shadow-sm`} />
      {urgent && !done && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-blush-deep opacity-60" />
          <span className="relative inline-flex h-4 w-4 rounded-full bg-blush-deep" />
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{a.course}</p>
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button onClick={onEdit} className="rounded-full p-1.5 hover:bg-white/60" aria-label={`Edit ${a.title}`}><Pencil size={13} /></button>
          <button onClick={onDelete} className="rounded-full p-1.5 hover:bg-white/60" aria-label={`Delete ${a.title}`}><Trash2 size={13} /></button>
        </div>
      </div>
      <h3 className="font-display mt-2 text-xl font-semibold leading-snug">{a.title}</h3>
      {a.notes && <p className="mt-1 line-clamp-2 text-xs opacity-75">{a.notes}</p>}
      <div className="mt-auto space-y-2 pt-4">
        <p className="flex items-center gap-1.5 text-xs font-medium opacity-80"><Clock size={13} /> {formatDue(a.dueDate)}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {done ? (
            <Badge tone="sage">Completed</Badge>
          ) : closed ? (
            <Badge tone="blush"><Lock size={11} /> {SUBMISSION_LABEL.closed}</Badge>
          ) : (
            <>
              <Badge tone={prioTone[a.priority]}>{a.priority} priority</Badge>
              {bs === "late-allowed" ? <Badge tone="butter"><Hourglass size={11} /> {SUBMISSION_LABEL["late-allowed"]}</Badge>
                : badge && <Badge tone={badge.tone}><AlarmClock size={11} /> {badge.label}</Badge>}
              <span className="text-[11px] font-semibold opacity-75">{remainingLabel(a, now)}</span>
            </>
          )}
        </div>
        {/* Overdue: availability unknown → ask the student, never assume */}
        {bs === "overdue" && (
          <div className="pr-12" role="group" aria-label={`Submission status for ${a.title}`}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">Deadline passed. Can you still submit?</p>
            <div className="flex flex-wrap gap-1">
              <button onClick={onToggle} className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-sage-deep hover:bg-white">I submitted it</button>
              <button onClick={() => onSubmission("late-allowed")} className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-butter-deep hover:bg-white">Late submission is allowed</button>
              <button onClick={() => onSubmission("closed")} className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-blush-deep hover:bg-white">Submission is closed</button>
            </div>
          </div>
        )}
        {bs === "late-allowed" && (
          <button onClick={() => onSubmission("unknown")} className="text-[10px] font-semibold underline opacity-75 hover:opacity-100">Change submission status</button>
        )}
        {closed && (
          <div className="flex flex-wrap gap-1 pr-12">
            <button onClick={onEmail} className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-ink/85"><Mail size={11} /> Email professor</button>
            <button onClick={() => onSubmission("late-allowed")} className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-butter-deep hover:bg-white">Late is allowed</button>
            <button onClick={() => onSubmission("unknown")} className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold hover:bg-white">Not closed (undo)</button>
          </div>
        )}
      </div>
      <button
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Mark ${a.title} as not completed` : `Mark ${a.title} as completed`}
        className={`absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${done ? "border-sage-deep bg-sage-deep text-white" : "border-ink/25 bg-white/70 text-transparent hover:border-sage-deep hover:text-sage-deep"}`}
      >
        <motion.span key={String(done)} initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
          <Check size={22} strokeWidth={3} />
        </motion.span>
      </button>
    </motion.div>
  );
}

export default function StudyBoard() {
  const { assignments, addAssignment, updateAssignment, deleteAssignment, toggleComplete, setSubmission, notify } = useCampus();
  const { celebrate, toast, openDraft } = useFeedback();
  const now = useNow(15_000);
  const ai = useAiStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"week" | "all">("week");
  const askAssistant = useAskAssistant();
  const [form, setForm] = useState<FormState | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const shownWeekStart = addWeeks(startOfWeek(now), weekOffset);
  const week = groupWeek(assignments, shownWeekStart, now);
  const passes = (a: Assignment) => (filter === "all" ? true : filter === "active" ? !a.completed : a.completed);

  const allTasks = useMemo(() => splitAllTasks(assignments), [assignments]);
  const attention = week.needsAttention.filter(passes);
  const showOpen = filter !== "completed";
  const showDone = filter !== "active";
  function changeSubmission(a: Assignment, status: SubmissionStatus) {
    setSubmission(a.id, status);
    if (status === "closed") toast("Moved to Needs attention", `${a.title}: you reported submission is closed. It is not marked completed.`, "warning");
    else if (status === "late-allowed") toast("Marked: late submission allowed", `${a.title} stays on your board until you complete it.`, "info");
    else toast("Submission status cleared", `${a.title} is back to "overdue, availability unknown".`, "info");
  }
  const emailProfessor = (a: Assignment) => openDraft({ title: "Extension request (draft)", ...extensionRequestEmail(a), source: "rule" });
  const editNote = (a: Assignment) => setForm({ id: a.id, course: a.course, title: a.title, due: toLocalInputValue(a.dueDate), priority: a.priority, color: a.color, estimatedHours: a.estimatedHours, notes: a.notes ?? "" });
  const removeNote = (a: Assignment) => { deleteAssignment(a.id); toast("Assignment deleted", a.title, "info"); };
  const renderNotes = (items: Assignment[]) => (
    <div className="grid gap-5 pt-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <AnimatePresence mode="popLayout">
        {items.map((a, i) => (
          <StickyNote key={a.id} a={a} i={i} now={now} onToggle={() => handleToggle(a)} onEdit={() => editNote(a)} onDelete={() => removeNote(a)} onSubmission={(st) => changeSubmission(a, st)} onEmail={() => emailProfessor(a)} />
        ))}
      </AnimatePresence>
    </div>
  );
  const completedSection = (items: Assignment[], scope: string) =>
    items.length > 0 && (
      <section aria-label="Completed assignments" className="rounded-3xl border border-line bg-white/50 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-line/80 pb-1.5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><CheckCircle2 size={17} className="text-sage-deep" /> Completed Assignments</h2>
          <span className="text-xs text-muted">{items.length} {scope} · each card keeps its original due date · uncheck to move it back</span>
        </div>
        {renderNotes(items)}
      </section>
    );

  const workload = useMemo(() => buildWorkloadPlan(assignments, now), [assignments, now]);

  function handleToggle(a: Assignment) {
    const nowDone = toggleComplete(a.id);
    if (!nowDone) return;
    const week = weeklyAssignments(assignments, now);
    const inWeek = week.some((w) => w.id === a.id);
    const remaining = week.filter((w) => !w.completed && w.id !== a.id).length;
    if (inWeek && remaining === 0 && week.length > 0) {
      celebrate(true);
      notify("Week complete 🎉", "Every assignment due this week is done.", "study");
    } else {
      celebrate(false);
      toast("Nice work! ✓", `${a.title} completed${inWeek ? ` · ${remaining} left this week` : ""}`, "success");
    }
  }

  function openNew() {
    const due = new Date(now.getTime() + 2 * 86_400_000);
    due.setHours(23, 59, 0, 0);
    setForm({ course: "", title: "", due: toLocalInputValue(due.toISOString()), priority: "medium", color: "lavender", estimatedHours: 2, notes: "" });
  }

  function save() {
    if (!form || !form.title.trim() || !form.course.trim() || !form.due) return;
    const dueISO = new Date(form.due).toISOString();
    const data = { course: form.course.trim(), title: form.title.trim(), dueDate: dueISO, priority: form.priority, color: form.color, estimatedHours: Number(form.estimatedHours) || 1, notes: form.notes.trim() || undefined };
    if (form.id) {
      updateAssignment(form.id, data);
      toast("Assignment updated", data.title, "info");
    } else {
      const created = addAssignment(data);
      // Workflow: new assignment -> analyze deadline -> reminder generated -> dashboard updates
      const st = deadlineState(created, new Date());
      const when = remainingLabel(created, new Date());
      const msg = st === "overdue" ? "This deadline has already passed." : st === "due-2h" ? "Due in under 2 hours — start now." : st === "due-24h" ? "Due within 24 hours — schedule focus time today." : `In-app reminders will appear at 24h and 2h before the deadline while CampusPilot is open (${when}).`;
      notify(`In-app reminder set: ${created.title}`, `${created.course} · ${formatDue(created.dueDate)}. ${msg}`, "study", `new-${created.id}`);
      toast("Assignment added · in-app reminder set", msg, st === "upcoming" ? "success" : "warning");
    }
    setForm(null);
  }

  async function askGemini() {
    setAiLoading(true);
    const text = await askAI("study-plan", "Explain this study plan to the student in 4 short bullets with one motivating line. Use the provided plan; do not add new deadlines.", {
      plan: workload.days.map((d) => ({ day: d.label, blocks: d.blocks.map((b) => `${b.title} ${b.hours}h`) })),
      warnings: workload.warnings,
    });
    setAiPlan(text ?? "Gemini is unavailable right now — showing the rule-based plan only.");
    setAiLoading(false);
  }

  const counts = { all: assignments.length, active: assignments.filter((a) => !a.completed).length, completed: assignments.filter((a) => a.completed).length };

  return (
    <div>
      <PageHeader eyebrow="Module 1" title="Smart Study Board" icon={NotebookPen} tone="butter"
        subtitle="Your week as sticky notes. Deadlines are analyzed live, with 24-hour and 2-hour warnings shown inside CampusPilot.">
        <Button variant="soft" onClick={() => setShowPlan((s) => !s)}><Brain size={16} /> {showPlan ? "Hide" : "Plan my"} study week</Button>
        <Button onClick={openNew}><Plus size={16} /> Add assignment</Button>
      </PageHeader>

      {/* Week navigation + progress */}
      <Card className="mb-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-center">
          <div>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-full border border-line bg-white p-2 hover:bg-lavender" aria-label="Previous week"><ChevronLeft size={16} /></button>
              <div className="text-center">
                <p className="font-display text-lg font-semibold leading-tight">{weekLabel(shownWeekStart)}</p>
                {week.isCurrent ? <p className="text-[11px] font-semibold text-lavender-deep">This week</p>
                  : <button onClick={() => setWeekOffset(0)} className="text-[11px] font-semibold text-lavender-deep underline">Back to this week</button>}
              </div>
              <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-full border border-line bg-white p-2 hover:bg-lavender" aria-label="Next week"><ChevronRight size={16} /></button>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-sm font-semibold">Weekly progress</p>
              <p className="font-display text-2xl font-semibold">{week.done}/{week.total}</p>
            </div>
            <ProgressBar pct={week.pct} tone="sage" className="mt-1.5" />
            <p className="mt-2 text-xs text-muted">
              {week.total === 0 ? "No assignments due this week." : week.total - week.done === 0 ? "All done this week! 🎈" : `${week.total - week.done} left${week.isCurrent ? " (incl. overdue)" : ""} · finish all for a big celebration`}
            </p>
          </div>
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Days of the week">
            {week.days.map((d, i) => {
              return (
                <a key={i} href={d.items.length ? `#day-${i}` : undefined} role="listitem" onClick={() => d.items.length && setView("week")}
                  className={`flex min-w-[64px] flex-1 flex-col items-center rounded-2xl border px-2 py-2.5 transition ${d.isToday ? "border-lavender-deep/40 bg-lavender" : "border-line bg-white/70"} ${d.items.length ? "cursor-pointer hover:bg-white" : "cursor-default"}`}>
                  <span className="text-[11px] font-semibold uppercase opacity-70">{d.date.toLocaleDateString("en-US", { weekday: "short" })}</span>
                  <span className="font-display text-xl font-semibold">{d.date.getDate()}</span>
                  <span className="mt-1 flex h-1.5 gap-0.5">
                    {d.items.map((a) => <span key={a.id} className={`h-1.5 w-1.5 rounded-full ${deadlineState(a, now) === "overdue" ? "bg-blush-deep" : "bg-butter-deep"}`} />)}
                    {Array.from({ length: d.completedCount }, (_, k) => <span key={`c${k}`} className="h-1.5 w-1.5 rounded-full bg-sage-deep" />)}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Workload plan */}
      <AnimatePresence>
        {showPlan && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
            <div className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold">Recommended study plan</h2>
                  <p className="text-xs text-muted">Shared priority order (due &lt; 2h → due &lt; 24h → late allowed → overdue/unknown → later), max 3 focus hours/day. Overdue work with unknown availability gets a short check-first block only.</p>
                </div>
                <div className="flex items-center gap-2">
                  <SourceLabel kind="rule" />
                  {ai === "gemini" && <Button variant="soft" className="!py-1.5 text-xs" onClick={askGemini} disabled={aiLoading}><Wand2 size={14} /> {aiLoading ? "Thinking…" : "Explain with Gemini"}</Button>}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {workload.days.map((d) => (
                  <div key={d.label} className="rounded-2xl border border-line bg-cream/60 p-3">
                    <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">{d.label}</p><span className="text-[11px] text-muted">{d.total}h</span></div>
                    <div className="space-y-1.5">
                      {d.blocks.length === 0 && <p className="text-xs text-muted">Free · rest or get ahead</p>}
                      {d.blocks.map((b, i) => (
                        <div key={i} className={`rounded-xl px-2.5 py-1.5 text-xs ${b.kind === "check-late-policy" ? "border border-dashed border-butter-deep/50 bg-butter/60" : b.late ? "bg-blush text-blush-deep" : "bg-white"}`}>
                          <p className="font-semibold">{b.title}</p>
                          <p className="opacity-70">{b.hours}h{b.kind === "check-late-policy" ? " · availability unknown: check the late policy first" : b.kind === "late-allowed" ? " · late allowed (you reported)" : ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {workload.warnings.length > 0 && (
                <div className="mt-3 space-y-1">{workload.warnings.map((w) => <p key={w} className="flex items-center gap-1.5 text-xs text-blush-deep"><Flame size={12} /> {w}</p>)}</div>
              )}
              {aiPlan && (
                <div className="mt-4 rounded-2xl bg-lavender/60 p-4">
                  <div className="mb-1"><SourceLabel kind="gemini" /></div>
                  <p className="whitespace-pre-line text-sm">{aiPlan}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters + view */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line bg-paper p-1" role="tablist" aria-label="Board view">
          <button role="tab" aria-selected={view === "week"} onClick={() => setView("week")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${view === "week" ? "bg-ink text-white" : "text-muted"}`}><CalendarDays size={13} /> Week</button>
          <button role="tab" aria-selected={view === "all"} onClick={() => setView("all")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${view === "all" ? "bg-ink text-white" : "text-muted"}`}><LayoutGrid size={13} /> All tasks</button>
        </div>
        {(["all", "active", "completed"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${filter === f ? "bg-ink text-white" : "border border-line bg-paper text-muted hover:text-ink"}`}>
            {f === "active" ? "Incomplete" : f} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
        <button onClick={() => askAssistant("What should I work on this week?")} className="inline-flex items-center gap-1.5 rounded-full bg-lavender px-3 py-1.5 text-xs font-semibold text-lavender-deep hover:bg-lavender-mid">
          <Bot size={13} /> Ask what to focus on
        </button>
        <span className="ml-auto"><SourceLabel kind="demo" /></span>
      </div>

      {attention.length > 0 && (
        <section aria-label="Needs attention" className="mb-6 rounded-3xl border-2 border-blush-mid bg-blush/25 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-blush-deep"><Lock size={16} /> Needs attention</h2>
            <span className="text-xs text-muted">{attention.length} assignment{attention.length > 1 ? "s" : ""} you marked as submission closed. Not counted as completed.</span>
          </div>
          <p className="mb-2 flex items-start gap-1.5 text-[11px] text-muted"><Info size={12} className="mt-0.5 shrink-0" /> {NOT_VERIFIED_NOTE}</p>
          {renderNotes(attention)}
        </section>
      )}

      {view === "week" ? (
        <div className="space-y-6">
          {showOpen && week.carriedOver.length > 0 && (
            <section aria-label="Overdue from earlier weeks" className="rounded-3xl border border-blush-mid bg-blush/30 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blush-deep"><AlarmClock size={15} /> Overdue from earlier weeks</h2>
              {renderNotes(week.carriedOver)}
            </section>
          )}
          {/* Only weekdays with unfinished work are shown. Completed notes live once, at the very bottom. */}
          {showOpen && visibleDays(week).map((d) => (
            <section key={d.index} id={`day-${d.index}`} aria-label={d.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} className="scroll-mt-24">
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="font-display text-lg font-semibold">{d.date.toLocaleDateString("en-US", { weekday: "long" })}</h2>
                <span className="text-sm text-muted">{d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                {d.isToday && <Badge tone="lavender">Today</Badge>}
              </div>
              {renderNotes(d.items)}
            </section>
          ))}
          {showOpen && !hasOpenWork(week) && (
            <div className="flex items-center gap-3 rounded-3xl border border-sage-mid bg-sage/50 px-5 py-4">
              <span className="text-2xl" aria-hidden>{week.completed.length ? "🎉" : "🌿"}</span>
              <div>
                <p className="font-display text-lg font-semibold">{week.completed.length ? "All caught up this week" : "Nothing due this week"}</p>
                <p className="text-xs text-muted">{week.completed.length ? `Every assignment is done. Your completed notes are below.` : "Enjoy the breathing room, or get ahead on next week."}</p>
              </div>
            </div>
          )}
          {showDone && completedSection(week.completed, "this week")}
          {!showOpen && week.completed.length === 0 && <p className="text-center text-sm text-muted">No completed assignments this week yet.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {showOpen && (
            <div className="grid gap-6 pt-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {allTasks.open.map((a, i) => (
                  <StickyNote key={a.id} a={a} i={i} now={now} onToggle={() => handleToggle(a)} onEdit={() => editNote(a)} onDelete={() => removeNote(a)} onSubmission={(st) => changeSubmission(a, st)} onEmail={() => emailProfessor(a)} />
                ))}
              </AnimatePresence>
              <motion.button layout onClick={openNew}
                className="flex min-h-[230px] flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed border-line text-muted transition hover:border-lavender-deep hover:bg-lavender/40 hover:text-lavender-deep">
                <Plus size={28} />
                <span className="text-sm font-semibold">New sticky note</span>
              </motion.button>
            </div>
          )}
          {showDone && completedSection(allTasks.completed, "in total")}
          {!showOpen && allTasks.completed.length === 0 && <p className="text-center text-sm text-muted">No completed assignments yet.</p>}
        </div>
      )}

      {/* Form modal */}
      <AnimatePresence>
        {form && (
          <motion.div className="fixed inset-0 z-[65] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setForm(null)}>
            <motion.form initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(); }}
              className={`w-full max-w-lg rounded-[1.75rem] p-6 shadow-lift ${noteBg[form.color]}`} role="dialog" aria-label={form.id ? "Edit assignment" : "Add assignment"}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold">{form.id ? "Edit assignment" : "New assignment"}</h2>
                <button type="button" onClick={() => setForm(null)} className="rounded-full p-2 hover:bg-white/60" aria-label="Close"><X size={18} /></button>
              </div>
              <div className="grid gap-3">
                <label className="text-xs font-semibold">Course
                  <input required className={`${inputCls} mt-1`} placeholder="e.g. SWE 340 · HCI" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
                </label>
                <label className="text-xs font-semibold">Assignment title
                  <input required className={`${inputCls} mt-1`} placeholder="e.g. Final project proposal" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold">Due date & time
                    <input required type="datetime-local" className={`${inputCls} mt-1`} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
                  </label>
                  <label className="text-xs font-semibold">Estimated hours
                    <input type="number" min={0.5} step={0.5} className={`${inputCls} mt-1`} value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: Number(e.target.value) })} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold">Priority
                    <select className={`${inputCls} mt-1`} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                      <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                    </select>
                  </label>
                  <div className="text-xs font-semibold">Note color
                    <div className="mt-2 flex gap-2">
                      {(Object.keys(noteBg) as NoteColor[]).map((c) => (
                        <button type="button" key={c} onClick={() => setForm({ ...form, color: c })} aria-label={c}
                          className={`h-8 w-8 rounded-full border-2 ${noteSwatch[c]} ${form.color === c ? "border-ink" : "border-white"}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <label className="text-xs font-semibold">Notes (optional)
                  <textarea className={`${inputCls} mt-1 min-h-[70px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" className="bg-white/50" onClick={() => setForm(null)}>Cancel</Button>
                <Button type="submit">{form.id ? "Save changes" : "Add to board"}</Button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
