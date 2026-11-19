// Pure normalizers for public job-board APIs → CareerOpportunity. No network access here (unit-tested with fixtures).
// Policy: work authorization is ALWAYS "unknown" for live listings. We never infer CPT/OPT acceptance or sponsorship
// from posting text or from missing information; students must read the original posting and ask the employer.
import type { CareerField, CareerOpportunity } from "../types";

export const LIVE_WORK_AUTH_NOTE =
  "Real posting. CampusPilot does not infer CPT/OPT acceptance or visa sponsorship from posting text. Read the original posting and ask the employer.";

const SKILL_PATTERNS: [string, RegExp][] = [
  ["TypeScript", /\btypescript\b/i], ["JavaScript", /\bjavascript\b/i], ["React", /\breact(\.js)?\b/i],
  ["Next.js", /\bnext\.?js\b/i], ["Node.js", /\bnode\.?js\b/i], ["Python", /\bpython\b/i],
  ["Java", /\bjava\b(?!\s*script)/i], ["C++", /c\+\+/i], ["Go", /\bgolang\b/i], ["SQL", /\bsql\b/i],
  ["PostgreSQL", /\bpostgres(ql)?\b/i], ["Git", /\bgit\b/i], ["Docker", /\bdocker\b/i],
  ["Kubernetes", /\b(kubernetes|k8s)\b/i], ["AWS", /\b(aws|amazon web services)\b/i], ["Azure", /\bazure\b/i],
  ["Linux", /\blinux\b/i], ["Networking", /\b(networking|tcp\/ip)\b/i], ["Security+", /security\+/i],
  ["PyTorch", /\bpytorch\b/i], ["TensorFlow", /\btensorflow\b/i], ["scikit-learn", /\b(scikit-learn|sklearn)\b/i],
  ["Pandas", /\bpandas\b/i], ["Statistics", /\bstatistic(s|al)\b/i], ["Machine Learning", /\bmachine learning\b/i],
  ["LLMs", /\b(llms?|large language models?)\b/i], ["Data Visualization", /\b(data visuali[sz]ation|tableau|power bi)\b/i],
  ["Figma", /\bfigma\b/i], ["HTML/CSS", /\b(html|css)\b/i], ["REST APIs", /\brest(ful)?\s+apis?\b/i],
  ["Terraform", /\bterraform\b/i], ["Splunk", /\bsplunk\b/i], ["Agile", /\b(agile|scrum)\b/i],
];

export function extractSkills(text: string, max = 8): string[] {
  return SKILL_PATTERNS.filter(([, re]) => re.test(text)).map(([s]) => s).slice(0, max);
}

const NOVA = /\b(arlington|alexandria|reston|herndon|mclean|tysons|fairfax|vienna|chantilly|ashburn|rosslyn|falls church|leesburg|sterling|crystal city|northern virginia)\b/i;
const MD = /\b(bethesda|rockville|silver spring|college park|baltimore|columbia,?\s*md|gaithersburg|annapolis|fort meade|laurel|greenbelt|hyattsville|germantown|frederick|maryland)\b|,\s*md\b/i;
const DC = /\bwashington,?\s*(d\.?\s?c\.?|district of columbia)\b|\bdistrict of columbia\b|^dc\b|,\s*dc\b/i;

export function detectRegion(location: string): CareerOpportunity["region"] | null {
  if (DC.test(location)) return "Washington, DC";
  if (NOVA.test(location)) return "Northern Virginia";
  if (MD.test(location)) return "Maryland";
  return null;
}

export function detectType(title: string): CareerOpportunity["type"] | null {
  if (/\bintern(ship)?s?\b/i.test(title)) return "Internship";
  if (/\bco-?op\b/i.test(title)) return "Co-op";
  if (/\b(new grad(uate)?|university grad(uate)?|early career|entry[- ]level|graduate (software|engineer|program))\b/i.test(title)) return "Full-time (new grad)";
  return null;
}

const TECH_TITLE = /\b(engineer\w*|developer|software|data|machine learning|ml|ai|\w*security|cyber\w*|cloud|devops|sre|analyst|scien\w*)\b/i;

export function detectField(text: string): CareerField {
  if (/\b(cyber\w*|\w*security|soc analyst|infosec)\b/i.test(text)) return "Cybersecurity";
  if (/\b(machine learning|ml engineer|deep learning)\b/i.test(text)) return "Machine Learning";
  if (/\b(data scien\w*|data engineer\w*|analytics|data analyst)\b/i.test(text)) return "Data Science";
  if (/\b(artificial intelligence|ai|llm|genai)\b/i.test(text)) return "Artificial Intelligence";
  if (/\b(cloud|devops|sre|site reliability|infrastructure|platform engineer\w*)\b/i.test(text)) return "Cloud Computing";
  return "Software Engineering";
}

