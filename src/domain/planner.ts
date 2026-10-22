import { Temporal } from "@js-temporal/polyfill";
import { addDays, dayOf, deadlineDay, minutes, today } from "./dates";
import { stamp, type DailyPlan, type Dataset, type Course } from "./model";
import { assessmentReadiness } from "./readiness";

export const activePlanningCourses = (d: Dataset, semesterId: string) =>
  d.semesters.find((s) => s.id === semesterId)?.archived
    ? []
    : d.courses.filter(
        (c) =>
          c.semesterId === semesterId &&
          c.planning?.active !== false &&
          c.code.toUpperCase() !== "VU001",
      );
const daysBetween = (from: string, to: string) =>
  Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days;
export function planOutcome(
  d: Dataset,
  plan: DailyPlan,
  asOf = today(plan.zone),
) {
  if (plan.items.every((i) => i.status === "completed")) return "Completed";
  const partial = plan.items.some(
    (i) =>
      i.status === "completed" ||
      i.status === "partial" ||
      (i.sessionId &&
        minutes(d.sessions.find((s) => s.id === i.sessionId)?.intervals || []) >
          0),
  );
  if (partial) return "Partial";
  if (plan.day < asOf || plan.items.every((i) => i.status === "skipped"))
    return "Missed";
  return plan.locked ? "Planned" : "Draft";
}
export function lastStudiedDay(d: Dataset, courseId: string, asOf: string) {
  const zone = d.settings.timezone;
  const days = [
    ...d.sessions
      .filter((s) => s.courseId === courseId)
      .flatMap((s) => s.intervals.map((i) => dayOf(i.end, zone))),
    ...d.lectures
      .filter((l) => l.courseId === courseId && l.completedAt)
      .map((l) => dayOf(l.completedAt!, zone)),
    ...d.revisions
      .filter((r) =>
        d.lectures.some((l) => l.id === r.lectureId && l.courseId === courseId),
      )
      .map((r) => dayOf(r.revisedAt, zone)),
  ]
    .filter((day) => day <= asOf)
    .sort();
  return days.at(-1);
}
export function nextStudyUnit(d: Dataset, courseId: string, day: string) {
  const units = d.lectures
    .filter((l) => l.courseId === courseId && !l.excluded)
    .sort((a, b) => a.number - b.number);
  return (
    units.find(
      (l) => l.needsRevision || (l.nextRevision && l.nextRevision <= day),
    ) || units.find((l) => l.status !== "completed")
  );
}
export function openAssessments(d: Dataset, courseId: string) {
  return d.assessments.filter(
    (a) =>
      a.courseId === courseId &&
      !["submitted", "completed", "cancelled"].includes(a.status),
  );
}
export function assessmentPlanningDay(
  d: Dataset,
  a: Dataset["assessments"][number],
  target: string,
) {
  const due = deadlineDay(a.deadline, d.settings.timezone);
  // Preparation aims for the opening day; an already-open assessment uses its deadline.
  return a.opensOn && a.opensOn >= target ? a.opensOn : due;
}
export function recoveryMinutes(
  d: Dataset,
  courseId: string,
  targetDay: string,
) {
  const entries = d.dailyPlans
    .filter((p) => p.day < targetDay)
    .flatMap((p) =>
      p.items
        .filter((i) => i.courseId === courseId && i.status !== "completed")
        .map((item) => ({ plan: p, item })),
    )
    .filter(({ plan, item }) => {
      const unit = d.lectures.find((l) => l.id === item.lectureId);
      return !(
        unit?.status === "completed" &&
        unit.completedAt &&
        dayOf(unit.completedAt, plan.zone) >= plan.day
      );
    });
  if (!entries.length) return 0;
  const first = entries.map((e) => e.plan.day).sort()[0];
  const linked = new Set(entries.map((e) => e.item.sessionId).filter(Boolean));
  const debt = entries.reduce(
    (sum, { item }) =>
      sum +
      Math.max(
        0,
        item.minutes -
          minutes(
            d.sessions.find((s) => s.id === item.sessionId)?.intervals || [],
          ),
      ),
    0,
  );
  const laterTime = d.sessions
    .filter((s) => s.courseId === courseId && !linked.has(s.id))
    .flatMap((s) => s.intervals)
    .filter((i) => {
      const day = dayOf(i.end, d.settings.timezone);
      return day > first && day < targetDay;
    });
  return Math.max(0, debt - minutes(laterTime));
}
export function rankCourses(d: Dataset, semesterId: string, targetDay: string) {
  return activePlanningCourses(d, semesterId)
    .map((course) => {
      let score = 0;
      const reasons: string[] = [];
      const add = (n: number, reason: string) => {
        score += n;
        reasons.push(`${reason} (+${n})`);
      };
      const assessments = openAssessments(d, course.id)
        .map((a) => ({ a, day: assessmentPlanningDay(d, a, targetDay) }))
        .filter((x) => x.day)
        .sort((a, b) => a.day!.localeCompare(b.day!));
      const urgent = assessments[0];
      if (urgent) {
        const days = daysBetween(targetDay, urgent.day!);
        if (days <= 14) {
          add(
            days < 0 ? 100 : Math.max(10, 100 - days * 7),
            `${urgent.a.title}: ${days < 0 ? "overdue" : days === 0 ? "due/opening that day" : `due/opening in ${days} ${days === 1 ? "day" : "days"}`}`,
          );
          const ready = assessmentReadiness(d, urgent.a);
          if (ready.calculable && ready.studied < ready.total)
            add(
              15,
              `${ready.total - ready.studied} of ${ready.total} verified covered units still incomplete`,
            );
          else if (!ready.calculable) reasons.push(ready.reason);
        }
      }
      const status = course.planning?.status || "On track";
      const boost =
        status === "Behind"
          ? 25
          : status === "Needs attention"
            ? 12
            : status === "Temporarily high priority"
              ? 35
              : 0;
      if (boost)
        add(
          boost,
          `${status}${course.planning?.reason ? `: ${course.planning.reason}` : " (manually set)"}`,
        );
      if (course.priority === "high") add(12, "High course priority");
      if (course.priority === "low") {
        score -= 5;
        reasons.push("Low course priority (−5)");
      }
      const last = lastStudiedDay(d, course.id, targetDay);
      add(
        last ? Math.min(20, Math.max(0, daysBetween(last, targetDay)) * 3) : 15,
        last ? `Last studied ${last}` : "No study recorded yet",
      );
      const recent = d.sessions.filter(
        (s) =>
          s.courseId === course.id &&
          s.intervals.some(
            (i) =>
              dayOf(i.end, d.settings.timezone) >= addDays(targetDay, -7) &&
              dayOf(i.end, d.settings.timezone) < targetDay,
          ),
      ).length;
      score -= Math.min(12, recent * 3);
      if (recent)
        reasons.push(
          `${recent} recent study sessions (−${Math.min(12, recent * 3)})`,
        );
      const weak = d.lectures.filter(
        (l) =>
          l.courseId === course.id &&
          !l.excluded &&
          (l.needsRevision || (l.nextRevision && l.nextRevision <= targetDay)),
      ).length;
      if (weak)
        add(
          Math.min(18, weak * 3),
          `${weak} revision/weak units need attention`,
        );
      const unfinished = recoveryMinutes(d, course.id, targetDay);
      const catchUp = Math.min(
        20,
        unfinished + (course.planning?.catchUpMinutes || 0),
      );
      if (catchUp)
        add(
          catchUp,
          "Unfinished planned work / catch-up need; recovery is capped and gradual",
        );
      const booked = d.sessions
        .filter(
          (s) =>
            s.courseId === course.id &&
            s.status !== "cancelled" &&
            s.plannedStart &&
            dayOf(s.plannedStart, d.settings.timezone) === targetDay,
        )
        .reduce(
          (sum, s) =>
            sum +
            (Date.parse(s.plannedEnd!) - Date.parse(s.plannedStart!)) / 60000,
          0,
        );
      if (booked) {
        score -= Math.min(20, Math.round(booked / 5));
        reasons.push(
          `${Math.round(booked)} minutes already scheduled that day`,
        );
      }
      return { course, score, reasons };
    })
    .sort(
      (a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code),
    );
}
export function recommendDay(
  d: Dataset,
  semesterId: string,
  targetDay: string,
  light = false,
) {
  const settings = d.settings.planner;
  const booked = d.sessions
    .filter(
      (s) =>
        s.semesterId === semesterId &&
        s.status !== "cancelled" &&
        s.plannedStart &&
        dayOf(s.plannedStart, d.settings.timezone) === targetDay,
    )
    .reduce(
      (sum, s) =>
        sum + (Date.parse(s.plannedEnd!) - Date.parse(s.plannedStart!)) / 60000,
      0,
    );
  const budget = Math.max(
    0,
    Math.floor(
      Math.min(
        light ? settings.lightMinutes : settings.normalMinutes,
        settings.maximumMinutes,
      ) - booked,
    ),
  );
  const rankings = rankCourses(d, semesterId, targetDay);
  const chosen = rankings.slice(0, budget >= 30 ? 2 : 1);
  const total = chosen.length ? budget : 0;
  const main = chosen.length === 2 ? Math.ceil(total * 0.7) : total;
  const items: DailyPlan["items"] =
    total > 0
      ? chosen.map((r, i) => {
          const urgent = openAssessments(d, r.course.id).sort((a, b) =>
            (assessmentPlanningDay(d, a, targetDay) || "9999").localeCompare(
              assessmentPlanningDay(d, b, targetDay) || "9999",
            ),
          )[0];
          const c =
            urgent && assessmentReadiness(d, urgent).calculable
              ? urgent.coverage
              : undefined;
          const covered = c
            ? d.lectures
                .filter(
                  (l) =>
                    l.courseId === r.course.id &&
                    !l.excluded &&
                    l.number >= c.startUnit! &&
                    l.number <= c.endUnit! &&
                    l.status !== "completed",
                )
                .sort((a, b) => a.number - b.number)[0]
            : undefined;
          const unit = covered || nextStudyUnit(d, r.course.id, targetDay);
          return {
            role: i === 0 ? "Main" : "Secondary",
            courseId: r.course.id,
            lectureId: unit?.id,
            focus: unit?.title || "Review current material",
            minutes: i === 0 ? main : total - main,
            reason: r.reasons
              .slice(0, 3)
              .map((reason) =>
                reason.length > 220 ? `${reason.slice(0, 217)}…` : reason,
              )
              .join(" · "),
            source: "Recommendation",
            status: "pending",
          };
        })
      : [];
  return {
    items,
    rankings,
    booked,
    total,
    explanation: booked
      ? `${Math.round(booked)} min already scheduled; recommendations use the remaining daily budget.`
      : "Conservative daily budget; overdue work raises priority, not daily hours.",
  };
}

