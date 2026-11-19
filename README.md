# CampusPilot AI

**Plan smarter. Stay on track. Graduate with confidence.**

CampusPilot AI is a student operating system built for a hackathon. It ties together assignments, graduation planning, F-1/CPT/OPT planning and career discovery, and raises risks and opportunities on its own instead of waiting for questions.

> Hackathon prototype. The student (Alex Morgan), courses, degree requirements and job listings are all **fictional**. It is not affiliated with or endorsed by Bay Atlantic University. The LearningBAU integration is **simulated**. Nothing here is legal or immigration advice.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app runs with no API key.

### Optional: Gemini (free tier only)

CampusPilot calls Gemini **only from the server** (`/api/ai`). The key is never sent to the browser, never returned in responses, and never logged.

**Free-tier safeguards in code**
- Model allowlist: `gemini-3.5-flash-lite` (default) and `gemini-3.1-flash-lite`. Both are listed as "Free of charge" on the Free Tier on the official pricing page (checked Nov 2026). Any other model turns AI off. No automatic model switching, and answers served by a different `modelVersion` are discarded.
- Local limits: 8 requests/minute and 150/day by default. Hard caps of 10 and 200 can't be raised through environment variables.
- 10-minute cache and de-duplication of identical requests, 20 s timeout, no automatic retries.
- HTTP 429 (quota): the server stops calling Gemini for the retry delay Google returns (60 s if none). The UI shows the reason and uses the rule-based answer.
- HTTP 401/402/403 (billing, permissions, verification): a 10-minute pause, never retried in a loop.

**What code cannot guarantee:** if a billing account is linked to your Google Cloud project, that project is on a paid tier and usage can be charged. Code can't change that. Keep the project on the **Free** tier, as described below.

**Setup**
1. Open **https://aistudio.google.com** and sign in.
2. Go to **Dashboard → API Keys → Create API key**. New accounts get a default project.
3. Go to **Dashboard → Projects**. In the **Billing Tier** column, the project should show **Free**, with a "Set up billing" link. That link means no billing account is attached. Don't click it.
4. In the project folder, copy `.env.example` to `.env.local` and paste the key after `GEMINI_API_KEY=`. `.env.local` is git-ignored.
5. Restart `npm run dev`. The sidebar should show "Gemini connected" and the assistant should show "Gemini free tier · gemini-3.5-flash-lite".

To check the key without printing it:

```bash
grep -qE '^GEMINI_API_KEY=[^[:space:]"]+$' .env.local && echo "Key is set" || echo "Key missing"
```

**Fallback messages you may see** (the assistant always still answers, using rule-based logic):

| Situation | What the assistant shows |
|---|---|
| No key | "Rule-based mode (Gemini not configured)" |
| Wrong key | "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local…" |
| Free quota used up (429) | "The Gemini free-tier limit was reached. Try again in about N s… No charges are made by falling back." |
| CampusPilot's own limit | "CampusPilot's own request limit was reached to protect your free quota." |
| Model not on the allowlist | "AI off: model not on free-tier allowlist" |
| AI answer fails verification | "Gemini's answer was withheld because it failed verification (reason)…" |

Free-tier prompts may be used by Google to improve its products. CampusPilot sends only minimized, fictional demo facts, never names, notes or keys.

### Optional: live internship data

```bash
# in .env.local
JOB_LEVER_COMPANIES=examplecompany
JOB_GREENHOUSE_BOARDS=exampleboard
```

`/api/jobs` reads the **public** Greenhouse and Lever job-board APIs on the server. No key is needed and no student data is sent. It keeps DC/VA/MD internship, co-op and new-grad tech roles, caches results for 30 minutes, and handles each board separately, so one failing board doesn't break the page. A live listing shows:

- an apply link that is verified to be `https` on `greenhouse.io` / `lever.co`
- the provider's posting date ("Posted" or "Updated"), with a warning when it's more than 120 days old
- the provider's deadline only when the API supplies one

**Work authorization for live listings is always "Unknown".** It is never inferred from posting text.

### Tests

```bash
npm test
```

Vitest covers match calculations (including a regression check against the original demo scores), filtering, saved jobs, application tracking, cross-module sync, the AI-output sanitizer and the job normalizers.

## What is AI, what is deterministic, what is demo data

