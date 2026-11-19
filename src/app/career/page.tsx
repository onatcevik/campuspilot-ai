"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Briefcase, Calculator, CircleHelp, FileText, MapPin, Plus, ShieldCheck, ShieldQuestion, ShieldX, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Card, IconBubble, PageHeader, ProgressRing, SourceLabel, type Tone } from "@/components/ui";
import { DEMO_STUDENT, OPPORTUNITIES, SKILL_LIBRARY } from "@/lib/demo-data";
import { MATCH_WEIGHTS, matchOpportunity, resumeTips, skillGaps } from "@/lib/matching";
import { useCampus } from "@/lib/store";
import type { ApplicationStatus, CareerField, CareerOpportunity, WorkAuthStatus } from "@/lib/types";

const FIELDS: CareerField[] = ["Software Engineering", "Artificial Intelligence", "Machine Learning", "Data Science", "Cybersecurity", "Cloud Computing"];
const REGIONS: CareerOpportunity["region"][] = ["Washington, DC", "Northern Virginia", "Maryland"];
const authMeta: Record<WorkAuthStatus, { tone: Tone; label: string; icon: typeof ShieldCheck }> = {
  confirmed: { tone: "sage", label: "CPT/OPT accepted (stated)", icon: ShieldCheck },
  "verification-required": { tone: "butter", label: "Verification required", icon: ShieldQuestion },
  unknown: { tone: "neutral", label: "Unknown", icon: CircleHelp },
  restricted: { tone: "blush", label: "Explicit restriction", icon: ShieldX },
};
const authBg: Record<WorkAuthStatus, string> = { confirmed: "bg-sage", "verification-required": "bg-butter", unknown: "bg-cream", restricted: "bg-blush" };
const STATUSES: { v: ApplicationStatus; label: string }[] = [
  { v: "not-started", label: "Not started" }, { v: "interested", label: "Interested" }, { v: "applied", label: "Applied" },
  { v: "interviewing", label: "Interviewing" }, { v: "offer", label: "Offer" },
];
const fieldTone: Record<CareerField, Tone> = {
  "Software Engineering": "lavender", "Artificial Intelligence": "blush", "Machine Learning": "powder",
  "Data Science": "butter", Cybersecurity: "sage", "Cloud Computing": "powder",
};

