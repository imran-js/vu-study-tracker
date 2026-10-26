import { useStudy } from "../../app/context";
import { usesWeeklyFramework } from "../../domain/weekly-framework";

export function Cs101Grading({ courseId }: { courseId?: string }) {
  const { data: d, semesterId } = useStudy();
  if (
    !usesWeeklyFramework(d, semesterId) ||
    !d.courses.some(
      (c) =>
        c.semesterId === semesterId &&
        c.code.trim().toUpperCase() === "CS101" &&
        (!courseId || c.id === courseId),
    )
  )
    return null;
  return (
    <section className="panel" aria-label="CS101 official grading">
      <h2>CS101 · Fall 2026 grading</h2>
      <p>
        Coursework 40 = GDB 5 + Midterm 20 + Semester Quizzes 15. Final Exam 60.
      </p>
      <p>
        To pass, meet all three requirements: at least 8/40 coursework, at least
        12/60 in the final, and overall Net Score more than 40%.
      </p>
      <p className="meta">
        Source: official VU CS101 announcement supplied 26 October 2026. Dates
        take precedence over inconsistent weekday labels. Exam dates are date
        only; no time has been announced here.
      </p>
    </section>
  );
}
