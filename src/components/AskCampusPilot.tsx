"use client";

import { ArrowRight, Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { handOffQuestion } from "@/lib/assistant/handoff";

const QUICK = ["What should I work on this week?", "Can I graduate by May 2028 and still complete a summer internship?", "What should I ask my academic advisor or DSO?"];

export function AskCampusPilot() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (text: string) => {
    if (!text.trim()) return;
    handOffQuestion(text.trim());
    router.push("/assistant");
  };
  return (
    <section className="card p-4 md:p-5" aria-label="Ask CampusPilot">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3 md:w-56 md:shrink-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-lavender-mid via-powder-mid to-blush-mid"><Bot size={18} /></span>
          <div>
            <p className="font-display text-lg font-semibold leading-tight">Ask CampusPilot</p>
            <p className="text-[11px] text-muted">One assistant across all modules</p>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="flex min-w-0 flex-1 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="e.g. Which courses should I prioritize next semester?"
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-lavender-deep focus:ring-4 focus:ring-lavender" aria-label="Ask CampusPilot a question" />
          <button type="submit" disabled={!q.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-ink/85 disabled:opacity-40" aria-label="Ask"><ArrowRight size={16} /></button>
        </form>
      </div>
      <div className="scrollbar-thin mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {QUICK.map((s) => (
          <button key={s} onClick={() => go(s)} className="shrink-0 rounded-full bg-lavender/70 px-3 py-1 text-[11px] font-semibold text-lavender-deep transition hover:bg-lavender-mid">{s}</button>
        ))}
      </div>
    </section>
  );
}
