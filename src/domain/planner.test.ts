import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialData,
  stamp,
  validateData,
  type Dataset,
  type Assessment,
} from "./model";
import {
  recommendDay,
  rankCourses,
  saveDayPlan,
  unlockDayPlan,
  planOutcome,
  recoveryMinutes,
  assertPlanTransitions,
} from "./planner";
import { unknownCoverage } from "./planner-model";
import { assessmentReadiness } from "./readiness";
import {
  generateLectures,
  revise,
  setLectureStatus,
  finishTimer,
} from "../app/actions";
import {
  logPlanMinutes,
  logPlanStatus,
  startPlanTimer,
} from "../app/planner-actions";
import { exportBackup, parseBackup } from "../features/backup/backup";
import { migrateData } from "../data/migrations";

const day = "2026-10-23",
  next = "2026-10-24";
function fixture() {
  const d = initialData();
  const semesterId = d.settings.activeSemesterId;
  for (const code of ["A101", "B101", "C101", "D101", "E101"]) {
    const c = {
      ...stamp(),
      semesterId,
      code,
      title: `Synthetic ${code}`,
      notes: "",
      folderUrl: "",
      priority: "normal" as const,
      lectureTotal: 4,
    };
    d.courses.push(c);
    generateLectures(d, c.id);
  }
  return { d, semesterId };
}
function urgent(d: Dataset, courseIndex = 4): Assessment {
  const a: Assessment = {
    ...stamp(),
    courseId: d.courses[courseIndex].id,
    typeId: d.types[1].id,
    title: "Synthetic urgent assessment",
    notes: "",
    sourceUrl: "",
    deadline: { kind: "date", date: next },
    status: "not started",
    coverage: unknownCoverage(),
  };
  d.assessments.push(a);
  return a;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("locked-day planning and recovery", () => {
  it("retires catch-up need after later study without rewriting the missed record", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    const before = structuredClone(p);
    const item = p.items[0];
    expect(recoveryMinutes(d, item.courseId, next)).toBeGreaterThan(0);
    vi.setSystemTime(new Date("2026-10-24T15:00:00Z"));
    setLectureStatus(d, item.lectureId!, "completed");
    expect(recoveryMinutes(d, item.courseId, "2026-10-25")).toBe(0);
    expect(p).toEqual(before);
    expect(planOutcome(d, p)).toBe("Missed");
  });
  it("keeps locked Today byte-for-byte unchanged after adding an urgent assessment, while Tomorrow changes", () => {
    const { d, semesterId } = fixture();
    const plan = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "Fixed focus",
      true,
    );
    const before = JSON.stringify(plan);
    const oldMain = recommendDay(d, semesterId, next).items[0].courseId;
    urgent(d);
    const after = recommendDay(d, semesterId, next);
    expect(JSON.stringify(d.dailyPlans[0])).toBe(before);
    expect(after.items[0].courseId).not.toBe(oldMain);
    expect(after.items[0].courseId).toBe(d.courses[4].id);
    expect(() =>
      saveDayPlan(d, semesterId, day, after.items, "rewrite", true),
    ).toThrow(/Unlock/);
  });
  it("requires a separately persisted manual unlock before assignment changes", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "original",
      true,
    );
    const locked = structuredClone(d);
    unlockDayPlan(d, p.id);
    expect(() => assertPlanTransitions(locked, d)).not.toThrow();
    const unlocked = structuredClone(d);
    saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "edited after unlock",
      true,
    );
    expect(() => assertPlanTransitions(unlocked, d)).not.toThrow();
    expect(() => assertPlanTransitions(locked, d)).toThrow(/Unlock/);
    expect(d.dailyPlans[0].lockHistory.map((h) => h.action)).toEqual([
      "locked",
      "unlocked",
      "locked",
    ]);
  });
  it("preserves missed days on their original dates and distributes recovery without increasing the budget", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    const old = JSON.stringify(p);
    vi.setSystemTime(new Date("2026-10-24T15:00:00Z"));
    expect(planOutcome(d, p)).toBe("Missed");
    const recovered = recommendDay(d, semesterId, next);
    expect(recovered.total).toBeLessThanOrEqual(
      d.settings.planner.maximumMinutes,
    );
    expect(
      recovered.rankings
        .find((r) => r.course.id === p.items[0].courseId)!
        .reasons.join(" "),
    ).toContain("catch-up");
    saveDayPlan(d, semesterId, next, recovered.items, "", true);
    expect(JSON.stringify(d.dailyPlans[0])).toBe(old);
    expect(planOutcome(d, p)).toBe("Missed");
    expect(d.dailyPlans[0].day).toBe(day);
    expect(() => unlockDayPlan(d, p.id)).toThrow(/Only today/);
  });
  it("keeps partial history and does not mark units complete when plan completion is logged", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    logPlanStatus(d, p.id, "Main", "completed");
    expect(d.lectures.every((l) => l.status === "not started")).toBe(true);
    vi.setSystemTime(new Date("2026-10-24T15:00:00Z"));
    expect(planOutcome(d, p)).toBe("Partial");
  });
  it("applies behind-course changes to future rankings without changing locked Today", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    const before = structuredClone(p);
    d.courses[4].planning = {
      active: true,
      status: "Behind",
      reason: "Manual catch-up",
      catchUpMinutes: 60,
    };
    expect(recommendDay(d, semesterId, next).items[0].courseId).toBe(
      d.courses[4].id,
    );
    expect(d.dailyPlans[0]).toEqual(before);
  });
  it("prioritizes urgent deadlines and opening dates transparently", () => {
    const { d, semesterId } = fixture();
    const before = rankCourses(d, semesterId, next).find(
      (r) => r.course.id === d.courses[4].id,
    )!.score;
    const a = urgent(d);
    a.opensOn = next;
    a.deadline = { kind: "date", date: "2026-10-26" };
    const after = rankCourses(d, semesterId, next)[0];
    expect(after.course.id).toBe(d.courses[4].id);
    expect(after.score).toBeGreaterThan(before);
    expect(after.reasons.join(" ")).toContain("due/opening that day");
  });
  it("honors light/normal/max budgets and existing scheduled workload", () => {
    const { d, semesterId } = fixture();
    expect(recommendDay(d, semesterId, next).total).toBe(90);
    expect(recommendDay(d, semesterId, next, true).total).toBe(65);
    d.settings.planner = {
      normalMinutes: 60,
      lightMinutes: 30,
      maximumMinutes: 60,
    };
    for (const c of d.courses)
      c.planning = {
        active: true,
        status: "Behind",
        reason: "Test",
        catchUpMinutes: 180,
      };
    expect(recommendDay(d, semesterId, next).total).toBe(60);
    d.sessions.push({
      ...stamp(),
      semesterId,
      title: "Already booked",
      notes: "",
      status: "planned",
      intervals: [],
      plannedStart: "2026-10-24T12:00:00Z",
      plannedEnd: "2026-10-24T13:00:00Z",
    });
    expect(recommendDay(d, semesterId, next).items).toEqual([]);
    expect(() =>
      saveDayPlan(
        d,
        semesterId,
        next,
        [
          {
            role: "Main",
            courseId: d.courses[0].id,
            focus: "Manual",
            minutes: 1,
            reason: "Manual",
            source: "Personal Plan",
            status: "pending",
          },
        ],
        "",
      ),
    ).toThrow(/scheduled/);
  });
  it("preserves locked durations when preferences change and rejects oversized manual plans", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    const before = structuredClone(p);
    d.settings.planner = {
      normalMinutes: 60,
      lightMinutes: 30,
      maximumMinutes: 60,
    };
    expect(validateData(d)).toBeTruthy();
    expect(p).toEqual(before);
    expect(() => saveDayPlan(d, semesterId, next, p.items, "")).toThrow(
      /maximum/,
    );
  });
  it("uses existing session intervals for quick time and rejects overlaps atomically through validation", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    logPlanMinutes(d, p.id, "Main", 30);
    expect(d.sessions).toHaveLength(1);
    expect(validateData(d)).toBeTruthy();
    expect(d.lectures.every((l) => l.status === "not started")).toBe(true);
    const overlap = structuredClone(d);
    logPlanMinutes(overlap, p.id, "Main", 30);
    expect(() => validateData(overlap)).toThrow(/overlap/);
    const timerData = fixture();
    const plan = saveDayPlan(
      timerData.d,
      timerData.semesterId,
      day,
      recommendDay(timerData.d, timerData.semesterId, day).items,
      "",
      true,
    );
    startPlanTimer(timerData.d, plan.id, "Main", "2026-10-23T14:00:00Z");
    finishTimer(timerData.d, "2026-10-23T14:30:00Z");
    expect(timerData.d.sessions).toHaveLength(1);
    expect(timerData.d.lectures[0].status).toBe("not started");
  });
});

