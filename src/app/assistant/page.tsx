"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RecommendationList } from "@/components/RecommendationList";
import { Card, PageHeader, SourceLabel } from "@/components/ui";
import { askAI, useAiStatus } from "@/lib/ai-client";
import { assistantContext, ruleBasedAnswer } from "@/lib/assistant";
import { buildRecommendations } from "@/lib/recommendations";
import { useCampus, useNow } from "@/lib/store";

interface Msg { id: number; role: "user" | "bot"; text: string; source?: "gemini" | "rule" }

const SUGGESTIONS = [
  "What should I focus on today?",
  "What's due this week?",
  "Am I on track to graduate?",
  "When can I apply for OPT?",
  "Which internships match my skills?",
];

export default function Assistant() {
  const state = useCampus();
  const now = useNow();
  const ai = useAiStatus();
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: "bot", source: "rule", text: "Hi Alex! I'm your CampusPilot assistant. I can see your Study Board, Graduation Plan, international timeline, and career matches. What would you like to know?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recs = buildRecommendations(state, now);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: q }]);
    setBusy(true);
    const history = msgs.slice(-6).map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.text}`).join("\n");
    const geminiText = ai === "gemini" ? await askAI("chat", `${history}\nStudent: ${q}`, assistantContext(state, now)) : null;
    if (!geminiText) await new Promise((r) => setTimeout(r, 450));
    const reply: Msg = geminiText
      ? { id: Date.now() + 1, role: "bot", text: geminiText, source: "gemini" }
      : { id: Date.now() + 1, role: "bot", text: ruleBasedAnswer(q, state, now), source: "rule" };
    setMsgs((m) => [...m, reply]);
    setBusy(false);
  }

  return (
    <div>
      <PageHeader eyebrow="Module 5" title="AI Assistant" icon={Bot} tone="lavender"
        subtitle="One assistant that connects every module. Uses Gemini when an API key is configured; otherwise answers with clearly labeled rule-based logic over your data.">
        <SourceLabel kind={ai === "gemini" ? "gemini" : "rule"} />
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="flex h-[min(72vh,720px)] flex-col !p-0">
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
            <AnimatePresence initial={false}>
              {msgs.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${m.role === "user" ? "bg-blush text-blush-deep" : "bg-lavender text-lavender-deep"}`}>
                    {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
                  </span>
                  <div className={`max-w-[80%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "rounded-tr-md bg-ink text-white" : "rounded-tl-md border border-line bg-cream/70"}`}>
                    <p className="whitespace-pre-line">{m.text}</p>
                    {m.role === "bot" && m.source && <div className="mt-2"><SourceLabel kind={m.source} /></div>}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-lavender text-lavender-deep"><Bot size={16} /></span>
                  <div className="flex items-center gap-1 rounded-3xl border border-line bg-cream/70 px-4 py-3">
                    {[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-lavender-deep" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
          <div className="border-t border-line p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-full bg-lavender/70 px-3 py-1 text-xs font-semibold text-lavender-deep transition hover:bg-lavender-mid disabled:opacity-50">{s}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about deadlines, graduation, CPT/OPT, or careers…"
                className="flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-lavender-deep focus:ring-4 focus:ring-lavender" aria-label="Message" />
              <button type="submit" disabled={busy || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white transition hover:bg-ink/85 disabled:opacity-40" aria-label="Send"><Send size={16} /></button>
            </form>
          </div>
        </Card>

        <Card className="h-fit">
          <div className="mb-3 flex items-center gap-2"><Sparkles size={16} className="text-lavender-deep" /><h2 className="font-display text-xl font-semibold">Automation feed</h2></div>
          <p className="mb-3 text-xs text-muted">Live cross-module alerts. Each one updates the moment you change a module.</p>
          <RecommendationList recs={recs} />
        </Card>
      </div>
    </div>
  );
}
