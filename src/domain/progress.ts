import type { Dataset } from "./model";
import {
  minutes,
  minutesByDay,
  weekStart,
  addDays,
  today,
  dayOf,
} from "./dates";
export function progress(
  d: Dataset,
  semesterId: string,
  courseId?: string,
  reportDay = today(d.settings.timezone),
) {
  const courses = d.courses.filter(
    (c) => c.semesterId === semesterId && (!courseId || c.id === courseId),
  );
  const ids = new Set(courses.map((c) => c.id));
  const lectures = d.lectures.filter((l) => ids.has(l.courseId) && !l.excluded);
  const completed = lectures.filter((l) => l.status === "completed");
  const revised = completed.filter((l) =>
    d.revisions.some((r) => r.lectureId === l.id),
  ).length;
  const total =
    courses.length && courses.every((c) => c.lectureTotal !== undefined)
      ? courses.reduce(
          (s, c) =>
            s +
            c.lectureTotal! -
            d.lectures.filter((l) => l.courseId === c.id && l.excluded).length,
          0,
        )
      : undefined;
  const assessments = d.assessments.filter(
    (a) => ids.has(a.courseId) && a.status !== "cancelled",
  );
  const sessions = d.sessions.filter(
    (s) =>
      s.semesterId === semesterId && (!courseId || s.courseId === courseId),
  );
  const intervals = sessions.flatMap((s) => s.intervals);
  const days = minutesByDay(intervals, d.settings.timezone);
  const now = today(d.settings.timezone),
    start = weekStart(reportDay, d.settings.weekStart),
    end = addDays(start, 7);
  const weekMinutes = Object.entries(days)
    .filter(([day]) => day >= start && day < end)
    .reduce((s, [, n]) => s + n, 0);
  const scheduled = sessions.filter(
    (s) =>
      s.status !== "cancelled" &&
      s.plannedStart &&
      dayOf(s.plannedStart, d.settings.timezone) >= start &&
      dayOf(s.plannedStart, d.settings.timezone) < end,
  );
  return {
    total,
    completed: completed.length,
    entered: lectures.length,
    revised,
    revisionDue: completed.filter(
      (l) => l.nextRevision && l.nextRevision <= now,
    ).length,
    assessmentTotal: assessments.length,
    assessmentDone: assessments.filter((a) =>
      ["submitted", "completed"].includes(a.status),
    ).length,
    totalMinutes: minutes(intervals),
    weekMinutes,
    scheduledTotal: scheduled.length,
    scheduledDone: scheduled.filter((s) => s.status === "completed").length,
    days,
  };
}
