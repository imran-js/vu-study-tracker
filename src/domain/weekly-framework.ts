import { Temporal } from "@js-temporal/polyfill";
import type { Dataset } from "./model";

export const frameworkStart = "2026-10-26";
export const weeklySubjects = [
  "CS101",
  "ENG101",
  "MGT101",
  "MGT211",
  "ISL202",
] as const;
export const weeklyLabels = [...weeklySubjects, "Practice", "Catch-up"];
export const weekdayIndex = (day: string) =>
  Temporal.PlainDate.from(day).dayOfWeek - 1;
export const weeklyUnitNumber = (day: string) =>
  3 +
  Math.floor(
    Temporal.PlainDate.from(frameworkStart).until(Temporal.PlainDate.from(day))
      .days / 7,
  );
export function weeklyUnit(d: Dataset, courseId: string, day: string) {
  return d.lectures.find(
    (l) =>
      l.courseId === courseId &&
      !l.excluded &&
      l.number === weeklyUnitNumber(day),
  );
}
export function usesWeeklyFramework(d: Dataset, semesterId: string) {
  const semester = d.semesters.find((s) => s.id === semesterId);
  return !!semester && /fall\s*2026/i.test(semester.name);
}
export function fixedDay(d: Dataset, semesterId: string, day: string) {
  return day >= frameworkStart && usesWeeklyFramework(d, semesterId);
}

// Apply the user's baseline once per existing unit; never recreate missing syllabus
// records, overwrite revision choices, or re-complete a unit the user later reopens.
export function applyWeeklyBaseline(d: Dataset) {
  for (const course of d.courses) {
    if (
      !usesWeeklyFramework(d, course.semesterId) ||
      !weeklySubjects.includes(
        course.code.trim().toUpperCase() as (typeof weeklySubjects)[number],
      )
    )
      continue;
    d.settings.weekStart = 1;
    const applied = course.baselineUnitIds || [];
    for (const unit of d.lectures.filter(
      (l) => l.courseId === course.id && l.number <= 2,
    )) {
      if (applied.includes(unit.id)) continue;
      if (unit.status !== "completed") {
        unit.status = "completed";
        unit.completedAt = new Date().toISOString();
        unit.updatedAt = unit.completedAt;
      }
      applied.push(unit.id);
    }
    course.baselineUnitIds = applied;
  }
}
