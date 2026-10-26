import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialData, stamp, validateData } from "./model";
import { generateLectures } from "../app/actions";
import { addDays } from "./dates";
import { applyWeeklyBaseline, weeklySubjects } from "./weekly-framework";
import {
  assertPlanTransitions,
  freezeToday,
  recommendDay,
  saveDayPlan,
  unlockDayPlan,
} from "./planner";
import { exportBackup, parseBackup } from "../features/backup/backup";

function fixture() {
  const d = initialData();
  const semester = d.settings.activeSemesterId;
  for (const code of weeklySubjects) {
    const c = {
      ...stamp(),
      semesterId: semester,
      code,
      title: code,
      notes: "Keep notes",
      folderUrl: "",
      priority: "normal" as const,
      lectureTotal: 6,
    };
    d.courses.push(c);
    generateLectures(d, c.id);
  }
  applyWeeklyBaseline(d);
  return { d, semester };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

it("starts with unit 3 in the fixed weekday order and projects unit 4 the next week", () => {
  const { d, semester } = fixture();
  for (let index = 0; index < 5; index++) {
    for (const week of [0, 1]) {
      const result = recommendDay(
        d,
        semester,
        addDays("2026-10-26", index + week * 7),
      );
      expect(result.items).toHaveLength(1);
      expect(
        d.courses.find((c) => c.id === result.items[0].courseId)?.code,
      ).toBe(weeklySubjects[index]);
      expect(
        d.lectures.find((l) => l.id === result.items[0].lectureId)?.number,
      ).toBe(3 + week);
    }
  }
});
it("applies baseline once, preserves explicit revision flags and later reopened work", () => {
  const { d } = fixture();
  expect(d.lectures.filter((l) => l.status === "completed")).toHaveLength(10);
  d.lectures[0].status = "not started";
  d.lectures[1].needsRevision = true;
  const previous = structuredClone(d);
  applyWeeklyBaseline(d);
  expect(d).toEqual(previous);
  expect(d.sessions).toEqual([]);
  expect(d.revisions).toEqual([]);
  expect(validateData(d)).toBeTruthy();
});
it("leaves other semesters and courses untouched and does not invent units", () => {
  const { d } = fixture();
  d.semesters[0].name = "Spring 2027";
  d.settings.weekStart = 7;
  const previous = structuredClone(d);
  applyWeeklyBaseline(d);
  expect(d).toEqual(previous);
  d.semesters[0].name = "Fall 2026";
  d.lectures = [];
  applyWeeklyBaseline(d);
  expect(d.lectures).toEqual([]);
  expect(
    recommendDay(d, d.settings.activeSemesterId, "2026-10-26").items[0]
      .lectureId,
  ).toBeUndefined();
});
it("keeps weekday subjects fixed under deadlines and sends urgent prep to the weekend", () => {
  const { d, semester } = fixture();
  d.assessments.push({
    ...stamp(),
    courseId: d.courses[4].id,
    typeId: d.types[1].id,
    title: "Urgent quiz",
    notes: "",
    sourceUrl: "",
    status: "not started",
    deadline: { kind: "date", date: "2026-11-01" },
  });
  expect(recommendDay(d, semester, "2026-10-26").items[0].courseId).toBe(
    d.courses[0].id,
  );
  for (const day of ["2026-10-31", "2026-11-01"]) {
    const result = recommendDay(d, semester, day);
    expect(result.items[0].courseId).toBe(d.courses[4].id);
    expect(result.items[0].focus).toContain(
      day.endsWith("31") ? "Practice:" : "Catch-up:",
    );
    expect(result.total).toBeLessThanOrEqual(d.settings.planner.maximumMinutes);
  }
});
it("practices the current week's completed unit rather than advancing to next week's unit", () => {
  const { d, semester } = fixture();
  for (const l of d.lectures.filter((l) => l.number === 3)) {
    l.status = "completed";
    l.completedAt = new Date().toISOString();
  }
  const result = recommendDay(d, semester, "2026-10-31");
  expect(
    result.items.every(
      (i) => d.lectures.find((l) => l.id === i.lectureId)?.number === 3,
    ),
  ).toBe(true);
});
it("freezes today automatically, blocks unlock/reassignment, and allows outcome updates", () => {
  const { d, semester } = fixture();
  freezeToday(d, semester);
  const before = structuredClone(d);
  expect(d.dailyPlans[0].locked).toBe(true);
  expect(() => unlockDayPlan(d, d.dailyPlans[0].id)).toThrow(/stays fixed/);
  expect(() =>
    saveDayPlan(d, semester, "2026-10-26", d.dailyPlans[0].items, "edit"),
  ).toThrow(/stays fixed/);
  d.dailyPlans[0].items[0].status = "partial";
  expect(() => assertPlanTransitions(before, d)).not.toThrow();
  d.dailyPlans[0].items[0].focus = "Reassigned";
  expect(() => assertPlanTransitions(before, d)).toThrow(/stays fixed/);
});
it("preserves future drafts when they become today and never moves missed history", () => {
  const { d, semester } = fixture();
  freezeToday(d, semester);
  const historical = structuredClone(d.dailyPlans[0]);
  const draft = saveDayPlan(
    d,
    semester,
    "2026-10-27",
    recommendDay(d, semester, "2026-10-27").items,
    "Personal notes",
  );
  const items = structuredClone(draft.items);
  vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
  freezeToday(d, semester);
  expect(draft.locked).toBe(true);
  expect(draft.items).toEqual(items);
  expect(draft.notes).toBe("Personal notes");
  expect(d.dailyPlans[0]).toEqual(historical);
  expect(parseBackup(exportBackup(d))).toEqual(validateData(d));
});
it("rejects weekday subject overrides and respects existing booked minutes", () => {
  const { d, semester } = fixture();
  expect(() =>
    saveDayPlan(
      d,
      semester,
      "2026-10-27",
      recommendDay(d, semester, "2026-10-26").items,
      "",
    ),
  ).toThrow(/fixed subject/);
  d.sessions.push({
    ...stamp(),
    semesterId: semester,
    title: "Existing",
    notes: "",
    status: "planned",
    intervals: [],
    plannedStart: "2026-10-27T12:00:00Z",
    plannedEnd: "2026-10-27T13:00:00Z",
  });
  expect(recommendDay(d, semester, "2026-10-27").total).toBe(30);
});
