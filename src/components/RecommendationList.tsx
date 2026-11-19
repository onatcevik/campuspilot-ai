"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Briefcase, CheckCircle2, Globe2, GraduationCap, Info, NotebookPen, Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { advisorEmail, dsoEmail } from "@/lib/emails";
import { validatePlan } from "@/lib/graduation";
import { useCampus } from "@/lib/store";
import type { ModuleKey, Recommendation } from "@/lib/types";
import { useFeedback } from "./feedback";
import { Badge, severityTone, toneBg } from "./ui";

const moduleIcon: Record<ModuleKey, typeof Info> = {
  study: NotebookPen, graduation: GraduationCap, international: Globe2, career: Briefcase, assistant: Bot,
};
const moduleName: Record<ModuleKey, string> = {
  study: "Study Board", graduation: "Graduation", international: "International", career: "Career", assistant: "Assistant",
};

export function useRecAction() {
  const router = useRouter();
  const { plan, intl } = useCampus();
  const { openDraft } = useFeedback();
  return (r: Recommendation) => {
    if (!r.action) return;
    if (r.action.kind === "advisor-email") {
      const e = advisorEmail(validatePlan(plan));
      openDraft({ title: "Academic advisor email", ...e, source: "rule" });
    } else if (r.action.kind === "dso-email") {
      const v = validatePlan(plan);
      const e = dsoEmail(intl, v.projectedTerm?.id);
      openDraft({ title: "DSO email draft", ...e, source: "rule" });
    } else if (r.action.href) router.push(r.action.href);
  };
}

export function RecommendationList({ recs, limit }: { recs: Recommendation[]; limit?: number }) {
  const act = useRecAction();
  const shown = limit ? recs.slice(0, limit) : recs;
  if (!shown.length)
    return <p className="rounded-2xl bg-sage/60 p-4 text-sm text-sage-deep">All clear — no alerts right now.</p>;
  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false}>
        {shown.map((r) => {
          const tone = severityTone[r.severity];
          const Icon = moduleIcon[r.module];
          const SevIcon = r.severity === "critical" || r.severity === "warning" ? AlertTriangle : r.severity === "success" ? CheckCircle2 : Info;
          return (
            <motion.li key={r.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}
              className="flex gap-3 rounded-2xl border border-line/80 bg-white/60 p-3.5 transition hover:shadow-soft">
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneBg[tone]}`}><SevIcon size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{r.title}</p>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral"><Icon size={11} /> {moduleName[r.module]}</Badge>
                  {r.action && (
                    <button onClick={() => act(r)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition hover:brightness-95 ${toneBg[tone]}`}>
                      {r.action.label} <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