export default function CareerNavigator() {
  const { career, setCareer, saved, toggleSaved, statuses, setStatus, intl, notify } = useCampus();
  const { toast } = useFeedback();
  const [savedOnly, setSavedOnly] = useState(false);
  const [authFilter, setAuthFilter] = useState<WorkAuthStatus | "all">("all");
  const [newSkill, setNewSkill] = useState("");
  const [explain, setExplain] = useState<string | null>(null);

  const scored = useMemo(
    () => OPPORTUNITIES.map((o) => ({ o, m: matchOpportunity(o, career) })).sort((a, b) => b.m.score - a.m.score),
    [career],
  );
  const shown = scored.filter(({ o }) => (!savedOnly || saved.includes(o.id)) && (authFilter === "all" || o.workAuth === authFilter));
  const gaps = skillGaps(OPPORTUNITIES, career);
  const tips = resumeTips(career, OPPORTUNITIES);
  const avg = Math.round(scored.slice(0, 3).reduce((s, x) => s + x.m.score, 0) / 3);
  const isF1 = intl.status === "F-1";

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function addSkill(s: string) {
    const v = s.trim();
    if (!v || career.skills.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setCareer({ skills: [...career.skills, v] });
    setNewSkill("");
    toast(`Added skill: ${v}`, "Match scores recalculated.", "success");
  }

  return (
    <div>
      <PageHeader eyebrow="Module 4" title="Career Navigator" icon={Briefcase} tone="blush"
        subtitle="Personalized matching for DC, Northern Virginia and Maryland. All listings are fictional samples — no live deadlines, and work-authorization status is never assumed." />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        {/* Profile */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-4">
              <ProgressRing pct={avg} size={84} stroke={9} color="var(--color-blush-deep)" track="var(--color-blush)">
                <span className="font-display text-xl font-semibold">{avg}%</span>
              </ProgressRing>
              <div>
                <p className="font-semibold">{DEMO_STUDENT.name}</p>
                <p className="text-xs text-muted">{DEMO_STUDENT.major}</p>
                <p className="text-xs text-muted">Graduating {DEMO_STUDENT.expectedGraduation}</p>
                <p className="mt-1 text-[11px] text-muted">Avg. of top 3 matches</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-xs">
              <p className="flex justify-between gap-3"><span className="text-muted">Availability</span><span className="text-right font-semibold">{career.internshipAvailability}</span></p>
              <p className="flex justify-between gap-3"><span className="text-muted">Work authorization</span><span className="text-right font-semibold">{isF1 ? "F-1 · CPT/OPT needs DSO/USCIS authorization" : intl.status}</span></p>
            </div>
          </Card>

          <Card>
            <p className="mb-2 text-sm font-semibold">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {career.skills.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-lavender px-2.5 py-1 text-xs font-semibold text-lavender-deep">
                  {s}
                  <button onClick={() => setCareer({ skills: career.skills.filter((x) => x !== s) })} aria-label={`Remove ${s}`}><X size={11} /></button>
                </span>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addSkill(newSkill); }} className="mt-3 flex gap-2">
              <input list="skills" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add a skill…"
                className="min-w-0 flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-lavender-deep" />
              <datalist id="skills">{SKILL_LIBRARY.filter((s) => !career.skills.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
              <button className="rounded-full bg-ink p-2 text-white" aria-label="Add skill"><Plus size={14} /></button>
            </form>
            <p className="mb-2 mt-4 text-sm font-semibold">Target fields</p>
            <div className="flex flex-wrap gap-1.5">
              {FIELDS.map((f) => (
                <button key={f} onClick={() => setCareer({ interests: toggleIn(career.interests, f) })}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${career.interests.includes(f) ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"}`}>{f}</button>
              ))}
            </div>
            <p className="mb-2 mt-4 text-sm font-semibold">Preferred locations</p>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <button key={r} onClick={() => setCareer({ preferredRegions: toggleIn(career.preferredRegions, r) })}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${career.preferredRegions.includes(r) ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"}`}>{r}</button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-center gap-2"><Calculator size={16} className="text-powder-deep" /><p className="font-semibold">How match scores work</p></div>
            <ul className="space-y-1 text-xs text-muted">
              <li><b className="text-ink">{MATCH_WEIGHTS.required}%</b> × share of required skills you have</li>
              <li><b className="text-ink">{MATCH_WEIGHTS.preferred}%</b> × share of preferred skills you have</li>
              <li><b className="text-ink">{MATCH_WEIGHTS.interest}%</b> if the role is in one of your target fields</li>
              <li><b className="text-ink">{MATCH_WEIGHTS.location}%</b> if it&apos;s in a preferred region or remote</li>
            </ul>
            <p className="mt-2 text-[11px] text-muted">Deterministic and explainable — the same inputs always give the same score. Work authorization never changes the score; it&apos;s shown separately.</p>
          </Card>
        </div>

        {/* Opportunities */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setSavedOnly(false)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!savedOnly ? "bg-ink text-white" : "border border-line bg-paper text-muted"}`}>All ({OPPORTUNITIES.length})</button>
            <button onClick={() => setSavedOnly(true)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${savedOnly ? "bg-ink text-white" : "border border-line bg-paper text-muted"}`}>Saved ({saved.length})</button>
            <select value={authFilter} onChange={(e) => setAuthFilter(e.target.value as WorkAuthStatus | "all")} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm" aria-label="Filter by work authorization">
              <option value="all">Any work-authorization status</option>
              {(Object.keys(authMeta) as WorkAuthStatus[]).map((k) => <option key={k} value={k}>{authMeta[k].label}</option>)}
            </select>
            <span className="ml-auto"><SourceLabel kind="demo" /></span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {shown.map(({ o, m }) => {
                const a = authMeta[o.workAuth];
                const isSaved = saved.includes(o.id);
                const st = statuses[o.id] ?? "not-started";
                return (
                  <motion.div layout key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="card flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5"><Badge tone={fieldTone[o.field]}>{o.field}</Badge><Badge tone="neutral">{o.type}</Badge></div>
                        <h3 className="font-display mt-2 text-xl font-semibold leading-snug">{o.role}</h3>
                        <p className="text-sm text-muted">{o.company}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin size={12} /> {o.location} · {o.remote}</p>
                      </div>
                      <button onClick={() => setExplain(explain === o.id ? null : o.id)} className="shrink-0 text-center" aria-label={`Explain ${m.score}% match`}>
                        <ProgressRing pct={m.score} size={64} stroke={7} color={m.score >= 70 ? "var(--color-sage-deep)" : m.score >= 45 ? "var(--color-butter-deep)" : "var(--color-blush-deep)"} track="var(--color-line)">
                          <span className="text-sm font-bold">{m.score}%</span>
                        </ProgressRing>
                        <span className="text-[10px] font-semibold text-muted underline">why?</span>
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-ink/80">{o.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {o.requiredSkills.map((s) => <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.matchedRequired.includes(s) ? "bg-sage text-sage-deep" : "bg-blush text-blush-deep"}`}>{s}</span>)}
                      {o.preferredSkills.map((s) => <span key={s} className={`rounded-full border px-2 py-0.5 text-[11px] ${m.matchedPreferred.includes(s) ? "border-sage-mid text-sage-deep" : "border-line text-muted"}`}>{s}</span>)}
                    </div>
                    <AnimatePresence>
                      {explain === o.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="mt-3 space-y-0.5 rounded-2xl bg-cream p-3 text-xs">
                            <p>Required: {m.matchedRequired.length}/{o.requiredSkills.length} → <b>{Math.round(MATCH_WEIGHTS.required * m.matchedRequired.length / o.requiredSkills.length)}</b> pts</p>
                            <p>Preferred: {m.matchedPreferred.length}/{o.preferredSkills.length} → <b>{Math.round(MATCH_WEIGHTS.preferred * m.matchedPreferred.length / o.preferredSkills.length)}</b> pts</p>
                            <p>Target field: {m.interestMatch ? "yes" : "no"} → <b>{m.interestMatch ? MATCH_WEIGHTS.interest : 0}</b> pts</p>
                            <p>Location fit: {m.locationMatch ? "yes" : "no"} → <b>{m.locationMatch ? MATCH_WEIGHTS.location : 0}</b> pts</p>
                            {m.missingRequired.length > 0 && <p className="pt-1 text-blush-deep">Missing required: {m.missingRequired.join(", ")}</p>}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className={`mt-3 rounded-2xl p-3 text-xs ${authBg[o.workAuth]}`}>
                      <p className="flex items-center gap-1.5 font-semibold"><a.icon size={14} /> Work authorization: {a.label}</p>
                      <p className="mt-0.5 text-ink/70">{o.workAuthNote}</p>
                      {isF1 && o.workAuth !== "restricted" && o.type !== "Full-time (new grad)" && <p className="mt-1 text-ink/70">F-1: CPT must be authorized by your DSO before starting.</p>}
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <select value={st} onChange={(e) => { setStatus(o.id, e.target.value as ApplicationStatus); if (e.target.value === "applied") notify(`Applied: ${o.role}`, `${o.company}. ${isF1 ? "Remember: plan CPT with your DSO early." : ""}`, "career"); }}
                        className="flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold" aria-label={`Application status for ${o.role}`}>
                        {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                      </select>
                      <button onClick={() => { toggleSaved(o.id); toast(isSaved ? "Removed from saved" : "Saved opportunity", o.role, isSaved ? "info" : "success"); }}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${isSaved ? "bg-blush text-blush-deep" : "border border-line bg-paper hover:bg-blush/50"}`}>
                        {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          {!shown.length && <p className="card p-8 text-center text-sm text-muted">No opportunities match these filters.</p>}

          {/* Resume */}
          <Card className="mt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3"><IconBubble icon={FileText} tone="butter" size="sm" /><h2 className="font-display text-xl font-semibold">Resume improvement</h2></div>
              <SourceLabel kind="rule" />
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_260px]">
              <ol className="space-y-2">
                {tips.map((t, i) => (
                  <li key={t.title} className="flex gap-3 rounded-2xl bg-cream/80 p-3">
                    <span className="font-display text-lg font-semibold text-butter-deep">{i + 1}</span>
                    <div><p className="text-sm font-semibold">{t.title}</p><p className="text-xs text-muted">{t.detail}</p></div>
                  </li>
                ))}
              </ol>
              <div className="rounded-2xl bg-butter/50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={14} /> Top skill gaps</p>
                <p className="mb-2 text-[11px] text-muted">Most frequent missing skills across your best-fit roles</p>
                {gaps.map((g) => (
                  <button key={g.skill} onClick={() => addSkill(g.skill)} className="mb-1.5 flex w-full items-center justify-between rounded-xl bg-white/80 px-3 py-1.5 text-sm hover:bg-white">
                    {g.skill} <span className="text-[11px] font-semibold text-butter-deep">+ I have this</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
