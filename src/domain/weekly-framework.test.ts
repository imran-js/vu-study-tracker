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
  editDayTopics,
  useScheduledSubject,
} from "./planner";
import { applyCs101Schedule } from "./cs101-schedule";
import { logPlanMinutes, startPlanTimer } from "../app/planner-actions";
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

it("prioritises CS101 Quiz 1 on this weekend without moving any weekday subject", () => {
  const { d, semester } = fixture();
  applyCs101Schedule(d);
  d.courses[3].planning = {
    active: true,
    status: "Temporarily high priority",
    reason: "Other urgent work",
    catchUpMinutes: 90,
  };
  for (const day of ["2026-10-31", "2026-11-01"]) {
    const plan = recommendDay(d, semester, day);
    expect(plan.items[0].courseId).toBe(d.courses[0].id);
    expect(plan.items[0].focus).toContain("CS101 Quiz 1 · Topics 1–38");
    expect(plan.items[0].lectureId).toBeUndefined();
    expect(plan.items[0].minutes).toBeGreaterThan(plan.items[1].minutes);
  }
  for (let index = 0; index < 5; index++) {
    const items = recommendDay(d, semester, addDays("2026-10-26", index)).items;
    expect(items).toHaveLength(1);
    expect(items[0].courseId).toBe(d.courses[index].id);
  }
  const quiz = d.assessments.find((a) => a.title === "Semester Quiz 1")!;
  quiz.status = "completed";
  expect(recommendDay(d, semester, "2026-11-01").items[0].focus).not.toContain(
    "CS101 Quiz 1",
  );
});

it("restores the assigned weekday subject only explicitly, retaining the original assignments and study records", () => {
  const { d, semester } = fixture();
  d.semesters[0].name = "Legacy semester";
  vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
  const items = recommendDay(d, semester, "2026-10-27").items;
  const plan = saveDayPlan(
    d,
    semester,
    "2026-10-27",
    items,
    "Keep notes",
    true,
  );
  logPlanMinutes(d, plan.id, "Main", 30);
  d.semesters[0].name = "Fall 2026";
  const before = structuredClone(d);
  useScheduledSubject(d, plan.id);
  expect(plan.items).toHaveLength(1);
  expect(plan.items[0].courseId).toBe(d.courses[1].id);
  expect(plan.previousAssignments?.[0].items).toEqual(
    before.dailyPlans[0].items,
  );
  expect(d.sessions).toEqual(before.sessions);
  expect(d.lectures).toEqual(before.lectures);
  expect(() => assertPlanTransitions(before, d)).toThrow(/stays fixed/);
  expect(() =>
    assertPlanTransitions(before, d, undefined, plan.id),
  ).not.toThrow();
  expect(parseBackup(exportBackup(d))).toEqual(validateData(d));
  const once = structuredClone(d);
  useScheduledSubject(d, plan.id);
  expect(d).toEqual(once);
  vi.setSystemTime(new Date("2026-10-28T09:00:00Z"));
  expect(() => useScheduledSubject(d, plan.id)).toThrow(/future weekday/);
});

it("allows explicit topic edits while preserving recorded study and blocking reassignment and history edits", () => {
  const { d, semester } = fixture();
  freezeToday(d, semester);
  const plan = d.dailyPlans[0];
  logPlanMinutes(d, plan.id, "Main", 30);
  plan.items[0].status = "completed";
  const before = structuredClone(d);
  const unit = d.lectures.find(
    (l) => l.courseId === plan.items[0].courseId && l.number === 4,
  )!;
  editDayTopics(d, plan.id, [
    { role: "Main", lectureId: unit.id, focus: "My next topic" },
  ]);
  expect(plan.locked).toBe(true);
  expect(plan.items[0].status).toBe("pending");
  expect(plan.items[0].sessionId).toBeUndefined();
  expect(d.sessions).toEqual(before.sessions);
  expect(d.lectures).toEqual(before.lectures);
  expect(() => assertPlanTransitions(before, d)).toThrow(/stays fixed/);
  expect(() => assertPlanTransitions(before, d, plan.id)).not.toThrow();
  expect(parseBackup(exportBackup(d))).toEqual(validateData(d));
  const wrongCourse = structuredClone(d);
  wrongCourse.dailyPlans[0].items[0].courseId = d.courses[1].id;
  expect(() => assertPlanTransitions(before, wrongCourse, plan.id)).toThrow(
    /stays fixed/,
  );
  startPlanTimer(d, plan.id, "Main");
  expect(() =>
    editDayTopics(d, plan.id, [{ role: "Main", focus: "Another unit" }]),
  ).toThrow(/running timer/);
  vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
  expect(() =>
    editDayTopics(d, plan.id, [{ role: "Main", focus: "Rewrite history" }]),
  ).toThrow(/Past plans/);
  expect(() => assertPlanTransitions(before, d, plan.id)).toThrow(/Historical/);
});

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
