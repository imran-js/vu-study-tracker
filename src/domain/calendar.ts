import { Temporal } from "@js-temporal/polyfill";
import type { Assessment, Dataset } from "./model";
import { addDays } from "./dates";

export function dateSignature(a: Assessment) {
  return JSON.stringify([
    a.opensOn || null,
    a.deadline.kind === "timed"
      ? { ...a.deadline, at: Temporal.Instant.from(a.deadline.at).toString() }
      : a.deadline,
    a.endsAt ? Temporal.Instant.from(a.endsAt).toString() : null,
  ]);
}
export function datesConfirmed(a: Assessment) {
  return (
    a.deadline.kind !== "none" &&
    a.dateConfirmation?.signature === dateSignature(a)
  );
}
export function calendarEligible(d: Dataset, a: Assessment) {
  return (
    a.calendarEligible ??
    d.types.find((t) => t.id === a.typeId)?.calendarEligible ??
    false
  );
}
export function closingDeadline(a: Assessment) {
  return a.endsAt && a.deadline.kind === "timed"
    ? { ...a.deadline, at: a.endsAt }
    : a.deadline;
}
export function coverageText(a: Assessment) {
  const c = a.coverage;
  if (
    !c ||
    c.type === "unknown" ||
    c.verification !== "verified" ||
    !c.sourceNote.trim() ||
    !["VULMS", "Official VU Announcement", "Official Handout"].includes(
      c.sourceType,
    )
  )
    return "Topic coverage: Awaiting official VU announcement";
  return `Coverage: ${c.type === "numbered" ? `Topics ${c.startUnit}–${c.endUnit}` : c.officialText}\n${c.readingDependency ? `Reading dependency: ${c.readingDependency}\n` : ""}${c.readingStart !== undefined && c.readingEnd !== undefined ? `Reading range: ${c.readingStart}–${c.readingEnd}\n` : ""}Coverage source: ${c.sourceType} — ${c.sourceNote}`;
}
export type CalendarEventBody = {
  summary: string;
  description: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  transparency: "transparent";
  reminders: {
    useDefault: false;
    overrides: { method: "popup"; minutes: number }[];
  };
  extendedProperties: {
    private: { application: string; assessmentId: string };
  };
};
export function calendarEvent(d: Dataset, a: Assessment): CalendarEventBody {
  if (!datesConfirmed(a))
    throw new Error("Confirm the current official dates before syncing.");
  const c = d.courses.find((c) => c.id === a.courseId)!;
  const deadline = a.deadline;
  if (deadline.kind === "none") throw new Error("No date to sync");
  const start =
    deadline.kind === "date"
      ? { date: a.opensOn || deadline.date }
      : { dateTime: deadline.at, timeZone: deadline.zone };
  // A point deadline needs a small display marker, explicitly not an academic duration.
  const end =
    deadline.kind === "date"
      ? { date: addDays(deadline.date, 1) }
      : {
          dateTime:
            a.endsAt && Temporal.Instant.compare(a.endsAt, deadline.at) > 0
              ? a.endsAt
              : Temporal.Instant.from(deadline.at)
                  .add({ minutes: 1 })
                  .toString(),
          timeZone: deadline.zone,
        };
  const close = closingDeadline(a);
  const closing =
    close.kind === "date"
      ? `${close.date} (date only; no official time supplied)`
      : close.kind === "timed"
        ? `${Temporal.Instant.from(close.at).toZonedDateTimeISO(close.zone).toString()} (${close.zone})`
        : "Unknown";
  const prefs = d.settings.googleCalendar;
  const minutes =
    a.status === "cancelled"
      ? []
      : [
          ...new Set([
            ...prefs.reminders,
            ...(prefs.openingReminder && a.opensOn && deadline.kind === "date"
              ? [0]
              : []),
          ]),
        ];
  return {
    summary: `${a.status === "cancelled" ? "Cancelled · " : ""}${c.code} – ${a.title}`,
    description: `Course: ${c.code} – ${c.title}\nAssessment: ${a.title}\n\n${coverageText(a)}\n${a.marks === undefined ? "" : `Marks: ${a.marks}\n`}Date source: ${a.dateConfirmation!.source}\n${a.sourceUrl ? `Source link: ${a.sourceUrl}\n` : ""}Closing: ${closing}\nStudy Desk status: ${a.status}\n\nStudy Desk is the source of truth. Changes here do not modify academic records. Point deadlines without an official duration use a one-minute calendar marker only. Reminders are relative to this event's start (opening for date ranges), not its closing date.`,
    start,
    end,
    transparency: "transparent",
    reminders: {
      useDefault: false,
      overrides: minutes.map((minutes) => ({ method: "popup", minutes })),
    },
    extendedProperties: {
      private: { application: "vu-study-desk", assessmentId: a.id },
    },
  };
}
export function calendarSource(d: Dataset, a: Assessment) {
  return JSON.stringify(calendarEvent(d, a));
}
export function calendarStatus(d: Dataset, a: Assessment, connected = true) {
  const m = d.calendarMappings.find(
    (m) =>
      m.assessmentId === a.id &&
      m.calendarId === d.settings.googleCalendar.calendarId,
  );
  if (!connected) return "Calendar disconnected";
  if (!m || m.status === "removed") return "Not synced";
  if (m.status === "failed") return "Sync failed";
  if (m.status === "pending") return "Sync pending · retry available";
  if (!datesConfirmed(a) || m.sourceHash !== calendarSource(d, a))
    return "Update available";
  return "Synced";
}
