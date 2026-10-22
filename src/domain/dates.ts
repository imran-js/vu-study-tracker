import { Temporal } from "@js-temporal/polyfill";
import type { Deadline, Interval } from "./model";
export function today(zone: string, now = Temporal.Now.instant()) {
  return now.toZonedDateTimeISO(zone).toPlainDate().toString();
}
export function dayOf(at: string, zone: string) {
  return Temporal.Instant.from(at)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function addDays(day: string, n: number) {
  return Temporal.PlainDate.from(day).add({ days: n }).toString();
}
export function weekStart(day: string, first = 1) {
  const p = Temporal.PlainDate.from(day);
  return p.subtract({ days: (p.dayOfWeek - first + 7) % 7 }).toString();
}
export function localToInstant(value: string, zone: string) {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(zone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function localInput(at: string, zone: string) {
  return Temporal.Instant.from(at)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export function localSeconds(at: string, zone: string) {
  return Temporal.Instant.from(at)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "second" });
}
export function formatInstant(at: string, zone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}
export function deadlineDay(d: Deadline, zone: string) {
  return d.kind === "date"
    ? d.date
    : d.kind === "timed"
      ? dayOf(d.at, zone)
      : undefined;
}
export function deadlineLabel(d: Deadline, zone: string) {
  return d.kind === "date"
    ? `${d.date} · date only`
    : d.kind === "timed"
      ? formatInstant(d.at, zone)
      : "Date not set";
}
export function isOverdue(
  d: Deadline,
  zone: string,
  now = Temporal.Now.instant(),
) {
  return d.kind === "date"
    ? d.date < today(zone, now)
    : d.kind === "timed" && Temporal.Instant.compare(d.at, now) < 0;
}
export function minutes(intervals: Interval[]) {
  return intervals.reduce(
    (sum, i) => sum + (Date.parse(i.end) - Date.parse(i.start)) / 60000,
    0,
  );
}
export function minutesByDay(intervals: Interval[], zone: string) {
  const result: Record<string, number> = {};
  for (const i of intervals) {
    let start = Temporal.Instant.from(i.start);
    const end = Temporal.Instant.from(i.end);
    while (Temporal.Instant.compare(start, end) < 0) {
      const z = start.toZonedDateTimeISO(zone);
      const day = z.toPlainDate().toString();
      const next = z
        .toPlainDate()
        .add({ days: 1 })
        .toZonedDateTime({ timeZone: zone })
        .toInstant();
      const stop = Temporal.Instant.compare(next, end) < 0 ? next : end;
      result[day] =
        (result[day] || 0) +
        (stop.epochMilliseconds - start.epochMilliseconds) / 60000;
      start = stop;
    }
  }
  return result;
}
export function duration(value: number) {
  const m = Math.round(value);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
