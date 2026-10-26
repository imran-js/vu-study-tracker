import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialData, stamp, validateData } from "./model";
import { applyCs101Schedule, cs101Activities } from "./cs101-schedule";
import { calendarEvent, datesConfirmed } from "./calendar";
import { freezeToday, recommendDay } from "./planner";
import { generateLectures, commit } from "../app/actions";
import { weeklySubjects, applyWeeklyBaseline } from "./weekly-framework";
import { exportBackup, parseBackup } from "../features/backup/backup";

function fixture() {
  const d = initialData();
  for (const code of weeklySubjects) {
    const c = {
      ...stamp(),
      semesterId: d.settings.activeSemesterId,
      code,
      title: code,
      priority: "normal" as const,
      notes: "Keep my notes",
      folderUrl: "",
      lectureTotal: 6,
    };
    d.courses.push(c);
    generateLectures(d, c.id);
  }
  applyWeeklyBaseline(d);
  return d;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

it("records all nine official dates and topic ranges, with no invented exam times", () => {
  const d = fixture();
  applyCs101Schedule(d);
  expect(d.assessments).toHaveLength(9);
  expect(
    d.assessments.map((a) => [a.opensOn, a.deadline, a.coverage?.officialText]),
  ).toEqual([
    ["2026-11-02", { kind: "date", date: "2026-11-05" }, "Topics 1–38"],
    ["2026-11-09", { kind: "date", date: "2026-11-12" }, "Topics 38–51"],
    ["2026-11-16", { kind: "date", date: "2026-11-18" }, "Topics 51–65"],
    ["2026-12-01", { kind: "date", date: "2026-12-03" }, "Topics 51–95"],
    ["2026-12-07", { kind: "date", date: "2026-12-07" }, "Topics 1–108"],
    ["2026-12-22", { kind: "date", date: "2026-12-24" }, "Topics 95–108"],
    ["2026-12-29", { kind: "date", date: "2026-12-31" }, "Topics 146–162"],
    ["2027-01-05", { kind: "date", date: "2027-01-07" }, "Topics 162–193"],
    ["2027-01-25", { kind: "date", date: "2027-01-25" }, "Topics 108–230"],
  ]);
  expect(d.assessments.every(datesConfirmed)).toBe(true);
  expect(
    d.assessments.every(
      (a) => a.coverage?.mapping === "unconfirmed" && !a.endsAt,
    ),
  ).toBe(true);
  expect(calendarEvent(d, d.assessments[0]).end).toEqual({
    date: "2026-11-06",
  });
  expect(validateData(d)).toBeTruthy();
});

it("updates matching aliases in place, preserving status, notes, marks, practice and linked history", () => {
  const d = fixture();
  const aliases = [
    "CS101 Quiz 1",
    "Semester Quiz 2",
    "Graded Discussion Board",
    "Quiz 3",
    "Mid-Term Exam",
    "Quiz 4",
    "Quiz 5",
    "Quiz 6",
    "Final Term Exam",
  ];
  for (const title of aliases)
    d.assessments.push({
      ...stamp(),
      title,
      courseId: d.courses[0].id,
      typeId: d.types[1].id,
      notes: "Personal note",
      sourceUrl: "https://example.com/source",
      opensOn: "2026-11-03",
      deadline: { kind: "date", date: "2026-11-05" },
      status: "completed",
      completedAt: new Date().toISOString(),
      marks: 9,
      practice: {
        percent: 80,
        recordedAt: new Date().toISOString(),
        sourceNote: "Practice",
      },
    });
  d.sessions.push({
    ...stamp(),
    semesterId: d.settings.activeSemesterId,
    courseId: d.courses[0].id,
    assessmentId: d.assessments[0].id,
    title: "Quiz preparation",
    notes: "Keep history",
    status: "completed",
    intervals: [{ start: "2026-10-25T09:00:00Z", end: "2026-10-25T09:30:00Z" }],
  });
  d.calendarMappings.push({
    provider: "google-calendar",
    assessmentId: d.assessments[0].id,
    calendarId: "existing-calendar",
    eventId: "abcde12345",
    generation: 0,
    status: "synced",
    sourceHash: "previous dates",
  });
  const before = structuredClone(d);
  applyCs101Schedule(d);
  expect(d.assessments).toHaveLength(9);
  for (let i = 0; i < 9; i++) {
    const {
      opensOn,
      deadline,
      coverage,
      updatedAt,
      dateConfirmation,
      ...personal
    } = d.assessments[i];
    expect(personal).toEqual(
      (({ opensOn, deadline, updatedAt, ...rest }) => rest)(
        before.assessments[i],
      ),
    );
  }
  expect(d.sessions).toEqual(before.sessions);
  expect(d.calendarMappings).toEqual(before.calendarMappings);
  expect(d.lectures).toEqual(before.lectures);
  expect(d.courses[0].notes).toBe("Keep my notes");
  const once = structuredClone(d);
  vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
  applyCs101Schedule(d);
  expect(d).toEqual(once);
  const restored = parseBackup(exportBackup(d));
  applyCs101Schedule(restored);
  expect(restored).toEqual(d);
});

it("does not seed another semester, course, or empty account", () => {
  const empty = initialData();
  const original = structuredClone(empty);
  applyCs101Schedule(empty);
  expect(empty).toEqual(original);
  const d = fixture();
  d.semesters[0].name = "Spring 2027";
  const before = structuredClone(d);
  applyCs101Schedule(d);
  expect(d).toEqual(before);
});

it("preserves locked today, weekly assignments and later edits through the save path", async () => {
  const d = fixture();
  freezeToday(d, d.settings.activeSemesterId);
  const plans = structuredClone(d.dailyPlans);
  const repository = {
    load: vi.fn(),
    replace: vi.fn(async (data, revision) => ({
      data,
      revision: revision + 1,
    })),
  };
  const saved = await commit(repository, { data: d, revision: 1 }, () => {});
  expect(saved.data.dailyPlans).toEqual(plans);
  expect(saved.data.assessments).toHaveLength(cs101Activities.length);
  for (let i = 0; i < 5; i++)
    expect(
      recommendDay(saved.data, d.settings.activeSemesterId, `2026-10-${26 + i}`)
        .items[0].courseId,
    ).toBe(d.courses[i].id);
  saved.data.assessments[0].notes = "Later edit";
  const again = await commit(repository, saved, () => {});
  expect(again.data.assessments).toEqual(saved.data.assessments);
});
