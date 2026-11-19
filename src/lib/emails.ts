import { DEMO_STUDENT } from "./demo-data";
import { courseById, termById, termToGraduationDate, type PlanValidation } from "./graduation";
import { fmtDate } from "./immigration";
import type { IntlProfile } from "./types";

export function advisorEmail(v: PlanValidation): { subject: string; body: string } {
  const issues = v.prereqIssues.map((i) => `• ${i.message}`);
  const loads = v.loadIssues.map((l) => `• ${l.message}`);
  const unscheduled = v.unscheduled.length
    ? [`• These required courses are not yet scheduled: ${v.unscheduled.map((id) => courseById[id].code).join(", ")}.`]
    : [];
  const lines = [...issues, ...loads, ...unscheduled];
  const projected = termToGraduationDate(v.projectedTerm);
  return {
    subject: `Course planning question — ${DEMO_STUDENT.name}, ${DEMO_STUDENT.major}`,
    body: `Dear Academic Advisor,

I hope you are doing well. I am ${DEMO_STUDENT.name}, a ${DEMO_STUDENT.major} student targeting graduation in ${DEMO_STUDENT.expectedGraduation}. While reviewing my course plan, I found the following items I would like your guidance on:

${lines.length ? lines.join("\n") : "• My plan currently has no detected conflicts, but I would like to confirm it with you."}

My current plan projects graduation in ${projected}. Could we review my course sequence together and confirm the best way to stay on track? I am also open to summer courses if that helps.

Would you be available for a short meeting this week or next? I am happy to adjust to your schedule.

Thank you for your time and support.

Best regards,
${DEMO_STUDENT.name}
${DEMO_STUDENT.major}`,
  };
}

export function dsoEmail(p: IntlProfile, projectedTermId?: string): { subject: string; body: string } {
  const projected = projectedTermId ? termToGraduationDate(termById[projectedTermId]) : null;
  return {
    subject: `Questions about CPT/OPT planning — ${DEMO_STUDENT.name}`,
    body: `Dear Designated School Official,

My name is ${DEMO_STUDENT.name}, and I am an F-1 student in the ${DEMO_STUDENT.major} program. My Form I-20 lists a program end date of ${fmtDate(p.programEndDate)}${projected ? `, and my current academic plan projects completion in ${projected}` : ""}.

I would like to plan ahead and ask a few questions:
${p.cptInterest ? "• Am I eligible for CPT for a summer internship, and how does CPT fit my curriculum requirements?\n" : ""}• What is the process and timeline for requesting a post-completion OPT recommendation?
${p.stemInterest ? "• Is my degree program's CIP code on the DHS STEM Designated Degree Program List?\n" : ""}• Are there any documents I should prepare in advance?

I understand that work authorization must be confirmed through the official process before I begin any employment. Could I schedule a short appointment to discuss this?

Thank you for your help.

Best regards,
${DEMO_STUDENT.name}`,
  };
}
