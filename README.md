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

### Optional: Gemini

```bash
cp .env.example .env.local   # then set GEMINI_API_KEY
npm run dev
```

Once a key is set, the sidebar shows "Gemini connected" and these features use Gemini through the server route `/api/ai`. The key never reaches the browser:

- Dashboard: "Rewrite with Gemini" for the daily briefing
- Study Board: "Explain with Gemini" for the study plan
- International Advisor: answers grounded only in passages from the curated official-source library
- AI Assistant: chat that gets a snapshot of every module as context

Without a key, each of these falls back to deterministic logic, and the output is labeled **"Rule-based (deterministic)"**.

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
| **Career Navigator** | Skill-match score (60% required skills, 25% preferred, 10% field, 5% location) with an explanation of each score, saved roles, application status tracking, four work-authorization categories (confirmed / verification required / unknown / restricted) and resume tips based on skill gaps |
| **AI Assistant** | Chat that can read every module, with a live feed of automation alerts |

## Architecture

- Next.js 15 (App Router) with TypeScript, Tailwind CSS v4, Framer Motion, Lucide and canvas-confetti
- `src/lib/types.ts` holds the domain interfaces (Student, Course, Assignment, DegreeRequirement, Prerequisite, SemesterPlan, ImmigrationMilestone, CareerOpportunity, Recommendation)
- `src/lib/store.tsx` is a React context that persists to `localStorage`. It can be swapped for a database later.
- Pure logic engines: `graduation.ts`, `immigration.ts`, `matching.ts`, `recommendations.ts`, `workload.ts`, `assistant.ts`, `retrieval.ts`
- `src/app/api/ai/route.ts` is the server-side Gemini proxy and falls back cleanly when no key is set

Use **Reset demo data** in the sidebar to restore the original demo state. Assignment due dates are seeded relative to the current time, so the warning states always appear during a demo.
