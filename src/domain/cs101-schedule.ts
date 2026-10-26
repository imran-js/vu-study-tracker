import { stamp, type Assessment, type Dataset } from "./model";
import { dateSignature } from "./calendar";
import { usesWeeklyFramework } from "./weekly-framework";

export const cs101ScheduleVersion = "official-fall-2026-2026-10-26";
export const cs101Source =
  "CS101 Fall 2026 Activities Schedule and 20% Rule — official VU announcement supplied by the student on 26 October 2026. Calendar dates take precedence over inconsistent weekday labels; no official times supplied.";
export const cs101Activities = [
  {
    key: "quiz-1",
    title: "Semester Quiz 1",
    type: "Quiz",
    opens: "2026-11-02",
    closes: "2026-11-05",
    start: 1,
    end: 38,
  },
  {
    key: "quiz-2",
    title: "Semester Quiz 2",
    type: "Quiz",
    opens: "2026-11-09",
    closes: "2026-11-12",
    start: 38,
    end: 51,
  },
  {
    key: "gdb",
    title: "GDB",
    type: "GDB",
    opens: "2026-11-16",
    closes: "2026-11-18",
    start: 51,
    end: 65,
  },
  {
    key: "quiz-3",
    title: "Semester Quiz 3",
    type: "Quiz",
    opens: "2026-12-01",
    closes: "2026-12-03",
    start: 51,
    end: 95,
  },
  {
    key: "midterm",
    title: "Midterm Exam",
    type: "Exam",
    opens: "2026-12-07",
    closes: "2026-12-07",
    start: 1,
    end: 108,
  },
  {
    key: "quiz-4",
    title: "Semester Quiz 4",
    type: "Quiz",
    opens: "2026-12-22",
    closes: "2026-12-24",
    start: 95,
    end: 108,
  },
  {
    key: "quiz-5",
    title: "Semester Quiz 5",
    type: "Quiz",
    opens: "2026-12-29",
    closes: "2026-12-31",
    start: 146,
    end: 162,
  },
  {
    key: "quiz-6",
    title: "Semester Quiz 6",
    type: "Quiz",
    opens: "2027-01-05",
    closes: "2027-01-07",
    start: 162,
    end: 193,
  },
  {
    key: "final",
    title: "Final Exam",
    type: "Exam",
    opens: "2027-01-25",
    closes: "2027-01-25",
    start: 108,
    end: 230,
  },
] as const;

function activityKey(title: string) {
  const normalized = title.toLowerCase().replace(/cs\s*101/g, "");
  const quiz = normalized.match(/\bquiz\s*[-:#]?\s*0?([1-6])\b/);
  if (quiz) return `quiz-${quiz[1]}`;
  if (/\bgdb\b|graded discussion board/.test(normalized)) return "gdb";
  if (/\bmid[\s-]*term\b/.test(normalized)) return "midterm";
  if (/\bfinal\b/.test(normalized)) return "final";
}

// One-time per existing Fall 2026 CS101 course, persisted in backups and cloud.
// Keep record IDs and every personal field so sessions and Calendar mappings survive.
export function applyCs101Schedule(d: Dataset) {
  for (const course of d.courses) {
    if (
      course.code.trim().toUpperCase() !== "CS101" ||
      !usesWeeklyFramework(d, course.semesterId) ||
      course.cs101ScheduleVersion === cs101ScheduleVersion
    )
      continue;
    for (const activity of cs101Activities) {
      const matches = d.assessments.filter(
        (a) =>
          a.courseId === course.id && activityKey(a.title) === activity.key,
      );
      if (!matches.length) {
        let type = d.types.find(
          (t) => t.label.toLowerCase() === activity.type.toLowerCase(),
        );
        if (!type) {
          type = { ...stamp(), label: activity.type, calendarEligible: true };
          d.types.push(type);
        }
        const assessment: Assessment = {
          ...stamp(),
          courseId: course.id,
          typeId: type.id,
          title: activity.title,
          notes: "",
          sourceUrl: "",
          status: "not started",
          deadline: { kind: "none" },
        };
        d.assessments.push(assessment);
        matches.push(assessment);
      }
      // If pre-existing duplicate records exist, retain their independent history;
      // update all matches and never create another one.
      for (const a of matches) {
        a.opensOn = activity.opens;
        a.deadline = { kind: "date", date: activity.closes };
        delete a.endsAt;
        a.coverage = {
          type: "numbered",
          verification: "verified",
          officialText: `Topics ${activity.start}–${activity.end}`,
          startUnit: activity.start,
          endUnit: activity.end,
          // Official topic numbers are not necessarily the tracked module numbers.
          mapping: "unconfirmed",
          readingDependency: "",
          sourceType: "Official VU Announcement",
          sourceNote: cs101Source,
        };
        a.updatedAt = new Date().toISOString();
        a.dateConfirmation = {
          signature: dateSignature(a),
          source: cs101Source,
          at: a.updatedAt,
        };
      }
    }
    course.cs101ScheduleVersion = cs101ScheduleVersion;
  }
}
