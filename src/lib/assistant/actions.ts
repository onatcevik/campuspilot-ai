// Assistant actions. Actions are generated ONLY by deterministic code (never by the model).
// Anything that modifies student data must pass through applyAction() with { confirmed: true }.
import type { Assignment } from "../types";

export type ProposedAction =
  | { id: string; kind: "create-task"; label: string; mutates: true; task: Omit<Assignment, "id" | "completed"> }
  | { id: string; kind: "draft-email"; label: string; mutates: false; to: "advisor" | "dso" | "professor"; assignmentId?: string }
  | { id: string; kind: "open"; label: string; mutates: false; href: string };

export const ALLOWED_HREFS = ["/", "/study-board", "/graduation", "/international", "/career", "/assistant"];

export type ActionResult =
  | { ok: true; kind: "task-created"; assignment: Assignment }
  | { ok: true; kind: "no-data-change" }
  | { ok: false; reason: "confirmation-required" | "invalid-action" | "duplicate" | "past-due-date" | "disallowed-link" };

export function makeTaskAction(id: string, label: string, title: string, notes: string, hours: number, due: Date, priority: Assignment["priority"] = "medium"): ProposedAction {
  return {
    id, kind: "create-task", label, mutates: true,
    task: { course: "CampusPilot Assistant", title, dueDate: due.toISOString(), priority, color: "lavender", estimatedHours: hours, notes, origin: { module: "assistant", actionId: id } },
  };
}

export function dueIn(now: Date, days: number, hour = 18): Date {
  const d = new Date(now.getTime() + days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.getTime() <= now.getTime() ? new Date(now.getTime() + 4 * 3600_000) : d;
}

/**
 * Permission boundary. Pure: returns the result and, for confirmed task creation, the new assignment
 * (the caller adds it through the store). Without explicit confirmation nothing is created.
 */
export function applyAction(
  action: ProposedAction,
  opts: { confirmed: boolean; existing: Assignment[]; now: Date; dueOverride?: string },
): ActionResult {
  if (!action || typeof action !== "object" || !("kind" in action)) return { ok: false, reason: "invalid-action" };
  if (action.kind === "open") return ALLOWED_HREFS.includes(action.href) ? { ok: true, kind: "no-data-change" } : { ok: false, reason: "disallowed-link" };
  if (action.kind === "draft-email") return { ok: true, kind: "no-data-change" }; // opens an editable draft; nothing is sent
  if (action.kind !== "create-task" || action.mutates !== true) return { ok: false, reason: "invalid-action" };
  if (opts.confirmed !== true) return { ok: false, reason: "confirmation-required" };
  const t = action.task;
  const title = (t.title ?? "").trim();
  if (!title || title.length > 140 || t.origin?.module !== "assistant") return { ok: false, reason: "invalid-action" };
  const due = new Date(opts.dueOverride ?? t.dueDate);
  if (Number.isNaN(due.getTime())) return { ok: false, reason: "invalid-action" };
  if (due.getTime() <= opts.now.getTime()) return { ok: false, reason: "past-due-date" };
  if (opts.existing.some((a) => !a.completed && a.title.trim().toLowerCase() === title.toLowerCase())) return { ok: false, reason: "duplicate" };
  return {
    ok: true,
    kind: "task-created",
    assignment: { ...t, title, dueDate: due.toISOString(), id: `a-${opts.now.getTime()}`, completed: false },
  };
}