| Feature | Logic | Data |
|---|---|---|
| Match score and score breakdown | Deterministic (weighted skill coverage) | Demo listings, plus live listings if configured |
| Career fit analysis | **Gemini** when a key is set, deterministic otherwise. AI output is validated against verified facts, and unsupported skills, courses or employer-policy claims are removed | Profile skills, the listing, the graduation plan |
| Skill-development plan | Deterministic. With Gemini, the wording is AI-written, but skills and courses are still checked against verified data | Graduation Planner courses |
| Academic availability | Deterministic heuristic (planned credits per term) | Graduation Planner |
| CPT/OPT guidance per listing | Deterministic: cited USCIS rules plus what the listing itself states | International Advisor profile |
| Work-authorization label | From the listing text only. Live listings are always "Unknown" | Demo or live listing |
| Career tasks on the Study Board | Deterministic suggestions, added only after the user confirms | Study Board (localStorage) |
| **CampusPilot Assistant: answer facts** (credits, prerequisites, dates, scenarios, match scores, workload) | Always deterministic: the existing engines produce numbered facts `F#` | Only the modules the question needs |
| **Assistant: answer wording** | **Gemini (`gemini-3.5-flash-lite`, free tier). Verified with real API responses on Nov 19, 2026.** Active when a key is set. The answer must cite facts `[F#]` and official passages `[S#]`. It's rejected if it uses numbers not in the facts, cites anything unknown, makes an eligibility decision, or makes a sponsorship claim. Otherwise, or if rejected, a rule-based answer is shown with the reason | Facts + official-source library |
| **Assistant actions** (Study Board tasks, advisor/DSO email drafts, navigation) | Always deterministic. The model can't add actions, and tasks are created only after explicit confirmation | Study Board (localStorage) |
| Daily briefing, study-plan explanation | Gemini when a key is set, rule-based otherwise | All modules |
| Student, courses, degree program | | **Fictional demo data** |

### Production build

```bash
npm run build && npm start
```

## Modules

| Module | What works |
|---|---|
| **Dashboard** | Personalized greeting, daily briefing, cross-module priority alerts, weekly progress ring, deadlines, graduation, immigration and career cards, quick navigation |
| **Smart Study Board** | Sticky-note CRUD. Completed notes turn gray with a green check (no strikethrough) and trigger confetti and balloons; finishing the whole week triggers a bigger celebration. Also: 24h/2h/overdue states, a weekly progress bar, a day strip, filters, in-app reminders and a rule-based study-week planner |
| **Graduation Planner** | Fictional 120-credit B.S. SWE program. Credit and requirement progress, a semester roadmap where each course can be moved with a dropdown, deterministic prerequisite validation, overload checks, projected graduation date, a prerequisite map, Standard vs. Accelerated scenarios from a critical-path scheduler, and an advisor email draft |
| **International Student Advisor** | Guidance on F-1, CPT, OPT, STEM OPT and working with the DSO, with official source links. Timeline dates come from cited USCIS timing rules (90 days before / 60 days after the program end); items without a rule are labeled planning guidance. Also: checklist, DSO email, retrieval over curated official summaries, and a link to the Graduation Planner that flags an I-20 extension risk |
| **Career Navigator** | Skill-match score (60% required, 25% preferred, 10% field, 5% location) with a breakdown of each score. Saved roles, plus filters for status, source and work authorization. A detail drawer has an AI or rule-based fit analysis, a skill plan linked to planned courses, academic availability from the Graduation Planner, CPT/OPT guidance from the International Advisor, and Study Board tasks added with confirmation. Optional live job-board data |
| **CampusPilot Assistant** | One assistant across all modules, also reachable from the "Ask CampusPilot" box on the dashboard. Each answer shows which modules were used, the deterministic facts behind it, links to official sources, and action buttons (tasks need confirmation). Gemini, when enabled, receives only the facts relevant to the question: never the student's name, notes, or raw state |

## Architecture

- Next.js 15 (App Router) with TypeScript, Tailwind CSS v4, Framer Motion, Lucide and canvas-confetti
- `src/lib/types.ts` holds the domain interfaces (Student, Course, Assignment, DegreeRequirement, Prerequisite, SemesterPlan, ImmigrationMilestone, CareerOpportunity, Recommendation)
- `src/lib/store.tsx` is a React context that persists to `localStorage`. It can be swapped for a database later.
- Pure logic engines: `graduation.ts`, `immigration.ts`, `matching.ts`, `recommendations.ts`, `workload.ts`, `assistant.ts`, `retrieval.ts`
- `profile.ts`: the shared student profile, derived from the store, the graduation plan and the international profile, so modules don't duplicate data
- Career: `career-analysis.ts` (analysis and AI sanitizer), `career-guidance.ts`, `career-tasks.ts`, `career-state.ts`
- `jobs/normalize.ts` (pure) and `jobs/providers.ts` (server) back the `/api/jobs` route
- `lib/assistant/`: `context.ts` (intent → typed facts and passages), `answer.ts` (deterministic composer and actions), `validate.ts` (AI answer verification), `actions.ts` (confirmation-gated permission boundary), `index.ts` (orchestration)
- `src/app/api/ai/route.ts` is the server-side Gemini proxy and falls back cleanly when no key is set

Use **Reset demo data** in the sidebar to restore the original demo state. Assignment due dates are seeded relative to the current time, so the warning states always appear during a demo.