export function detectRemote(location: string, workplaceType?: string): CareerOpportunity["remote"] {
  const w = (workplaceType ?? "").toLowerCase();
  if (w === "remote" || /\bremote\b/i.test(location)) return "Remote";
  if (w === "hybrid" || /\bhybrid\b/i.test(location)) return "Hybrid";
  return "On-site";
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&amp;": "&" };
export function htmlToText(html: string): string {
  const decoded = html.replace(/&(lt|gt|quot|#39|nbsp|amp);/g, (m) => ENTITIES[m] ?? m);
  return decoded.replace(/<[^>]+>/g, " ").replace(/&(lt|gt|quot|#39|nbsp|amp);/g, (m) => ENTITIES[m] ?? m).replace(/\s+/g, " ").trim();
}

/** Only accept https URLs on the provider's own job-board domains. */
export function verifiedUrl(url: unknown, allowedHosts: string[]): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}

const isoOrUndefined = (v: unknown): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

function build(base: {
  id: string; company: string; title: string; location: string; text: string; remote: CareerOpportunity["remote"];
  source: Extract<CareerOpportunity["source"], { kind: "live" }>;
}): CareerOpportunity | null {
  const region = detectRegion(base.location);
  const type = detectType(base.title);
  if (!region || !type || !TECH_TITLE.test(base.title)) return null;
  return {
    id: base.id,
    company: base.company,
    role: base.title,
    type,
    field: detectField(`${base.title} ${base.text.slice(0, 600)}`),
    location: base.location,
    region,
    remote: base.remote,
    requiredSkills: extractSkills(`${base.title} ${base.text}`),
    preferredSkills: [],
    skillsExtracted: true,
    workAuth: "unknown",
    workAuthNote: LIVE_WORK_AUTH_NOTE,
    description: base.text.slice(0, 220) + (base.text.length > 220 ? "…" : ""),
    source: base.source,
  };
}

/** Greenhouse Job Board API: GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true */
export function normalizeGreenhouse(json: unknown, boardToken: string, fetchedAt: string): CareerOpportunity[] {
  const jobs = (json as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((raw) => {
    const j = raw as Record<string, unknown>;
    const applyUrl = verifiedUrl(j.absolute_url, ["greenhouse.io"]);
    if (!applyUrl || typeof j.title !== "string") return [];
    const location = String((j.location as { name?: string })?.name ?? "");
    const posted = isoOrUndefined(j.first_published);
    const updated = isoOrUndefined(j.updated_at);
    const o = build({
      id: `gh-${boardToken}-${j.id}`,
      company: typeof j.company_name === "string" && j.company_name ? j.company_name : boardToken,
      title: j.title.trim(),
      location,
      text: htmlToText(String(j.content ?? "")),
      remote: detectRemote(location),
      source: {
        kind: "live", provider: "greenhouse", providerLabel: "Greenhouse job board", boardId: boardToken, applyUrl,
        postedAt: posted ?? updated, postedAtLabel: posted ? "Posted" : "Updated",
        deadline: isoOrUndefined(j.application_deadline), fetchedAt,
      },
    });
    return o ? [o] : [];
  });
}

/** Lever Postings API: GET api.lever.co/v0/postings/{company}?mode=json */
export function normalizeLever(json: unknown, company: string, fetchedAt: string): CareerOpportunity[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    const j = raw as Record<string, unknown>;
    const applyUrl = verifiedUrl(j.hostedUrl, ["lever.co"]);
    if (!applyUrl || typeof j.text !== "string") return [];
    const cats = (j.categories ?? {}) as { location?: string };
    const location = String(cats.location ?? "");
    const o = build({
      id: `lv-${company}-${j.id}`,
      company,
      title: j.text.trim(),
      location,
      text: String(j.descriptionPlain ?? j.descriptionBodyPlain ?? ""),
      remote: detectRemote(location, typeof j.workplaceType === "string" ? j.workplaceType : undefined),
      source: {
        kind: "live", provider: "lever", providerLabel: "Lever job board", boardId: company, applyUrl,
        postedAt: isoOrUndefined(j.createdAt), postedAtLabel: "Posted", fetchedAt,
      },
    });
    return o ? [o] : [];
  });
}

/** Postings older than this are flagged — job boards sometimes keep evergreen or stale listings open. */
export const STALE_DAYS = 120;
export function isStale(postedAt: string | undefined, now = new Date()): boolean {
  if (!postedAt) return false;
  return (now.getTime() - new Date(postedAt).getTime()) / 86_400_000 > STALE_DAYS;
}
