"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Brain, Check, Clock, Pencil, Plus, Trash2, Wand2, X, NotebookPen, Flame } from "lucide-react";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Button, Card, inputCls, PageHeader, ProgressBar, SourceLabel } from "@/components/ui";
import { askAI, useAiStatus } from "@/lib/ai-client";
import {
  deadlineState, formatDue, remainingLabel, startOfWeek, toLocalInputValue, weeklyAssignments, weeklyProgress, type DeadlineState,
} from "@/lib/deadlines";
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

function StickyNote({ a, i, now, onToggle, onEdit, onDelete }: {
  a: Assignment; i: number; now: Date; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const st = deadlineState(a, now);
  const badge = stateBadge[st];
  const done = a.completed;
  const urgent = st === "due-2h" || st === "overdue";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      whileHover={{ y: -4, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`group relative flex min-h-[230px] flex-col rounded-[1.25rem] p-5 shadow-note transition-colors duration-500 ${done ? "bg-[#e7e5e4] text-ink/55" : `${noteBg[a.color]} note-paper`} ${tilts[i % tilts.length]} ${urgent && !done ? "ring-2 ring-blush-deep/50" : ""}`}
    >
      {/* tape */}
      <span className={`absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-3deg] rounded-sm ${done ? "bg-white/60" : "bg-white/70"} shadow-sm`} />
      {urgent && !done && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blush-deep opacity-60" />
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
          ) : (
            <>
              <Badge tone={prioTone[a.priority]}>{a.priority} priority</Badge>
              {badge && <Badge tone={badge.tone}><AlarmClock size={11} /> {badge.label}</Badge>}
              <span className="text-[11px] font-semibold opacity-75">{remainingLabel(a, now)}</span>
            </>
          )}
        </div>
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
  const { assignments, addAssignment, updateAssignment, deleteAssignment, toggleComplete, notify } = useCampus();
  const { celebrate, toast } = useFeedback();
  const now = useNow(15_000);
  const ai = useAiStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const wp = weeklyProgress(assignments, now);
  const weekStart = startOfWeek(now);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000));

  const visible = useMemo(() => {
    return assignments
      .filter((a) => (filter === "all" ? true : filter === "active" ? !a.completed : a.completed))
      .filter((a) => {
        if (dayFilter === null) return true;
        const d = new Date(a.dueDate);
        return d >= days[dayFilter] && d < new Date(days[dayFilter].getTime() + 86_400_000);
      })
      .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, filter, dayFilter, weekStart.getTime()]);

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
      const msg = st === "overdue" ? "This deadline has already passed." : st === "due-2h" ? "Due in under 2 hours — start now." : st === "due-24h" ? "Due within 24 hours — schedule focus time today." : `Reminders will fire at 24h and 2h before the deadline (${when}).`;
      notify(`Reminder set: ${created.title}`, `${created.course} · ${formatDue(created.dueDate)}. ${msg}`, "study", `new-${created.id}`);
      toast("Assignment added · reminder created", msg, st === "upcoming" ? "success" : "warning");
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
        subtitle="Your week as sticky notes. Deadlines are analyzed live, with 24-hour and 2-hour warnings and reminders.">
        <Button variant="soft" onClick={() => setShowPlan((s) => !s)}><Brain size={16} /> {showPlan ? "Hide" : "Plan my"} study week</Button>
        <Button onClick={openNew}><Plus size={16} /> Add assignment</Button>
      </PageHeader>

      {/* Progress + week strip */}
      <Card className="mb-6">
        <div className="grid gap-5 lg:grid-cols-[280px_1fr] lg:items-center">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">Weekly progress</p>
              <p className="font-display text-2xl font-semibold">{wp.done}/{wp.total}</p>
            </div>
            <ProgressBar pct={wp.pct} tone="sage" className="mt-2" />
            <p className="mt-2 text-xs text-muted">{wp.total - wp.done === 0 && wp.total ? "All done this week! 🎈" : `${wp.total - wp.done} left this week (incl. overdue) · finish all for a big celebration`}</p>
          </div>
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
            {days.map((d, i) => {
              const dayItems = assignments.filter((a) => { const t = new Date(a.dueDate); return t >= d && t < new Date(d.getTime() + 86_400_000); });
              const isToday = d.toDateString() === now.toDateString();
              const active = dayFilter === i;
              const allDone = dayItems.length > 0 && dayItems.every((a) => a.completed);
              return (
                <button key={i} onClick={() => setDayFilter(active ? null : i)}
                  className={`flex min-w-[78px] flex-1 flex-col items-center rounded-2xl border px-2 py-2.5 transition ${active ? "border-ink bg-ink text-white" : isToday ? "border-lavender-deep/40 bg-lavender" : "border-line bg-white/70 hover:bg-white"}`}>
                  <span className="text-[11px] font-semibold uppercase opacity-70">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                  <span className="font-display text-xl font-semibold">{d.getDate()}</span>
                  <span className="mt-1 flex gap-0.5">
                    {dayItems.length === 0 ? <span className="h-1.5 w-1.5 rounded-full bg-transparent" /> :
                      dayItems.map((a) => <span key={a.id} className={`h-1.5 w-1.5 rounded-full ${a.completed ? "bg-sage-deep" : allDone ? "bg-sage-deep" : "bg-blush-deep"}`} />)}
                  </span>
                </button>
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
                  <p className="text-xs text-muted">Earliest-deadline-first, max 3 focus hours/day, overdue work first. Hours come from each card&apos;s estimate.</p>
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
                        <div key={i} className={`rounded-xl px-2.5 py-1.5 text-xs ${b.late ? "bg-blush text-blush-deep" : "bg-white"}`}>
                          <p className="font-semibold">{b.title}</p>
                          <p className="opacity-70">{b.hours}h{b.late ? " · catch up" : ""}</p>
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

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["all", "active", "completed"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${filter === f ? "bg-ink text-white" : "bg-paper text-muted hover:text-ink border border-line"}`}>
            {f === "active" ? "Incomplete" : f} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
        {dayFilter !== null && (
          <button onClick={() => setDayFilter(null)} className="inline-flex items-center gap-1 rounded-full bg-lavender px-3 py-1.5 text-xs font-semibold text-lavender-deep">
            {days[dayFilter].toLocaleDateString("en-US", { weekday: "long" })} <X size={12} />
          </button>
        )}
        <span className="ml-auto"><SourceLabel kind="demo" /></span>
      </div>

      {/* Board */}
      <div className="grid gap-6 pt-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {visible.map((a, i) => (
            <StickyNote key={a.id} a={a} i={i} now={now}
              onToggle={() => handleToggle(a)}
              onEdit={() => setForm({ id: a.id, course: a.course, title: a.title, due: toLocalInputValue(a.dueDate), priority: a.priority, color: a.color, estimatedHours: a.estimatedHours, notes: a.notes ?? "" })}
              onDelete={() => { deleteAssignment(a.id); toast("Assignment deleted", a.title, "info"); }}
            />
          ))}
        </AnimatePresence>
        <motion.button layout onClick={openNew}
          className="flex min-h-[230px] flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed border-line text-muted transition hover:border-lavender-deep hover:bg-lavender/40 hover:text-lavender-deep">
          <Plus size={28} />
          <span className="text-sm font-semibold">New sticky note</span>
        </motion.button>
      </div>
      {visible.length === 0 && <p className="mt-4 text-center text-sm text-muted">No assignments match this filter.</p>}

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
