"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bot,
  Briefcase,
  GraduationCap,
  Globe2,
  LayoutDashboard,
  Menu,
  NotebookPen,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deadlineState } from "@/lib/deadlines";
import { DEMO_STUDENT } from "@/lib/demo-data";
import { useCampus, useNow } from "@/lib/store";
import { useFeedback } from "./feedback";
import { useAiStatus } from "@/lib/ai-client";
import type { Tone } from "./ui";
import { toneBg } from "./ui";

export const NAV: { href: string; label: string; icon: typeof Bell; tone: Tone }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tone: "lavender" },
  { href: "/study-board", label: "Smart Study Board", icon: NotebookPen, tone: "butter" },
  { href: "/graduation", label: "Graduation Planner", icon: GraduationCap, tone: "sage" },
  { href: "/international", label: "International Advisor", icon: Globe2, tone: "powder" },
  { href: "/career", label: "Career Navigator", icon: Briefcase, tone: "blush" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, tone: "lavender" },
];

function DeadlineWatcher() {
  const { assignments, notify, ready } = useCampus();
  const { toast } = useFeedback();
  const now = useNow(30_000);
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ready) return;
    for (const a of assignments) {
      const st = deadlineState(a, now);
      if (st !== "due-2h" && st !== "due-24h" && st !== "overdue") continue;
      const key = `warn-${a.id}-${st}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      const label = st === "due-2h" ? "Due in under 2 hours" : st === "due-24h" ? "Due within 24 hours" : "Overdue";
      notify(`${label}: ${a.title}`, a.course, "study", key);
    }
  }, [assignments, now, notify, ready]);
  // first-load toast for the most urgent item
  const toasted = useRef(false);
  useEffect(() => {
    if (!ready || toasted.current) return;
    toasted.current = true;
    const urgent = assignments.find((a) => deadlineState(a, new Date()) === "due-2h");
    if (urgent) toast(`⏰ ${urgent.title} is due in under 2 hours`, urgent.course, "warning");
  }, [ready, assignments, toast]);
  return null;
}

function NotificationBell() {
  const { notifications, markAllRead } = useCampus();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper shadow-soft transition hover:bg-lavender"
        aria-label={`Notifications (${unread} unread)`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blush-deep px-1 text-[10px] font-bold text-white">{unread}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="card absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-display text-lg font-semibold">Reminders</p>
              <button className="text-xs font-semibold text-lavender-deep hover:underline" onClick={markAllRead}>Mark all read</button>
            </div>
            <div className="scrollbar-thin max-h-80 space-y-1.5 overflow-y-auto">
              {notifications.length === 0 && <p className="p-3 text-sm text-muted">No reminders yet.</p>}
              {notifications.map((n) => (
                <div key={n.id} className={`rounded-2xl px-3 py-2 ${n.read ? "bg-transparent" : "bg-lavender/60"}`}>
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-xs text-muted">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { resetDemo } = useCampus();
  const { toast } = useFeedback();
  const ai = useAiStatus();
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="mb-8 flex items-center gap-3 px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-lavender-mid via-powder-mid to-blush-mid text-ink shadow-soft">
          <Sparkles size={20} />
        </span>
        <span>
          <span className="font-display block text-xl font-semibold leading-tight">CampusPilot</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">AI · Student OS</span>
        </span>
      </Link>
      <nav className="space-y-1">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate}
              className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${active ? "text-ink" : "text-muted hover:bg-white/70 hover:text-ink"}`}>
              {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-paper shadow-soft" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className={`relative flex h-8 w-8 items-center justify-center rounded-xl ${toneBg[n.tone]}`}><n.icon size={16} /></span>
              <span className="relative">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        <div className="rounded-2xl border border-line bg-paper/80 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush font-display text-base font-semibold text-blush-deep">AM</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{DEMO_STUDENT.name}</p>
              <p className="truncate text-[11px] text-muted">SWE · Class of 2028 · demo</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
            <span className={`h-2 w-2 rounded-full ${ai === "gemini" ? "bg-sage-deep" : "bg-butter-deep"}`} />
            {ai === "loading" ? "Checking AI…" : ai === "gemini" ? "Gemini connected" : "AI: rule-based fallback"}
          </div>
        </div>
        <button
          onClick={() => { if (confirm("Reset all demo data in this browser?")) { resetDemo(); toast("Demo data reset", "Fresh fictional data loaded.", "info"); } }}
          className="flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-muted transition hover:bg-white/70 hover:text-ink">
          <RotateCcw size={13} /> Reset demo data
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useCampus();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));

  return (
    <div className="min-h-screen lg:flex">
      <DeadlineWatcher />
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-line/70 bg-cream/60 px-4 py-6 backdrop-blur lg:block">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)}>
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="h-full w-72 bg-cream px-4 py-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
              <button className="absolute right-3 top-3 rounded-full p-2 hover:bg-line/60" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line/60 bg-cream/75 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-full border border-line bg-paper p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <p className="text-sm font-semibold text-muted">{current?.label ?? "CampusPilot"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-dashed border-line px-3 py-1 text-[11px] font-semibold text-muted sm:inline">
              Demo mode · fictional data · LearningBAU sync simulated
            </span>
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {ready ? children : (
            <div className="flex h-[60vh] items-center justify-center text-sm text-muted">Loading your student OS…</div>
          )}
        </main>
        <footer className="px-4 pb-8 text-center text-[11px] text-muted md:px-8">
          CampusPilot AI hackathon prototype · All student, course, and job data is fictional · Not affiliated with or endorsed by Bay Atlantic University · Not legal or immigration advice.
        </footer>
      </div>
    </div>
  );
}
