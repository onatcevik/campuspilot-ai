# PROGRESS

## Completed and tested in the browser
- [x] Foundation: Next.js, TypeScript and Tailwind v4, a pastel design system, responsive sidebar plus mobile drawer, notification center and toasts
- [x] Dashboard: rule-based briefing, cross-module priorities, weekly progress, deadlines, graduation, immigration and career cards
- [x] Study Board: add, edit and delete notes; completion turns the note gray with a green check and fires confetti and balloons; weekly celebration; 24h/2h/overdue states; filters; day strip; study-week planner; persistence (survives reload)
- [x] Workflow: adding an assignment analyzes its deadline, creates a reminder notification, shows a toast and updates the dashboard
- [x] Graduation Planner: prerequisite validation, moving courses between terms, overload checks, two scenarios (Standard → May 2029, Accelerated → May 2028), prerequisite map, advisor email
- [x] Workflow: missing prerequisite raises a dashboard risk alert, which leads to "Generate Advisor Email" and an editable draft
- [x] International Advisor: timeline from cited rules (checked against the USCIS OPT page), labeled planning guidance, checklist, DSO email, source library Q&A, sync with the Graduation Planner. All 7 source links checked and working.
- [x] Career Navigator: explainable matching, save, status tracking, work-authorization transparency, resume tips, skill gaps
- [x] AI Assistant: rule-based intent routing, with the Gemini path wired up
- [x] `tsc`, `eslint` and `next build` all pass. No console errors on the tested pages.

## Remaining / nice to have
- [ ] Test the Gemini path with a real key (only the fallback has been tested)
- [ ] Drag and drop in the roadmap (a dropdown works today)
- [ ] More mobile polish on the Graduation roadmap (it scrolls horizontally)
- [ ] Optional: Escape key closes modals

## Known issues
- Demo data lives in localStorage. Use **Reset demo data** in the sidebar to restore it.
- Credit limits, course offerings and the degree program are illustrative, not BAU policy.
