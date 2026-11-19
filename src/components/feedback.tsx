"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Mail, PartyPopper, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";
import { Button, inputCls, SourceLabel } from "./ui";

type ToastTone = "success" | "info" | "warning";
interface Toast { id: number; title: string; body?: string; tone: ToastTone }
interface Draft { title: string; subject: string; body: string; source: "rule" | "gemini" }

interface FeedbackCtx {
  toast: (title: string, body?: string, tone?: ToastTone) => void;
  celebrate: (big?: boolean) => void;
  openDraft: (d: Draft) => void;
}

const Ctx = createContext<FeedbackCtx | null>(null);
export const useFeedback = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback outside provider");
  return c;
};

const BALLOON_COLORS = ["#cfc3f2", "#bcd8ba", "#b7d2ee", "#f2bccb", "#f3df8e"];
const CONFETTI_COLORS = ["#6f5cc2", "#4f8558", "#46729f", "#bb5672", "#e8c547", "#cfc3f2", "#f2bccb"];

interface Balloon { id: number; left: number; color: string; delay: number; duration: number; scale: number; sway: number }

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [bigWin, setBigWin] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState(false);

  const toast = useCallback((title: string, body?: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const celebrate = useCallback((big = false) => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fire = (opts: confetti.Options) => confetti({ colors: CONFETTI_COLORS, disableForReducedMotion: true, ...opts });
    fire({ particleCount: big ? 160 : 90, spread: big ? 110 : 75, origin: { y: 0.7 }, startVelocity: big ? 55 : 42 });
    if (big) {
      setTimeout(() => fire({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.75 } }), 250);
      setTimeout(() => fire({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.75 } }), 450);
      setTimeout(() => fire({ particleCount: 140, spread: 160, origin: { y: 0.35 }, scalar: 1.2 }), 900);
      setBigWin(true);
    }
    if (reduce) return;
    const count = big ? 16 : 7;
    const batch = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i + Math.random(),
      left: 4 + Math.random() * 90,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
      delay: Math.random() * (big ? 1.2 : 0.5),
      duration: 3.2 + Math.random() * 1.8,
      scale: 0.75 + Math.random() * 0.6,
      sway: (Math.random() - 0.5) * 80,
    }));
    setBalloons((b) => [...b, ...batch]);
    setTimeout(() => setBalloons((b) => b.filter((x) => !batch.includes(x))), 6500);
  }, []);

  const openDraft = useCallback((d: Draft) => {
    setCopied(false);
    setDraft(d);
  }, []);

  const toneCls: Record<ToastTone, string> = {
    success: "border-sage-mid bg-sage",
    info: "border-powder-mid bg-powder",
    warning: "border-butter-mid bg-butter",
  };

  return (
    <Ctx.Provider value={{ toast, celebrate, openDraft }}>
      {children}

      {/* Balloons */}
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
        {balloons.map((b) => (
          <motion.div
            key={b.id}
            className="absolute bottom-[-140px]"
            style={{ left: `${b.left}%` }}
            initial={{ y: 0, x: 0, opacity: 0.95 }}
            animate={{ y: "-125vh", x: [0, b.sway, -b.sway / 2, b.sway / 3], rotate: [0, 6, -5, 3] }}
            transition={{ duration: b.duration, delay: b.delay, ease: "easeOut" }}
          >
            <svg width={64 * b.scale} height={120 * b.scale} viewBox="0 0 64 120">
              <ellipse cx="32" cy="34" rx="26" ry="32" fill={b.color} />
              <ellipse cx="22" cy="22" rx="6" ry="10" fill="white" opacity="0.45" />
              <path d="M28 66 L36 66 L32 72 Z" fill={b.color} />
              <path d="M32 72 C 26 86, 38 96, 30 118" stroke="#77737f" strokeWidth="1.3" fill="none" />
            </svg>
          </motion.div>
        ))}
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className={`rounded-2xl border px-4 py-3 shadow-lift ${toneCls[t.tone]}`}
              role="status"
            >
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-ink/70">{t.body}</p>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Big weekly celebration */}
      <AnimatePresence>
        {bigWin && (
          <motion.div className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/20 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBigWin(false)}>
            <motion.div initial={{ scale: 0.7, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 14 }}
              className="card max-w-md p-8 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-butter text-butter-deep"><PartyPopper size={30} /></div>
              <h2 className="font-display text-3xl font-semibold">Week complete!</h2>
              <p className="mt-2 text-sm text-muted">Every assignment this week is done. That&apos;s how you stay on track — enjoy the breathing room.</p>
              <Button className="mt-6" onClick={() => setBigWin(false)}>Keep going</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email draft modal */}
      <AnimatePresence>
        {draft && (
          <motion.div className="fixed inset-0 z-[65] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDraft(null)}>
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="card flex max-h-[90vh] w-full max-w-2xl flex-col p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={draft.title}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lavender text-lavender-deep"><Mail size={18} /></span>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{draft.title}</h3>
                    <div className="mt-1 flex gap-2"><SourceLabel kind={draft.source} /><span className="text-xs text-muted">Editable · nothing is sent automatically</span></div>
                  </div>
                </div>
                <button onClick={() => setDraft(null)} className="rounded-full p-2 hover:bg-line/60" aria-label="Close"><X size={18} /></button>
              </div>
              <label className="mb-1 text-xs font-semibold text-muted">Subject</label>
              <input className={inputCls} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              <label className="mb-1 mt-3 text-xs font-semibold text-muted">Message</label>
              <textarea className={`${inputCls} min-h-[320px] flex-1 font-[inherit] leading-relaxed`} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>Close</Button>
                <Button onClick={async () => {
                  try { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); setCopied(true); } catch { setCopied(false); toast("Copy failed", "Select the text and copy manually.", "warning"); }
                }}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy email"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
