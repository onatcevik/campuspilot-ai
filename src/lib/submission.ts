// Submission availability for overdue assignments. Pure functions used by the store, board, alerts and assistant.
//
// Three separate concepts:
//   - Completed: the student marked the assignment done.
//   - Overdue:   the deadline passed; whether submission is still possible is UNKNOWN unless the student says so.
//   - Closed:    the student reported submission is closed (no verified LMS data exists in this demo).
// A passed deadline never implies "closed", and "closed" never implies "completed".
import { deadlineState, sortForBoard, type DeadlineState } from "./deadlines";
import type { Assignment } from "./types";

export type SubmissionStatus = Assignment["submission"] | "unknown";

export type BoardStatus =
  | "completed"
  | "closed" // student-reported, not completed → Needs Attention
  | "late-allowed" // overdue, student says late submission is allowed
  | "overdue" // overdue, availability unknown
  | Exclude<DeadlineState, "done" | "overdue">; // due-2h | due-24h | upcoming

export function boardStatus(a: Assignment, now: Date): BoardStatus {
  if (a.completed) return "completed";
  if (a.submission === "closed") return "closed";
  const st = deadlineState(a, now);
  if (st === "overdue") return a.submission === "late-allowed" ? "late-allowed" : "overdue";
  return st === "done" ? "completed" : st;
}

export const needsAttention = (a: Assignment) => !a.completed && a.submission === "closed";

export { sortForBoard };

/** Returns a new list with the submission status changed. Never touches `completed`; reversible with "unknown". */
export function setSubmissionStatus(list: Assignment[], id: string, status: SubmissionStatus, now = new Date()): Assignment[] {
  return list.map((a) => {
    if (a.id !== id) return a;
    const next: Assignment = { ...a, submissionUpdatedAt: now.toISOString() };
    if (status === "unknown" || status === undefined) delete next.submission;
    else next.submission = status;
    return next;
  });
}

export const SUBMISSION_LABEL: Record<"late-allowed" | "closed", string> = {
  "late-allowed": "Late submission allowed (you reported)",
  closed: "Submission closed (you reported)",
};

export const NOT_VERIFIED_NOTE =
  "CampusPilot isn't connected to LearningBAU, so it can't verify whether submissions are open or closed. These statuses are what you reported.";
