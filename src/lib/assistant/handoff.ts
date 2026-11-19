// Hands a question from the dashboard to the assistant page via sessionStorage (never via the URL).
export const PENDING_QUESTION_KEY = "campuspilot:pending-question";

export function handOffQuestion(q: string): boolean {
  try {
    sessionStorage.setItem(PENDING_QUESTION_KEY, q.slice(0, 500));
    return true;
  } catch {
    return false;
  }
}
