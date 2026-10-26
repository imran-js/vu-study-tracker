import {
  calendarSettingsSchema,
  calendarMappingSchema,
  alertReceiptSchema,
  defaultCalendarSettings,
  defaultCalendarEligible,
} from "./calendar-model";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import {
  coverageSchema,
  coursePlanningSchema,
  dailyPlanSchema,
  plannerSettingsSchema,
  defaultPlannerSettings,
} from "./planner-model";

const id = z.string().min(1).max(200);
const text = z.string().max(20000);
const title = z.string().trim().min(1).max(300);
export const instant = z.string().refine((v) => {
  try {
    Temporal.Instant.from(v);
    return true;
  } catch {
    return false;
  }
}, "Invalid timestamp");
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      Temporal.PlainDate.from(v);
      return true;
    } catch {
      return false;
    }
  }, "Invalid date");
export const zone = z.string().refine((v) => {
  try {
    Temporal.Now.zonedDateTimeISO(v);
    return true;
  } catch {
    return false;
  }
}, "Invalid timezone");
const base = { id, createdAt: instant, updatedAt: instant };
export function isHttps(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
export function isDriveUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      ["drive.google.com", "docs.google.com"].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
const optionalUrl = z
  .string()
  .refine((v) => !v || isHttps(v), "Use an HTTPS URL");
const driveUrl = z
  .string()
  .refine(isDriveUrl, "Use an HTTPS drive.google.com or docs.google.com URL");
export const semesterSchema = z.object({
  ...base,
  name: title,
  startDate: date.optional(),
  endDate: date.optional(),
  archived: z.boolean(),
});
export const courseSchema = z.object({
  ...base,
  semesterId: id,
  code: title,
  title,
  credits: z.number().min(0).max(100).optional(),
  priority: z.enum(["low", "normal", "high"]),
  lectureTotal: z.number().int().min(0).max(2000).optional(),
  notes: text,
  folderUrl: z.union([z.literal(""), driveUrl]),
  planning: coursePlanningSchema.optional(),
  baselineUnitIds: z.array(id).optional(),
  cs101ScheduleVersion: z.string().max(100).optional(),
});
export const lectureSchema = z.object({
  ...base,
  courseId: id,
  number: z.number().int().positive(),
  title,
  status: z.enum(["not started", "in progress", "completed"]),
  completedAt: instant.optional(),
  excluded: z.boolean(),
  nextRevision: date.optional(),
  needsRevision: z.boolean().optional(),
});
export const revisionSchema = z.object({
  ...base,
  lectureId: id,
  revisedAt: instant,
});
export const typeSchema = z.object({
  ...base,
  label: title,
  calendarEligible: z.boolean().optional(),
});
export const deadlineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("date"), date }),
  z.object({ kind: z.literal("timed"), at: instant, zone }),
]);
export const assessmentSchema = z.object({
  ...base,
  courseId: id,
  typeId: id,
  title,
  notes: text,
  sourceUrl: optionalUrl,
  opensOn: date.optional(),
  deadline: deadlineSchema,
  endsAt: instant.optional(),
  status: z.enum([
    "not started",
    "in progress",
    "submitted",
    "completed",
    "cancelled",
  ]),
  completedAt: instant.optional(),
  coverage: coverageSchema.optional(),
  calendarEligible: z.boolean().optional(),
  dateConfirmation: z
    .object({
      signature: z.string().max(2000),
      source: z.string().trim().min(1).max(2000),
      at: instant,
    })
    .optional(),
  marks: z.number().min(0).max(100000).optional(),
  practice: z
    .object({
      percent: z.number().min(0).max(100),
      recordedAt: instant,
      sourceNote: z.string().trim().min(1).max(20000),
    })
    .optional(),
});
export const intervalSchema = z.object({ start: instant, end: instant });
export const sessionSchema = z.object({
  ...base,
  semesterId: id,
  courseId: id.optional(),
  lectureId: id.optional(),
  assessmentId: id.optional(),
  title,
  notes: text,
  plannedStart: instant.optional(),
  plannedEnd: instant.optional(),
  status: z.enum(["planned", "completed", "cancelled", "missed"]),
  intervals: z.array(intervalSchema).max(10000),
});
export const resourceSchema = z.object({
  ...base,
  courseId: id,
  lectureId: id.optional(),
  title,
  url: driveUrl,
  tags: z.array(z.string().trim().min(1).max(100)).max(100),
  provider: z.literal("google-drive"),
  providerFileId: id.optional(),
});
export const timerSchema = z.object({
  sessionId: id,
  startedAt: instant.optional(),
  intervals: z.array(intervalSchema),
  savedAt: instant,
});
export const settingsSchema = z.object({
  timezone: zone,
  weekStart: z.union([z.literal(1), z.literal(7)]),
  weeklyTarget: z.number().min(1).max(10080).optional(),
  activeSemesterId: id,
  lastExportAt: instant.optional(),
  onboarded: z.boolean(),
  planner: plannerSettingsSchema,
  googleCalendar: calendarSettingsSchema,
});
export const planSchema = dailyPlanSchema(id, instant, date, zone);
export const datasetSchema = z.object({
  schemaVersion: z.literal(4),
  settings: settingsSchema,
  semesters: z.array(semesterSchema),
  courses: z.array(courseSchema),
  lectures: z.array(lectureSchema),
  revisions: z.array(revisionSchema),
  types: z.array(typeSchema),
  assessments: z.array(assessmentSchema),
  sessions: z.array(sessionSchema),
  resources: z.array(resourceSchema),
  dailyPlans: z.array(planSchema),
  calendarMappings: z.array(calendarMappingSchema),
  alertReceipts: z.array(alertReceiptSchema),
  timer: timerSchema.optional(),
});
export type Dataset = z.infer<typeof datasetSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Lecture = z.infer<typeof lectureSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type Deadline = z.infer<typeof deadlineSchema>;
export type Interval = z.infer<typeof intervalSchema>;
export type DailyPlan = z.infer<typeof planSchema>;
export function stamp() {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
export function initialData(): Dataset {
  const semester = {
    ...stamp(),
    name: "Semester 1 — Fall 2026",
    archived: false,
  };
  return {
    schemaVersion: 4,
    settings: {
      timezone: "Asia/Riyadh",
      weekStart: 1,
      activeSemesterId: semester.id,
      onboarded: false,
      planner: { ...defaultPlannerSettings },
      googleCalendar: defaultCalendarSettings(),
    },
    semesters: [semester],
    courses: [],
    lectures: [],
    revisions: [],
    types: ["Assignment", "Quiz", "GDB", "Exam"].map((label) => ({
      ...stamp(),
      label,
      calendarEligible: defaultCalendarEligible(label),
    })),
    assessments: [],
    sessions: [],
    resources: [],
    dailyPlans: [],
    calendarMappings: [],
    alertReceipts: [],
  };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateData(input: unknown): Dataset {
  const d = datasetSchema.parse(input);
  ensure(
    new Set(d.calendarMappings.map((m) => `${m.calendarId}:${m.assessmentId}`))
      .size === d.calendarMappings.length,
    "Duplicate Calendar mapping",
  );
  ensure(
    new Set(d.calendarMappings.map((m) => `${m.calendarId}:${m.eventId}`))
      .size === d.calendarMappings.length,
    "Duplicate external event mapping",
  );
  ensure(
    new Set(d.alertReceipts.map((r) => r.key)).size === d.alertReceipts.length,
    "Duplicate alert receipt",
  );
  const allIds = new Set<string>();
  for (const rows of [
    d.semesters,
    d.courses,
    d.lectures,
    d.revisions,
    d.types,
    d.assessments,
    d.sessions,
    d.resources,
    d.dailyPlans,
  ])
    for (const r of rows) {
      ensure(!allIds.has(r.id), "Duplicate record ID");
      allIds.add(r.id);
      ensure(
        Temporal.Instant.compare(r.updatedAt, r.createdAt) >= 0,
        "Updated timestamp precedes creation",
      );
    }
  const semesters = new Map(d.semesters.map((s) => [s.id, s]));
  const courses = new Map(d.courses.map((c) => [c.id, c]));
  const lectures = new Map(d.lectures.map((l) => [l.id, l]));
  const assessments = new Map(d.assessments.map((a) => [a.id, a]));
  ensure(
    semesters.has(d.settings.activeSemesterId),
    "Active semester is missing",
  );
  for (const s of d.semesters)
    ensure(
      !s.startDate || !s.endDate || s.startDate <= s.endDate,
      "Semester end precedes start",
    );
  for (const c of d.courses) {
    ensure(semesters.has(c.semesterId), "Course semester is missing");
    const ls = d.lectures.filter((l) => l.courseId === c.id);
    ensure(
      c.lectureTotal === undefined || ls.length <= c.lectureTotal,
      "Entered lectures exceed confirmed total",
    );
    ensure(
      new Set(ls.map((l) => l.number)).size === ls.length,
      "Duplicate lecture numbers within a course",
    );
  }
  for (const l of d.lectures) {
    ensure(courses.has(l.courseId), "Lecture course is missing");
    ensure(
      l.status !== "completed" || l.completedAt,
      "Completed lecture needs a timestamp",
    );
  }
  for (const r of d.revisions)
    ensure(lectures.has(r.lectureId), "Revision lecture is missing");
  for (const a of d.assessments) {
    ensure(courses.has(a.courseId), "Assessment course is missing");
    ensure(
      d.types.some((t) => t.id === a.typeId),
      "Assessment type is missing",
    );
    ensure(
      !a.endsAt ||
        (a.deadline.kind === "timed" &&
          Temporal.Instant.compare(a.endsAt, a.deadline.at) >= 0),
      "Assessment end precedes start",
    );
    if (a.opensOn && a.deadline.kind === "date")
      ensure(a.opensOn <= a.deadline.date, "Opening date follows deadline");
    if (a.opensOn && a.deadline.kind === "timed")
      ensure(
        a.opensOn <=
          Temporal.Instant.from(a.deadline.at)
            .toZonedDateTimeISO(a.deadline.zone)
            .toPlainDate()
            .toString(),
        "Opening date follows deadline",
      );
  }
  for (const r of d.resources) {
    ensure(courses.has(r.courseId), "Resource course is missing");
    ensure(
      !r.lectureId || lectures.get(r.lectureId)?.courseId === r.courseId,
      "Resource lecture must belong to its course",
    );
  }
  const planDays = new Set<string>();
  for (const plan of d.dailyPlans) {
    ensure(semesters.has(plan.semesterId), "Plan semester is missing");
    const key = `${plan.semesterId}:${plan.day}`;
    ensure(!planDays.has(key), "Duplicate daily plan for semester/date");
    planDays.add(key);
    ensure(
      plan.items[0].role === "Main" &&
        (plan.items.length === 1 || plan.items[1].role === "Secondary"),
      "A plan needs one Main and at most one Secondary item",
    );
    ensure(
      new Set(plan.items.map((i) => i.courseId)).size === plan.items.length,
      "Main and Secondary must be different courses",
    );
    ensure(
      plan.items.reduce((s, i) => s + i.minutes, 0) <= plan.maximumMinutes,
      "Daily plan exceeds its workload limit",
    );
    ensure(
      !plan.locked || plan.lockHistory.at(-1)?.action === "locked",
      "Locked plan needs explicit confirmation history",
    );
    for (const item of plan.items) {
      ensure(
        courses.get(item.courseId)?.semesterId === plan.semesterId,
        "Plan course must belong to its semester",
      );
      ensure(
        !item.lectureId ||
          lectures.get(item.lectureId)?.courseId === item.courseId,
        "Plan lecture must belong to its course",
      );
      const session = d.sessions.find((s) => s.id === item.sessionId);
      ensure(
        !item.sessionId ||
          (session?.semesterId === plan.semesterId &&
            session?.courseId === item.courseId),
        "Plan session must belong to its course and semester",
      );
    }
  }
  const intervals: { start: number; end: number }[] = [];
  function checkInterval(i: Interval) {
    const start = Date.parse(i.start),
      end = Date.parse(i.end);
    ensure(end > start, "Study interval must end after it starts");
    ensure(
      end <= Date.now() + 1000,
      "Actual study time cannot be in the future",
    );
    intervals.push({ start, end });
  }
  for (const s of d.sessions) {
    ensure(semesters.has(s.semesterId), "Session semester is missing");
    ensure(
      !s.courseId || courses.get(s.courseId)?.semesterId === s.semesterId,
      "Session course must belong to its semester",
    );
    ensure(
      !s.lectureId ||
        (!!s.courseId && lectures.get(s.lectureId)?.courseId === s.courseId),
      "Session lecture must belong to its course",
    );
    ensure(
      !s.assessmentId ||
        (!!s.courseId &&
          assessments.get(s.assessmentId)?.courseId === s.courseId),
      "Session assessment must belong to its course",
    );
    ensure(
      !!s.plannedStart === !!s.plannedEnd,
      "Provide both planned start and end",
    );
    ensure(
      !s.plannedStart || Date.parse(s.plannedEnd!) > Date.parse(s.plannedStart),
      "Planned end must follow start",
    );
    ensure(
      s.status !== "cancelled" || s.intervals.length === 0,
      "A session with actual time cannot be cancelled",
    );
    s.intervals.forEach(checkInterval);
  }
  if (d.timer) {
    const s = d.sessions.find((s) => s.id === d.timer!.sessionId);
    ensure(
      s && s.status !== "cancelled",
      "Timer session is missing or cancelled",
    );
    d.timer.intervals.forEach(checkInterval);
    if (d.timer.startedAt) {
      const start = Date.parse(d.timer.startedAt);
      ensure(start <= Date.now() + 1000, "Timer starts in the future");
      ensure(
        !intervals.some((i) => i.end > start),
        "Running timer overlaps recorded study time",
      );
    }
  }
  intervals.sort((a, b) => a.start - b.start);
  for (let i = 1; i < intervals.length; i++)
    ensure(
      intervals[i].start >= intervals[i - 1].end,
      "Study intervals overlap. Correct the times to prevent double-counting.",
    );
  return d;
}