describe("verified coverage and preservation", () => {
  it("does not borrow a later assessment's scope when the urgent quiz coverage is unknown", () => {
    const { d, semesterId } = fixture();
    const a = urgent(d);
    const later = {
      ...a,
      ...stamp(),
      title: "Later verified exam",
      deadline: { kind: "date" as const, date: "2026-12-01" },
      coverage: {
        ...unknownCoverage(),
        type: "numbered" as const,
        startUnit: 4,
        endUnit: 4,
        verification: "verified" as const,
        mapping: "direct" as const,
        sourceType: "VULMS" as const,
        sourceNote: "Synthetic source",
      },
    };
    d.assessments.push(later);
    const recommended = recommendDay(d, semesterId, next);
    expect(recommended.items[0].courseId).toBe(a.courseId);
    expect(recommended.items[0].lectureId).toBe(
      d.lectures.find((l) => l.courseId === a.courseId && l.number === 1)!.id,
    );
  });
  it("does not fabricate readiness for unknown, provisional, unmapped or missing units", () => {
    const { d } = fixture();
    const a = urgent(d);
    expect(assessmentReadiness(d, a).calculable).toBe(false);
    a.coverage = {
      ...unknownCoverage(),
      type: "numbered",
      startUnit: 1,
      endUnit: 4,
      verification: "provisional",
      mapping: "direct",
      sourceType: "Personal Plan",
    };
    expect(assessmentReadiness(d, a).calculable).toBe(false);
    a.coverage.verification = "verified";
    a.coverage.sourceType = "VULMS";
    a.coverage.sourceNote = "Synthetic source";
    a.coverage.mapping = "unconfirmed";
    expect(assessmentReadiness(d, a).calculable).toBe(false);
    a.coverage.mapping = "direct";
    a.coverage.endUnit = 8;
    expect(assessmentReadiness(d, a).calculable).toBe(false);
  });
  it("counts studied and unique revised units separately from practice", () => {
    const { d } = fixture();
    const a = urgent(d);
    a.coverage = {
      ...unknownCoverage(),
      type: "numbered",
      startUnit: 1,
      endUnit: 4,
      verification: "verified",
      mapping: "direct",
      sourceType: "VULMS",
      sourceNote: "Synthetic confirmed scope",
    };
    const units = d.lectures.filter((l) => l.courseId === a.courseId);
    setLectureStatus(d, units[0].id, "completed");
    setLectureStatus(d, units[1].id, "completed");
    revise(d, units[0].id);
    revise(d, units[0].id);
    a.practice = {
      percent: 82,
      recordedAt: new Date().toISOString(),
      sourceNote: "Synthetic practice result",
    };
    const r = assessmentReadiness(d, a);
    expect(r).toMatchObject({
      calculable: true,
      total: 4,
      studied: 2,
      revised: 1,
      practice: { percent: 82 },
    });
  });
  it("round-trips planner, source and lock history in backup/restore", () => {
    const { d, semesterId } = fixture();
    urgent(d);
    saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "Keep this",
      true,
    );
    expect(parseBackup(exportBackup(d))).toEqual(validateData(d));
  });
  it("migrates real pre-patch v2-shaped records without losing existing data", () => {
    const { d } = fixture();
    urgent(d);
    setLectureStatus(d, d.lectures[0].id, "completed");
    const old = JSON.parse(JSON.stringify(d));
    old.schemaVersion = 2;
    delete old.dailyPlans;
    delete old.settings.planner;
    old.assessments.forEach((a: Record<string, unknown>) => delete a.coverage);
    const before = JSON.stringify(old);
    const migrated = migrateData(old);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.dailyPlans).toEqual([]);
    expect(migrated.lectures).toEqual(d.lectures);
    expect(migrated.courses.map((c) => c.id)).toEqual(
      d.courses.map((c) => c.id),
    );
    expect(migrated.assessments[0].deadline).toEqual(d.assessments[0].deadline);
    expect(migrated.assessments[0].coverage?.verification).toBe("awaiting");
    expect(JSON.stringify(old)).toBe(before);
    const backup = JSON.stringify({
      format: "vu-study-desk",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      applicationVersion: "1.0.0",
      data: old,
    });
    expect(parseBackup(backup)).toEqual(migrated);
  });
  it("rejects broken plan associations, duplicate days and unverified official claims", () => {
    const { d, semesterId } = fixture();
    const p = saveDayPlan(
      d,
      semesterId,
      day,
      recommendDay(d, semesterId, day).items,
      "",
      true,
    );
    const bad = structuredClone(d);
    bad.dailyPlans[0].items[0].lectureId = d.lectures.at(-1)!.id;
    expect(() => validateData(bad)).toThrow(/Plan lecture/);
    d.dailyPlans.push({ ...p, ...stamp() });
    expect(() => validateData(d)).toThrow(/Duplicate daily/);
    const other = fixture().d;
    const a = urgent(other);
    a.coverage = {
      ...unknownCoverage(),
      type: "numbered",
      startUnit: 1,
      endUnit: 4,
      verification: "verified",
      mapping: "direct",
      sourceType: "Personal Plan",
      sourceNote: "Not official",
    };
    expect(() => validateData(other)).toThrow(/official source/);
  });
  it("excludes VU001 and archived/inactive offerings from recommendations", () => {
    const { d, semesterId } = fixture();
    d.courses[0].code = "VU001";
    d.courses[1].planning = {
      active: false,
      status: "On track",
      reason: "Done",
      catchUpMinutes: 0,
    };
    expect(
      rankCourses(d, semesterId, next).map((r) => r.course.id),
    ).not.toContain(d.courses[0].id);
    expect(
      rankCourses(d, semesterId, next).map((r) => r.course.id),
    ).not.toContain(d.courses[1].id);
    d.semesters[0].archived = true;
    expect(recommendDay(d, semesterId, next).items).toEqual([]);
  });
});
