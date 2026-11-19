# CampusPilot AI: demo script (about 4 minutes)

**Before you start:** open http://localhost:3000, click **Reset demo data** in the sidebar, and use a laptop-size window.

---

### 0:00 The problem (30s)
"University students juggle a lot of separate systems: the LMS for assignments, a degree audit for graduation, the international office for visas, and job boards for careers. None of them talk to each other. International students carry the most risk, because a delayed course can affect their I-20, their CPT or their OPT. We built **CampusPilot AI**, a student operating system that connects all of these and points out risks before they turn into problems."

### 0:30 Dashboard (40s)
- "This is Alex Morgan, a fictional Software Engineering student. The daily briefing is generated from all five modules at once."
- Point to **Today's priorities**: an overdue assignment, one due in under 2 hours, a **graduation risk**, an immigration milestone and career matches.
- "This isn't a chatbot waiting for a question. It brings these up on its own."

### 1:10 Smart Study Board (60s)
- Open the board. Point out the sticky notes, the red pulse on urgent cards, and the 24h and 2h badges.
- **Complete a card**: it turns gray, gets a green check (no strikethrough), and fires confetti and balloons while the progress bar updates.
- **Add an assignment** due tomorrow: a reminder is created and the notification bell updates.
- Click **Plan my study week** to show the deadline-first hour plan.
- (Optional) Complete the rest of the week to show the **big celebration**.

### 2:10 Graduation Planner (50s)
- "Alex put Advanced Software Engineering in the same term as Programming II, which is its prerequisite."
- Point to the red warning and the prerequisite map.
- Compare scenarios: **Standard → May 2029**, **Accelerated → May 2028**. "Course order alone can delay graduation by a full year."
- Click **Apply Accelerated**: the plan becomes valid and the dashboard alert clears.
- Click **Generate Advisor Email** to show the editable draft.

### 3:00 International Student Advisor (40s)
- "This is what sets us apart. Dates are calculated only from cited USCIS rules, such as the OPT filing window opening 90 days before the program end date and closing 60 days after it. Everything else is clearly labeled as planning guidance."
- Show the source chips, the checklist, and the **DSO email**.
- "It's connected to the Graduation Planner. If the plan slips past the I-20 end date, it tells you to talk to your DSO about an extension."

### 3:40 Career Navigator and AI Assistant (30s)
- Show the match scores and click **why?** to see how a score is calculated.
- Show the four work-authorization labels: "We never assume an employer accepts CPT or OPT."
- In the Assistant, ask "Am I on track to graduate?" It answers from live data, and works with Gemini or without it.

### 4:10 Close (20s)
"CampusPilot AI uses fictional data and simulated integrations today, but it's modular, so a university could plug in its own catalog, LMS and advising workflows. **Plan smarter. Stay on track. Graduate with confidence.**"

---
**If a judge asks:** "Is the AI real?" Gemini runs through a server route when a key is set. Without a key, every output is labeled rule-based, and we never present deterministic output as AI.
