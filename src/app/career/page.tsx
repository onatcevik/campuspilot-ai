"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Briefcase, Calculator, CalendarCheck, CircleHelp, Database, ExternalLink, FileText, MapPin, PanelRightOpen, Plus, Search, RefreshCw, ShieldCheck, ShieldQuestion, ShieldX, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Badge, Card, IconBubble, PageHeader, ProgressRing, SourceLabel, type Tone } from "@/components/ui";
import { CareerDetailDrawer } from "@/components/career/CareerDetailDrawer";
import { filterListings, type SourceFilter } from "@/lib/career-state";
import { workAuthGuidance } from "@/lib/career-guidance";
import { OPPORTUNITIES, SKILL_LIBRARY } from "@/lib/demo-data";
import { useLiveJobs } from "@/lib/jobs/client";
import { isStale } from "@/lib/jobs/normalize";
import { deriveStudentProfile } from "@/lib/profile";
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
  const { career, setCareer, saved, toggleSaved, statuses, setStatus, intl, plan, notify, assignments } = useCampus();
  const { toast } = useFeedback();
  const [savedOnly, setSavedOnly] = useState(false);
  const [authFilter, setAuthFilter] = useState<WorkAuthStatus | "all">("all");
  const [newSkill, setNewSkill] = useState("");
  const [explain, setExplain] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [fieldFilter, setFieldFilter] = useState<CareerField | "all">("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const live = useLiveJobs();

  // One shared profile (Graduation Planner + International Advisor + career skills) instead of duplicated fields.
  const profile = useMemo(() => deriveStudentProfile({ plan, career, intl }), [plan, career, intl]);
  const all = useMemo(() => [...OPPORTUNITIES, ...live.listings], [live.listings]);
  const scored = useMemo(
    () => all.map((o) => ({ o, m: matchOpportunity(o, career) })).sort((a, b) => b.m.score - a.m.score),
    [all, career],
  );
  const shown = filterListings(scored, { savedOnly, saved, authFilter, source, statusFilter, statuses, field: fieldFilter, query });
  const tasksFor = (id: string) => assignments.filter((x) => x.origin?.module === "career" && x.origin.opportunityId === id);
  const gaps = skillGaps(all, career);
  const tips = resumeTips(career, all);
  const top3 = scored.filter((x) => !x.m.insufficientData).slice(0, 3);
  const avg = top3.length ? Math.round(top3.reduce((s, x) => s + x.m.score, 0) / top3.length) : 0;
  const isF1 = profile.isF1;
  const detail = scored.find((x) => x.o.id === detailId) ?? null;

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
        subtitle="Personalized matching for DC, Northern Virginia and Maryland. Fictional demo listings plus optional real postings from public job boards. Work authorization is never assumed." />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        {/* Profile */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-4">
              <ProgressRing pct={avg} size={84} stroke={9} color="var(--color-blush-deep)" track="var(--color-blush)">
                <span className="font-display text-xl font-semibold">{avg}%</span>
              </ProgressRing>
              <div>
                <p className="font-semibold">{profile.name}</p>
                <p className="text-xs text-muted">{profile.major}</p>
                <p className="text-xs text-muted">Projected graduation {profile.projectedGraduation}</p>
                <p className="mt-1 text-[11px] text-muted">Avg. of top 3 matches</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-xs">
              <p className="flex justify-between gap-3"><span className="text-muted">Next internship window</span><span className="text-right font-semibold">{profile.nextInternshipWindow ? `${profile.nextInternshipWindow.label} · ${profile.nextInternshipWindow.level}` : "No summer term before graduation"}</span></p>
              {profile.nextInternshipWindow && <p className="text-right text-[11px] text-muted">{profile.nextInternshipWindow.note}</p>}
              <p className="flex justify-between gap-3"><span className="text-muted">Work authorization</span><span className="text-right font-semibold">{profile.workAuthSummary}</span></p>
              {!profile.graduationOnTrack && <p className="rounded-xl bg-butter/70 px-2 py-1 text-[11px]">Graduation plan needs attention. Availability may change after you fix it in Graduation Planner.</p>}
              <p className="text-[10px] text-muted">Synced from Graduation Planner and International Advisor.</p>
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[200px] flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search role, company, skill…" aria-label="Search opportunities"
                className="w-full rounded-full border border-line bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-lavender-deep" />
            </label>
            {(["all", ...FIELDS] as (CareerField | "all")[]).map((f) => (
              <button key={f} onClick={() => setFieldFilter(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${fieldFilter === f ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"}`}>{f === "all" ? "All fields" : f}</button>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setSavedOnly(false)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!savedOnly ? "bg-ink text-white" : "border border-line bg-paper text-muted"}`}>All ({all.length})</button>
            <button onClick={() => setSavedOnly(true)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${savedOnly ? "bg-ink text-white" : "border border-line bg-paper text-muted"}`}>Saved ({saved.length})</button>
            <select value={authFilter} onChange={(e) => setAuthFilter(e.target.value as WorkAuthStatus | "all")} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm" aria-label="Filter by work authorization">
              <option value="all">Any work-authorization status</option>
              {(Object.keys(authMeta) as WorkAuthStatus[]).map((k) => <option key={k} value={k}>{authMeta[k].label}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value as SourceFilter)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm" aria-label="Filter by data source">
              <option value="all">Demo + live</option><option value="demo">Demo only</option><option value="live">Live only</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "all")} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm" aria-label="Filter by application status">
              <option value="all">Any status</option>
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper/80 px-4 py-2.5 text-xs">
            <Database size={14} className="text-powder-deep" />
            <span className="font-semibold">Job data:</span>
            <span>{OPPORTUNITIES.length} fictional demo listings</span>
            <span className="text-muted">·</span>
            {live.status === "loading" ? <span className="text-muted">checking live sources…</span>
              : !live.configured ? <span className="text-muted">Live job boards not configured (see README)</span>
              : <span>{live.listings.length} live DC/VA/MD student roles from {live.providers.filter((p) => p.ok).length}/{live.providers.length} boards{live.fetchedAt ? `, fetched ${new Date(live.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</span>}
            {live.providers.some((p) => !p.ok) && <span className="text-blush-deep">({live.providers.filter((p) => !p.ok).map((p) => p.id).join(", ")} unavailable)</span>}
            {live.configured && <button onClick={live.refresh} className="ml-auto inline-flex items-center gap-1 font-semibold text-powder-deep hover:underline"><RefreshCw size={12} /> Refresh</button>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {shown.map(({ o, m }) => {
                const a = authMeta[o.workAuth];
                const isSaved = saved.includes(o.id);
                const st = statuses[o.id] ?? "not-started";
                const g = workAuthGuidance(o, profile);
                return (
                  <motion.div layout key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="card flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5"><Badge tone={fieldTone[o.field]}>{o.field}</Badge><Badge tone="neutral">{o.type}</Badge></div>
                        <h3 className="font-display mt-2 text-xl font-semibold leading-snug">{o.role}</h3>
                        <p className="text-sm text-muted">{o.company}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin size={12} /> {o.location} · {o.remote}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {o.source.kind === "demo" ? "Fictional demo listing · no application link" : (
                            <>
                              {o.source.postedAt ? `${o.source.postedAtLabel} ${new Date(o.source.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Date not provided"} · {o.source.providerLabel}{isStale(o.source.postedAt) ? " · may be stale" : ""}{" "}
                              <a href={o.source.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-powder-deep underline">Apply <ExternalLink size={10} /></a>
                            </>
                          )}
                        </p>
                      </div>
                      <button onClick={() => setExplain(explain === o.id ? null : o.id)} className="shrink-0 text-center" aria-label={`Explain ${m.score}% match`}>
                        <ProgressRing pct={m.score} size={64} stroke={7} color={m.score >= 70 ? "var(--color-sage-deep)" : m.score >= 45 ? "var(--color-butter-deep)" : "var(--color-blush-deep)"} track="var(--color-line)">
                          <span className="text-sm font-bold">{m.insufficientData ? "—" : `${m.score}%`}</span>
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
                      {isF1 && g.pathway !== "none" && <p className="mt-1 text-ink/70"><b>{g.headline}.</b>{g.employerQuestion ? " The listing doesn't say whether the employer accepts this." : ""}</p>}
                    </div>
                    <button onClick={() => setDetailId(o.id)} className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-lavender px-3 py-1.5 text-xs font-semibold text-lavender-deep transition hover:bg-lavender-mid">
                      <PanelRightOpen size={13} /> Fit analysis, CPT/OPT & tasks
                    </button>
                    {tasksFor(o.id).length > 0 && (
                      <Link href="/study-board" className="mt-2 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-sage-deep hover:underline">
                        <CalendarCheck size={12} /> {tasksFor(o.id).length} task{tasksFor(o.id).length > 1 ? "s" : ""} on your Study Board ({tasksFor(o.id).filter((x) => x.completed).length} done) →
                      </Link>
                    )}
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
      <AnimatePresence>
        {detail && <CareerDetailDrawer key={detail.o.id} o={detail.o} m={detail.m} profile={profile} onClose={() => setDetailId(null)} />}
      </AnimatePresence>
    </div>
  );
}
