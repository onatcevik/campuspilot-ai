// Tiny keyword retriever over the curated official-source knowledge base (TOPICS). Used as RAG context for Gemini
// and as the deterministic answer when Gemini isn't configured.
import { TOPICS, type InfoTopic } from "./immigration";

const STOP = new Set(["the", "a", "an", "is", "i", "my", "can", "do", "to", "of", "and", "for", "what", "when", "how", "on", "in", "me", "it", "be", "after", "before"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));

const SYNONYMS: Record<string, string[]> = {
  cpt: ["curricular", "internship", "practical"],
  opt: ["optional", "post-completion", "i-765", "ead", "unemployment"],
  stem: ["extension", "e-verify", "i-983", "24-month"],
  dso: ["designated", "school", "official", "advisor"],
  f1: ["f-1", "status", "i-20", "extension"],
};

export interface Passage { topic: InfoTopic; text: string; score: number }

export function retrieve(query: string, k = 4): Passage[] {
  const q = tokens(query);
  const expanded = new Set(q.flatMap((t) => [t, ...(SYNONYMS[t.replace("-", "")] ?? [])]));
  const passages: Passage[] = [];
  for (const topic of TOPICS) {
    for (const text of [topic.summary, ...topic.points]) {
      const hay = (topic.title + " " + text).toLowerCase();
      let score = 0;
      expanded.forEach((t) => { if (hay.includes(t)) score += q.includes(t) ? 2 : 1; });
      if (score > 0) passages.push({ topic, text, score });
    }
  }
  return passages.sort((a, b) => b.score - a.score).slice(0, k);
}