function assignment(plan: DailyPlan) {
  return {
    id: plan.id,
    semesterId: plan.semesterId,
    day: plan.day,
    zone: plan.zone,
    notes: plan.notes,
    maximumMinutes: plan.maximumMinutes,
    createdAt: plan.createdAt,
    items: plan.items.map(({ status, sessionId, ...item }) => item),
  };
}
export function assertPlanTransitions(before: Dataset, after: Dataset) {
  for (const previous of before.dailyPlans) {
    const next = after.dailyPlans.find((p) => p.id === previous.id);
    if (
      previous.day < today(previous.zone) &&
      JSON.stringify(previous) !== JSON.stringify(next)
    )
      throw new Error("Historical daily plans cannot be rewritten or moved");
    if (previous.locked) {
      if (
        !next ||
        JSON.stringify(assignment(previous)) !==
          JSON.stringify(assignment(next))
      )
        throw new Error("Unlock today's plan before changing its assignment");
      if (
        !next.locked &&
        (next.lockHistory.length !== previous.lockHistory.length + 1 ||
          next.lockHistory.at(-1)?.action !== "unlocked")
      )
        throw new Error("Use the explicit Unlock today's plan action");
    }
  }
}
export function saveDayPlan(
  d: Dataset,
  semesterId: string,
  day: string,
  items: DailyPlan["items"],
  notes: string,
  lock = false,
  now = new Date().toISOString(),
) {
  const currentDay = dayOf(now, d.settings.timezone);
  if (day < currentDay) throw new Error("Historical plans cannot be rewritten");
  const old = d.dailyPlans.find(
    (p) => p.semesterId === semesterId && p.day === day,
  );
  if (old?.locked)
    throw new Error("Unlock today's plan before editing or replanning");
  if (lock && day !== currentDay)
    throw new Error(
      "Only today's plan can be locked; tomorrow remains a draft",
    );
  const cap = d.settings.planner.maximumMinutes;
  const plan: DailyPlan = {
    ...(old || { ...stamp(), createdAt: now }),
    updatedAt: now,
    semesterId,
    day,
    zone: old?.zone || d.settings.timezone,
    locked: lock,
    notes,
    maximumMinutes: cap,
    lockHistory: [
      ...(old?.lockHistory || []),
      ...(lock ? [{ at: now, action: "locked" as const }] : []),
    ],
    items: structuredClone(items).map((item) => {
      const previous = old?.items.find(
        (i) =>
          i.role === item.role &&
          i.courseId === item.courseId &&
          i.lectureId === item.lectureId,
      );
      return {
        ...item,
        status: previous?.status || "pending",
        sessionId: previous?.sessionId,
      };
    }),
  };
  if (plan.items.reduce((s, i) => s + i.minutes, 0) > cap)
    throw new Error("Plan exceeds the daily workload maximum");
  const booked = d.sessions
    .filter(
      (s) =>
        s.semesterId === semesterId &&
        s.status !== "cancelled" &&
        s.plannedStart &&
        dayOf(s.plannedStart, d.settings.timezone) === day,
    )
    .reduce(
      (sum, s) =>
        sum + (Date.parse(s.plannedEnd!) - Date.parse(s.plannedStart!)) / 60000,
      0,
    );
  if (plan.items.reduce((sum, i) => sum + i.minutes, 0) + booked > cap)
    throw new Error(
      "Plan plus existing scheduled sessions exceeds the daily workload maximum",
    );
  if (old) d.dailyPlans[d.dailyPlans.indexOf(old)] = plan;
  else d.dailyPlans.push(plan);
  return plan;
}
export function unlockDayPlan(
  d: Dataset,
  planId: string,
  now = new Date().toISOString(),
) {
  const plan = d.dailyPlans.find((p) => p.id === planId);
  if (!plan || plan.day !== dayOf(now, plan.zone))
    throw new Error("Only today's plan can be unlocked");
  plan.locked = false;
  plan.updatedAt = now;
  plan.lockHistory.push({ at: now, action: "unlocked" });
}
