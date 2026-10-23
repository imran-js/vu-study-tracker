import { Temporal } from "@js-temporal/polyfill";
import type { Dataset } from "./model";
import { today, deadlineDay, isOverdue, addDays, dayOf } from "./dates";
import { assessmentReadiness } from "./readiness";
import { closingDeadline, coverageText, dateSignature } from "./calendar";

export type StudyAlert = {
  key: string;
  fingerprint: string;
  level: "Critical" | "Important" | "Informational";
  title: string;
  reason: string;
  relevance: string;
  courseId: string;
  assessmentId?: string;
  state?: "read" | "dismissed";
};
export function studyAlerts(
  d: Dataset,
  semesterId: string,
  now = Temporal.Now.instant(),
): StudyAlert[] {
  const day = today(d.settings.timezone, now),
    alerts: StudyAlert[] = [];
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  for (const a of d.assessments) {
    const c = courses.find((c) => c.id === a.courseId);
    if (!c || ["completed", "submitted", "cancelled"].includes(a.status))
      continue;
    const close = closingDeadline(a),
      closeDay = deadlineDay(close, d.settings.timezone);
    const changed =
      !!a.dateConfirmation && a.dateConfirmation.signature !== dateSignature(a);
    const opening =
      a.opensOn && a.opensOn >= day && a.opensOn <= addDays(day, 7)
        ? a.opensOn
        : undefined;
    const due = closeDay && closeDay <= addDays(day, 7);
    if (!due && !opening && !changed) continue;
    const relevant = due ? closeDay! : opening || day;
    const days = Temporal.PlainDate.from(day).until(relevant).days;
    const overdue = isOverdue(close, d.settings.timezone, now);
    const readiness = assessmentReadiness(d, a);
    const level =
      overdue || closeDay === day
        ? "Critical"
        : changed ||
            days <= 3 ||
            (readiness.calculable && readiness.studied < readiness.total / 2)
          ? "Important"
          : "Informational";
    const phase = overdue
      ? "overdue"
      : closeDay === day
        ? "closing today"
        : due
          ? `closes in ${days} days`
          : opening
            ? `opens in ${days} days`
            : "date changed";
    const reason = `${changed ? "Official date changed; verify it again. " : ""}${coverageText(a)}${readiness.calculable ? `\nStudied: ${readiness.studied}/${readiness.total} · Readiness: ${Math.round((readiness.studied / readiness.total) * 100)}%` : readiness.reason === coverageText(a) ? "" : `\n${readiness.reason}`}`;
    // Daily countdown and small progress edits do not resurrect dismissed alerts.
    // A changed date/coverage, priority band, or opening/closing phase does.
    const fingerprint = JSON.stringify([
      dateSignature(a),
      a.title,
      a.coverage,
      level,
      overdue
        ? "overdue"
        : closeDay === day
          ? "closing"
          : due
            ? "due"
            : "opening",
      changed,
    ]);
    alerts.push({
      key: `assessment:${a.id}`,
      fingerprint,
      level,
      title: `${c.code} · ${a.title} — ${phase}`,
      reason,
      relevance: relevant,
      courseId: c.id,
      assessmentId: a.id,
    });
  }
  for (const c of courses) {
    const due = d.lectures.filter(
      (l) =>
        l.courseId === c.id &&
        !l.excluded &&
        l.status === "completed" &&
        (l.needsRevision || (l.nextRevision && l.nextRevision <= day)),
    );
    const studied = d.sessions
      .filter((s) => s.courseId === c.id)
      .flatMap((s) => s.intervals)
      .map((i) => dayOf(i.end, d.settings.timezone))
      .sort()
      .at(-1);
    const behind =
      c.planning?.active !== false &&
      ["Behind", "Needs attention"].includes(c.planning?.status || "") &&
      (!studied || studied < addDays(day, -7));
    if (!due.length && !behind) continue;
    alerts.push({
      key: `course:${c.id}`,
      fingerprint: JSON.stringify([
        due.map((l) => [l.id, l.nextRevision, l.needsRevision]).sort(),
        behind,
        c.planning?.status,
        studied,
      ]),
      level: "Informational",
      title: `${c.code} needs attention`,
      reason: [
        due.length ? `${due.length} lecture(s) due for revision.` : "",
        behind
          ? `${c.planning?.status}; no study logged in the last seven days.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      relevance:
        due
          .map((l) => l.nextRevision)
          .filter(Boolean)
          .sort()[0] ||
        studied ||
        day,
      courseId: c.id,
    });
  }
  const order = { Critical: 0, Important: 1, Informational: 2 };
  return alerts
    .map((a) => ({
      ...a,
      state: d.alertReceipts.find(
        (r) => r.key === a.key && r.fingerprint === a.fingerprint,
      )?.state,
    }))
    .sort(
      (a, b) =>
        order[a.level] - order[b.level] ||
        a.relevance.localeCompare(b.relevance),
    );
}
export function acknowledgeAlert(
  d: Dataset,
  a: StudyAlert,
  state: "read" | "dismissed",
) {
  d.alertReceipts = d.alertReceipts.filter((r) => r.key !== a.key);
  d.alertReceipts.push({
    key: a.key,
    fingerprint: a.fingerprint,
    state,
    at: new Date().toISOString(),
  });
}
