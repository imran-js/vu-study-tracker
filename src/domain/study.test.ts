import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initialData,
  stamp,
  validateData,
  type Dataset,
  type Course,
  type Session,
} from "./model";
import {
  addDays,
  dayOf,
  isOverdue,
  localToInstant,
  minutes,
  minutesByDay,
  weekStart,
} from "./dates";
import { progress } from "./progress";
import {
  finishTimer,
  generateLectures,
  revise,
  setLectureStatus,
  startTimer,
  toggleTimer,
} from "../app/actions";
import { parseBackup, exportBackup } from "../features/backup/backup";
import { migrateData } from "../data/migrations";
import { driveFileId } from "../integrations/google-drive";
import { Temporal } from "@js-temporal/polyfill";

function fixture() {
  const d = initialData();
  const course: Course = {
    ...stamp(),
    semesterId: d.settings.activeSemesterId,
    code: "TEST",
    title: "Synthetic test course",
    priority: "normal",
    lectureTotal: 4,
    notes: "",
    folderUrl: "",
  };
  d.courses.push(course);
  generateLectures(d, course.id);
  return { d, course };
}
function addSession(
  d: Dataset,
  intervals: { start: string; end: string }[] = [],
) {
  const session: Session = {
    ...stamp(),
    semesterId: d.settings.activeSemesterId,
    title: "Synthetic study session",
    status: "planned",
    notes: "",
    intervals,
  };
  d.sessions.push(session);
  return session;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("progress and semester isolation", () => {
  it("starts empty, with unknown total and zero denominators", () => {
    const d = initialData();
    const p = progress(d, d.settings.activeSemesterId);
    expect(p.total).toBeUndefined();
    expect(p.completed).toBe(0);
    expect(p.assessmentTotal).toBe(0);
    expect(p.scheduledTotal).toBe(0);
  });
  it("sums confirmed lecture counts instead of averaging percentages", () => {
    const { d, course } = fixture();
    setLectureStatus(d, d.lectures[0].id, "completed");
    const second = { ...course, ...stamp(), lectureTotal: 6 };
    d.courses.push(second);
    expect(progress(d, course.semesterId)).toMatchObject({
      total: 10,
      completed: 1,
    });
  });
  it("counts revision coverage once per completed lecture", () => {
    const { d, course } = fixture();
    const id = d.lectures[0].id;
    setLectureStatus(d, id, "completed");
    revise(d, id, "2026-10-22");
    revise(d, id, "2026-10-22");
    expect(progress(d, course.semesterId)).toMatchObject({
      completed: 1,
      revised: 1,
      revisionDue: 1,
    });
  });
  it("keeps total unknown if a course total is unknown", () => {
    const { d, course } = fixture();
    course.lectureTotal = undefined;
    expect(progress(d, course.semesterId).total).toBeUndefined();
  });
  it("excludes lectures from both the numerator and the confirmed denominator", () => {
    const { d, course } = fixture();
    setLectureStatus(d, d.lectures[0].id, "completed");
    d.lectures[0].excluded = true;
    expect(progress(d, course.semesterId)).toMatchObject({
      total: 3,
      completed: 0,
      entered: 3,
    });
  });
  it("uses scheduled-session counts only within the selected-zone week", () => {
    const { d, course } = fixture();
    const session = addSession(d);
    session.plannedStart = "2026-10-25T22:00:00Z"; // Monday in Riyadh: next week.
    session.plannedEnd = "2026-10-25T23:00:00Z";
    session.status = "completed";
    expect(progress(d, course.semesterId).scheduledTotal).toBe(0);
    d.settings.timezone = "UTC";
    expect(progress(d, course.semesterId)).toMatchObject({
      scheduledTotal: 1,
      scheduledDone: 1,
    });
  });
  it("preserves reused course codes and archived history", () => {
    const { d, course } = fixture();
    setLectureStatus(d, d.lectures[0].id, "completed");
    const semester = {
      ...stamp(),
      name: "Future test semester",
      archived: false,
    };
    d.semesters.push(semester);
    d.semesters[0].archived = true;
    d.courses.push({
      ...course,
      ...stamp(),
      semesterId: semester.id,
      lectureTotal: 0,
    });
    expect(progress(d, semester.id).completed).toBe(0);
    expect(progress(d, course.semesterId).completed).toBe(1);
    expect(validateData(d).semesters).toHaveLength(2);
  });
  it("counts submissions administratively and excludes cancelled assessments", () => {
    const { d, course } = fixture();
    for (const status of [
      "submitted",
      "completed",
      "not started",
      "cancelled",
    ] as const)
      d.assessments.push({
        ...stamp(),
        courseId: course.id,
        typeId: d.types[0].id,
        title: status,
        notes: "",
        sourceUrl: "",
        deadline: { kind: "none" },
        status,
      });
    expect(progress(d, course.semesterId)).toMatchObject({
      assessmentDone: 2,
      assessmentTotal: 3,
    });
  });
});
describe("dates and reporting boundaries", () => {
  it("preserves a date-only deadline until the end of the selected-zone day", () => {
    const deadline = { kind: "date" as const, date: "2026-10-22" };
    expect(
      isOverdue(
        deadline,
        "Asia/Riyadh",
        Temporal.Instant.from("2026-10-22T20:59:59Z"),
      ),
    ).toBe(false);
    expect(
      isOverdue(
        deadline,
        "Asia/Riyadh",
        Temporal.Instant.from("2026-10-22T21:00:00Z"),
      ),
    ).toBe(true);
  });
  it("preserves the actual instant while displaying different local days", () => {
    const at = localToInstant("2026-10-23T01:00", "Asia/Karachi");
    expect(at).toBe("2026-10-22T20:00:00Z");
    expect(dayOf(at, "Asia/Riyadh")).toBe("2026-10-22");
    expect(dayOf(at, "Asia/Karachi")).toBe("2026-10-23");
  });
  it("splits study intervals at local midnight", () => {
    const days = minutesByDay(
      [{ start: "2026-10-22T20:30:00Z", end: "2026-10-22T21:30:00Z" }],
      "Asia/Riyadh",
    );
    expect(days).toEqual({ "2026-10-22": 30, "2026-10-23": 30 });
  });
  it("handles daylight-saving day length", () => {
    const days = minutesByDay(
      [{ start: "2026-03-08T05:00:00Z", end: "2026-03-09T04:00:00Z" }],
      "America/New_York",
    );
    expect(days["2026-03-08"]).toBe(1380);
  });
  it("rejects nonexistent and ambiguous local times rather than guessing", () => {
    expect(() =>
      localToInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
    expect(() =>
      localToInstant("2026-11-01T01:30", "America/New_York"),
    ).toThrow();
  });
  it("respects Monday or Sunday week starts across month boundaries", () => {
    expect(weekStart("2026-11-01", 1)).toBe("2026-10-26");
    expect(weekStart("2026-11-01", 7)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
describe("time integrity and timer recovery", () => {
  it("excludes pauses and survives a serialized reload", () => {
    const { d } = fixture();
    const s = addSession(d);
    startTimer(d, s.id, "2026-10-22T10:00:00Z");
    toggleTimer(d, "2026-10-22T10:20:00Z");
    toggleTimer(d, "2026-10-22T10:40:00Z");
    const recovered = parseBackup(exportBackup(d));
    finishTimer(recovered, "2026-10-22T11:00:00Z");
    expect(minutes(recovered.sessions[0].intervals)).toBe(40);
    expect(recovered.timer).toBeUndefined();
    expect(recovered.sessions[0].status).toBe("completed");
    expect(validateData(recovered)).toBeTruthy();
  });
  it("rejects overlapping actual intervals across courses and semesters", () => {
    const { d } = fixture();
    addSession(d, [
      { start: "2026-10-22T10:00:00Z", end: "2026-10-22T11:00:00Z" },
    ]);
    addSession(d, [
      { start: "2026-10-22T10:30:00Z", end: "2026-10-22T11:30:00Z" },
    ]);
    expect(() => validateData(d)).toThrow(/overlap/);
  });
  it("allows adjacent intervals and rejects future actual time", () => {
    const { d } = fixture();
    addSession(d, [
      { start: "2026-10-22T10:00:00Z", end: "2026-10-22T11:00:00Z" },
      { start: "2026-10-22T11:00:00Z", end: "2026-10-22T12:00:00Z" },
    ]);
    expect(validateData(d)).toBeTruthy();
    d.sessions[0].intervals[1].end = "2026-10-22T13:00:00Z";
    expect(() => validateData(d)).toThrow(/future/);
  });
  it("rejects cancelling sessions containing study time", () => {
    const { d } = fixture();
    const s = addSession(d, [
      { start: "2026-10-22T10:00:00Z", end: "2026-10-22T11:00:00Z" },
    ]);
    d.sessions[0].status = "cancelled";
    expect(() => validateData(d)).toThrow(/cancelled/);
    expect(s.intervals.length).toBe(1);
  });
  it("requires paired planning dates and valid related courses", () => {
    const { d } = fixture();
    const s = addSession(d);
    s.plannedStart = "2026-10-23T10:00:00Z";
    expect(() => validateData(d)).toThrow(/both planned/);
  });
});
describe("resources, backups, and migrations", () => {
  it("preserves original URLs, metadata, and archived records in a round trip", () => {
    const { d, course } = fixture();
    const url =
      "https://drive.google.com/file/d/synthetic/view?resourcekey=keep-this&usp=sharing";
    d.resources.push({
      ...stamp(),
      courseId: course.id,
      lectureId: d.lectures[0].id,
      title: "Synthetic resource",
      url,
      tags: ["test"],
      provider: "google-drive",
      providerFileId: "synthetic",
    });
    d.semesters[0].archived = true;
    expect(parseBackup(exportBackup(d))).toEqual(d);
    expect(driveFileId(url)).toBe("synthetic");
  });
  it("rejects mismatched resource lectures and unsupported URLs", () => {
    const { d, course } = fixture();
    d.resources.push({
      ...stamp(),
      courseId: course.id,
      lectureId: "missing",
      title: "Test",
      url: "https://docs.google.com/document/d/test/edit",
      tags: [],
      provider: "google-drive",
    });
    expect(() => validateData(d)).toThrow(/Resource lecture/);
    d.resources[0].lectureId = undefined;
    d.resources[0].url = "https://drive.google.com.evil.example/file";
    expect(() => validateData(d)).toThrow();
  });
  it("migrates v1 without mutating the original", () => {
    const { d } = fixture();
    const v1 = { ...d, schemaVersion: 1 } as Record<string, unknown>;
    delete v1.resources;
    const migrated = migrateData(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.resources).toEqual([]);
    expect(v1.schemaVersion).toBe(1);
  });
  it("rejects newer formats, duplicate IDs, invalid dates, and broken relationships", () => {
    const { d } = fixture();
    expect(() => migrateData({ ...d, schemaVersion: 99 })).toThrow(/newer/);
    d.semesters.push(d.semesters[0]);
    expect(() => validateData(d)).toThrow(/Duplicate/);
    const fresh = initialData();
    fresh.semesters[0].startDate = "2026-02-30";
    expect(() => validateData(fresh)).toThrow();
  });
  it("generates missing lectures without overwriting existing records", () => {
    const { d, course } = fixture();
    const old = structuredClone(d.lectures);
    generateLectures(d, course.id);
    expect(d.lectures).toEqual(old);
  });
});
