"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarDays, Check, ChevronDown, ExternalLink, Globe2, Link2, Mail, MessageCircleQuestion, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Button, Card, IconBubble, inputCls, PageHeader, SourceLabel, toneBg } from "@/components/ui";
import { askAI } from "@/lib/ai-client";
import { dsoEmail } from "@/lib/emails";
import { termToEndISO, termToGraduationDate, validatePlan } from "@/lib/graduation";
import { buildMilestones, CHECKLIST, fmtDate, sourceById, SOURCES, TOPICS } from "@/lib/immigration";
import { retrieve, type Passage } from "@/lib/retrieval";
import { useCampus, useNow } from "@/lib/store";
import type { IntlProfile } from "@/lib/types";

function SourceChips({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <a key={id} href={sourceById[id].url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-powder-deep hover:underline">
          <Link2 size={10} /> {sourceById[id].publisher}
        </a>
      ))}
    </div>
  );
}

export default function InternationalAdvisor() {
  const { intl, setIntl, toggleChecklist, plan, notify } = useCampus();
  const { openDraft, toast } = useFeedback();
  const now = useNow();
  const [openTopic, setOpenTopic] = useState<string | null>("cpt");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ passages: Passage[]; ai: string | null } | null>(null);
  const [asking, setAsking] = useState(false);
  // Temporary, non-persisted preview of the timeline using the Graduation Planner date. The stored I-20 date never changes here.
  const [previewEnd, setPreviewEnd] = useState<string | null>(null);

  const v = useMemo(() => validatePlan(plan), [plan]);
  const milestones = useMemo(() => {
    const ms = buildMilestones(previewEnd ? { ...intl, programEndDate: previewEnd } : intl);
    return previewEnd ? ms.map((m) => (m.id === "program-end" ? { ...m, title: "Planned completion (preview, not your I-20 date)" } : m)) : ms;
  }, [intl, previewEnd]);
  const done = CHECKLIST.filter((c) => intl.checklist[c.id]).length;
  const planEnd = v.projectedTerm ? termToEndISO(v.projectedTerm) : null;
  const mismatch = intl.status === "F-1" && planEnd && planEnd > intl.programEndDate;

  const set = (p: Partial<IntlProfile>) => setIntl(p);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setAsking(true);
    const passages = retrieve(q);
    const ai = passages.length
      ? await askAI("immigration-rag", `Answer the student's question using ONLY these passages. Cite publisher names. End with: "Confirm with your DSO."\n\nQuestion: ${q}`, {
          passages: passages.map((p) => ({ text: p.text, topic: p.topic.title, sources: p.topic.sourceIds.map((id) => sourceById[id]) })),
          profile: { status: intl.status, programEndDate: intl.programEndDate },
        })
      : null;
    setAnswer({ passages, ai });
    setAsking(false);
  }

  return (
    <div>
      <PageHeader eyebrow="Module 3" title="International Student Advisor" icon={Globe2} tone="powder"
        subtitle="Source-grounded F-1, CPT, OPT and STEM OPT planning. Dates come only from cited timing rules; eligibility and authorization are always decided by your DSO and USCIS.">
        <Button variant="soft" onClick={() => openDraft({ title: "DSO email draft", ...dsoEmail(intl, v.projectedTerm?.id), source: "rule" })}><Mail size={16} /> Draft DSO email</Button>
      </PageHeader>

      <div className="mb-6 flex items-start gap-3 rounded-3xl border border-butter-mid bg-butter/60 p-4 text-sm">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-butter-deep" />
        <p><b>Not legal advice.</b> This prototype summarizes public guidance from USCIS and Study in the States. Rules change; always confirm with your Designated School Official (DSO) and the official sources linked below before acting.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {/* Profile */}
        <Card className="h-fit">
          <h2 className="font-display text-xl font-semibold">Your planning profile</h2>
          <p className="mb-4 text-xs text-muted">Fictional values for Alex — edit to see the timeline recalculate.</p>
          <div className="space-y-3">
            <label className="block text-xs font-semibold">Current student status
              <select className={`${inputCls} mt-1`} value={intl.status} onChange={(e) => set({ status: e.target.value as IntlProfile["status"] })}>
                <option>F-1</option><option>Not an international student</option><option>Other / unsure</option>
              </select>
            </label>
            <label className="block text-xs font-semibold">Degree level
              <select className={`${inputCls} mt-1`} value={intl.degreeLevel} onChange={(e) => set({ degreeLevel: e.target.value as IntlProfile["degreeLevel"] })}>
                <option>Bachelor&apos;s</option><option>Master&apos;s</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold">Program start
                <input type="date" className={`${inputCls} mt-1 !px-2`} value={intl.programStartDate} onChange={(e) => e.target.value && set({ programStartDate: e.target.value })} />
              </label>
              <label className="block text-xs font-semibold">Program end (I-20)
                <input type="date" className={`${inputCls} mt-1 !px-2`} value={intl.programEndDate} onChange={(e) => e.target.value && set({ programEndDate: e.target.value })} />
              </label>
            </div>
            <div className="space-y-2 pt-1">
              {([["cptInterest", "Interested in a CPT internship"], ["stemInterest", "Planning to explore STEM OPT"]] as const).map(([k, label]) => (
                <label key={k} className="flex cursor-pointer items-center justify-between rounded-2xl bg-cream px-3 py-2 text-sm">
                  {label}
                  <input type="checkbox" className="h-4 w-4 accent-[#46729f]" checked={intl[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<IntlProfile>)} />
                </label>
              ))}
            </div>
            <div className={`rounded-2xl p-3 text-xs ${mismatch ? "bg-blush text-blush-deep" : "bg-sage/70 text-sage-deep"}`}>
              <p className="font-semibold">Graduation Planner link</p>
              <p className="mt-0.5">Academic plan projects <b>{termToGraduationDate(v.projectedTerm)}</b>. {mismatch ? "That is after your I-20 end date — ask your DSO about a program extension before the end date." : "Consistent with your I-20 end date."}</p>
              {planEnd && planEnd !== intl.programEndDate && !previewEnd && (
                <button className="mt-2 inline-flex items-center gap-1 font-semibold underline" onClick={() => { setPreviewEnd(planEnd); toast("Previewing timeline with plan date", `Showing dates for ${fmtDate(planEnd)}. Your I-20 date (${fmtDate(intl.programEndDate)}) is not changed.`, "info"); }}>
                  <RefreshCw size={11} /> Preview timeline with plan date
                </button>
              )}
              {previewEnd && (
                <button className="mt-2 inline-flex items-center gap-1 font-semibold underline" onClick={() => setPreviewEnd(null)}>
                  <RefreshCw size={11} /> Back to I-20 date
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Timeline */}
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><CalendarDays size={18} className="text-powder-deep" /><h2 className="font-display text-xl font-semibold">Planning timeline</h2></div>
            <div className="flex gap-1.5"><SourceLabel kind="verified" /><SourceLabel kind="guidance" /></div>
          </div>
          {previewEnd && intl.status === "F-1" && (
            <p className="mb-3 rounded-2xl border border-butter-mid bg-butter/70 px-3 py-2 text-xs">
              <b>Preview only:</b> dates below use your planned completion ({fmtDate(previewEnd)}). Your I-20 end date stays {fmtDate(intl.programEndDate)} until your DSO issues an updated I-20. Only then should you change it in your profile.
            </p>
          )}
          {intl.status !== "F-1" ? (
            <div className="rounded-2xl bg-cream p-6 text-sm text-muted">
              Date calculations apply only to F-1 students. {intl.status === "Other / unsure" ? "Please confirm your status with your international student office — we won't guess deadlines." : "Switch status to F-1 to preview the CPT/OPT timeline."}
            </div>
          ) : (
            <ol className="relative ml-3 border-l-2 border-dashed border-powder-mid">
              {milestones.map((m, i) => {
                const past = m.date && new Date(m.date + "T23:59:59") < now;
                const days = m.date ? Math.round((new Date(m.date + "T12:00:00").getTime() - now.getTime()) / 86_400_000) : null;
                return (
                  <motion.li key={m.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative mb-4 pl-6 last:mb-0">
                    <span className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-paper ${m.kind === "verified-rule" ? "bg-sage-deep" : "bg-butter-deep"} ${past ? "opacity-40" : ""}`} />
                    <div className={`rounded-2xl border border-line p-3.5 ${past ? "bg-cream/60 opacity-70" : "bg-white/70"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{m.title}</p>
                        <div className="flex items-center gap-1.5">
                          {m.date ? <Badge tone="powder">{fmtDate(m.date)}</Badge> : <Badge tone="neutral">Date set by USCIS</Badge>}
                          {days !== null && <span className="text-[11px] text-muted">{past ? "passed" : `in ${days} days`}</span>}
                        </div>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{m.explanation}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={m.kind === "verified-rule" ? "sage" : "butter"}>{m.kind === "verified-rule" ? "Cited timing rule" : "Planning guidance"}</Badge>
                        <SourceChips ids={m.sourceIds} />
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Topics */}
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Guidance library</h2>
          {TOPICS.map((t) => {
            const open = openTopic === t.id;
            return (
              <div key={t.id} className="card overflow-hidden !p-0">
                <button onClick={() => setOpenTopic(open ? null : t.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneBg[t.color]}`}><BookOpen size={16} /></span>
                  <div className="flex-1">
                    <p className="font-semibold">{t.title}</p>
                    <p className="text-xs text-muted">{t.summary}</p>
                  </div>
                  <ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className={`mx-4 mb-4 rounded-2xl p-4 ${toneBg[t.color].split(" ")[0]}`}>
                        <ul className="space-y-1.5 text-sm text-ink/85">{t.points.map((p) => <li key={p}>• {p}</li>)}</ul>
                        <div className="mt-3"><SourceChips ids={t.sourceIds} /></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Ask */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><MessageCircleQuestion size={18} className="text-lavender-deep" /><h3 className="font-semibold">Ask the source library</h3></div>
              <Badge tone="neutral">Retrieval over curated official-source summaries</Badge>
            </div>
            <form onSubmit={ask} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-3 text-muted" />
                <input className={`${inputCls} pl-9`} placeholder="e.g. When can I file for OPT?" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Button type="submit" disabled={asking}>{asking ? "Searching…" : "Ask"}</Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["When can I file for OPT?", "Does CPT affect OPT?", "What is STEM OPT?", "Who authorizes CPT?"].map((s) => (
                <button key={s} onClick={() => setQ(s)} className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink">{s}</button>
              ))}
            </div>
            {answer && (
              <div className="mt-4 space-y-2">
                {answer.ai && (
                  <div className="rounded-2xl bg-lavender/60 p-3">
                    <SourceLabel kind="gemini" />
                    <p className="mt-1 whitespace-pre-line text-sm">{answer.ai}</p>
                  </div>
                )}
                {!answer.passages.length && <p className="rounded-2xl bg-cream p-3 text-sm text-muted">No matching guidance in the curated library. Please ask your DSO or check the official sources below — we won&apos;t guess.</p>}
                {answer.passages.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted">{answer.ai ? "Retrieved passages used:" : "Most relevant guidance (deterministic retrieval — no AI generation):"}</p>
                    {answer.passages.map((p, i) => (
                      <div key={i} className="rounded-2xl border border-line bg-white/70 p-3">
                        <p className="text-sm">{p.text}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-muted">{p.topic.title}</span><SourceChips ids={p.topic.sourceIds} /></div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Checklist */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">Planning checklist</h3>
              <span className="text-sm font-semibold text-sage-deep">{done}/{CHECKLIST.length}</span>
            </div>
            <ul className="space-y-1.5">
              {CHECKLIST.map((c) => {
                const checked = !!intl.checklist[c.id];
                return (
                  <li key={c.id}>
                    <button onClick={() => { toggleChecklist(c.id); if (!checked && done + 1 === CHECKLIST.length) notify("Immigration checklist complete", "Great planning — keep your DSO in the loop.", "international"); }}
                      className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left text-sm transition ${checked ? "bg-sage/70" : "bg-cream hover:bg-powder/50"}`}>
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${checked ? "border-sage-deep bg-sage-deep text-white" : "border-line bg-white"}`}>{checked && <Check size={13} strokeWidth={3} />}</span>
                      <span className={checked ? "text-ink/60" : ""}>{c.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* DSO */}
          <Card>
            <div className="flex items-center gap-3">
              <IconBubble icon={Mail} tone="blush" size="sm" />
              <div>
                <h3 className="font-semibold">DSO communication</h3>
                <p className="text-xs text-muted">Pre-filled from your profile and graduation plan.</p>
              </div>
            </div>
            <Button className="mt-3 w-full" onClick={() => openDraft({ title: "DSO email draft", ...dsoEmail(intl, v.projectedTerm?.id), source: "rule" })}>Generate DSO email</Button>
          </Card>

          {/* Sources */}
          <Card>
            <h3 className="mb-2 font-semibold">Official sources</h3>
            <ul className="space-y-1.5">
              {SOURCES.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-xl p-2 text-sm hover:bg-powder/50">
                    <ExternalLink size={14} className="mt-0.5 shrink-0 text-powder-deep" />
                    <span><span className="font-semibold group-hover:underline">{s.title}</span><span className="block text-[11px] text-muted">{s.publisher}</span></span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
