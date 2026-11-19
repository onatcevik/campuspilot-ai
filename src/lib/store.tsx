"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CAREER,
  DEFAULT_INTL,
  INITIAL_PLAN,
  seedAssignments,
} from "./demo-data";
import { setApplicationStatus, toggleSavedList } from "./career-state";
import type { PlanMap } from "./graduation";
import { setSubmissionStatus, type SubmissionStatus } from "./submission";
import type {
  AppNotification,
  ApplicationStatus,
  Assignment,
  CareerProfile,
  IntlProfile,
  ModuleKey,
} from "./types";

const STORAGE_KEY = "campuspilot:v1";

export interface CampusState {
  assignments: Assignment[];
  plan: PlanMap;
  career: CareerProfile;
  saved: string[];
  statuses: Record<string, ApplicationStatus>;
  intl: IntlProfile;
  notifications: AppNotification[];
}

const makeInitial = (): CampusState => ({
  assignments: seedAssignments(),
  plan: { ...INITIAL_PLAN },
  career: { ...DEFAULT_CAREER },
  saved: ["o1"],
  statuses: { o1: "interested", o6: "applied" },
  intl: { ...DEFAULT_INTL, checklist: { "dso-contact": true } },
  notifications: [
    {
      id: "n-welcome",
      title: "Welcome to CampusPilot AI",
      body: "You're viewing a fictional demo profile. All changes are saved in this browser only.",
      createdAt: new Date().toISOString(),
      read: false,
      module: "assistant",
    },
  ],
});

interface Ctx extends CampusState {
  ready: boolean;
  addAssignment: (a: Omit<Assignment, "id" | "completed">) => Assignment;
  updateAssignment: (id: string, patch: Partial<Assignment>) => void;
  deleteAssignment: (id: string) => void;
  toggleComplete: (id: string) => boolean; // returns new completed value
  setSubmission: (id: string, status: SubmissionStatus) => void;
  setCourseTerm: (courseId: string, termId: string | undefined) => void;
  applyPlan: (plan: PlanMap) => void;
  setCareer: (patch: Partial<CareerProfile>) => void;
  toggleSaved: (id: string) => void;
  setStatus: (id: string, s: ApplicationStatus) => void;
  setIntl: (patch: Partial<IntlProfile>) => void;
  toggleChecklist: (id: string) => void;
  notify: (title: string, body: string, module: ModuleKey, id?: string) => void;
  markAllRead: () => void;
  resetDemo: () => void;
}

const CampusContext = createContext<Ctx | null>(null);

export function CampusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CampusState>(() => makeInitial());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...makeInitial(), ...JSON.parse(raw) });
    } catch {
      /* corrupted or blocked storage: keep defaults */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return; // never write before hydration (StrictMode runs effects twice in dev)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state, ready]);

  const patch = useCallback((fn: (s: CampusState) => Partial<CampusState>) => setState((s) => ({ ...s, ...fn(s) })), []);

  const notify = useCallback(
    (title: string, body: string, module: ModuleKey, id?: string) =>
      patch((s) =>
        id && s.notifications.some((n) => n.id === id)
          ? {}
          : {
              notifications: [
                { id: id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, body, module, read: false, createdAt: new Date().toISOString() },
                ...s.notifications,
              ].slice(0, 30),
            },
      ),
    [patch],
  );

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      ready,
      addAssignment: (a) => {
        const created: Assignment = { ...a, id: `a-${Date.now()}`, completed: false };
        patch((s) => ({ assignments: [...s.assignments, created] }));
        return created;
      },
      updateAssignment: (id, p) =>
        patch((s) => ({ assignments: s.assignments.map((a) => (a.id === id ? { ...a, ...p } : a)) })),
      deleteAssignment: (id) => patch((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) })),
      toggleComplete: (id) => {
        const current = state.assignments.find((a) => a.id === id);
        const next = !current?.completed;
        patch((s) => ({
          assignments: s.assignments.map((a) =>
            a.id === id ? { ...a, completed: next, completedAt: next ? new Date().toISOString() : undefined } : a,
          ),
        }));
        return next;
      },
      setSubmission: (id, status) => patch((s) => ({ assignments: setSubmissionStatus(s.assignments, id, status) })),
      setCourseTerm: (courseId, termId) => patch((s) => ({ plan: { ...s.plan, [courseId]: termId } })),
      applyPlan: (plan) => patch(() => ({ plan: { ...plan } })),
      setCareer: (p) => patch((s) => ({ career: { ...s.career, ...p } })),
      toggleSaved: (id) => patch((s) => ({ saved: toggleSavedList(s.saved, id) })),
      setStatus: (id, st) => patch((s) => ({ statuses: setApplicationStatus(s.statuses, id, st) })),
      setIntl: (p) => patch((s) => ({ intl: { ...s.intl, ...p } })),
      toggleChecklist: (id) =>
        patch((s) => ({ intl: { ...s.intl, checklist: { ...s.intl.checklist, [id]: !s.intl.checklist[id] } } })),
      notify,
      markAllRead: () => patch((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      resetDemo: () => setState(makeInitial()),
    }),
    [state, ready, patch, notify],
  );

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus() {
  const ctx = useContext(CampusContext);
  if (!ctx) throw new Error("useCampus must be used inside CampusProvider");
  return ctx;
}

/** Ticking clock so deadline states (24h / 2h / overdue) update live during a demo. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
