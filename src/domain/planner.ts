import { Temporal } from "@js-temporal/polyfill";
import { addDays, dayOf, deadlineDay, minutes, today } from "./dates";
import { stamp, type DailyPlan, type Dataset, type Course } from "./model";
import { assessmentReadiness } from "./readiness";
import {
  fixedDay,
  weekdayIndex,
  weeklySubjects,
  weeklyUnit,
  weeklyUnitNumber,
} from "./weekly-framework";

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
  if (plan.items.every((i) => i.status === "completed"))
    return fixedDay(d, plan.semesterId, plan.day) ? "Complete" : "Completed";
  const partial = plan.items.some(
    (i) =>
      i.status === "completed" ||
      i.status === "partial" ||
      (i.sessionId && d.timer?.sessionId === i.sessionId) ||
      (i.sessionId &&
        minutes(d.sessions.find((s) => s.id === i.sessionId)?.intervals || []) >
          0),
  );
  if (partial)
    return fixedDay(d, plan.semesterId, plan.day) ? "In Progress" : "Partial";
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
  const fixed = fixedDay(d, semesterId, targetDay);
  const weekday = weekdayIndex(targetDay);
  const quizPriority =
    fixed && ["2026-10-31", "2026-11-01"].includes(targetDay)
      ? d.assessments.find((a) => {
          if (
            d.courses
              .find((course) => course.id === a.courseId)
              ?.code.trim()
              .toUpperCase() !== "CS101" ||
            a.opensOn !== "2026-11-02" ||
            !/\bquiz\s*#?\s*1\b/i.test(a.title) ||
            ["completed", "submitted", "cancelled"].includes(a.status)
          )
            return false;
          const readiness = assessmentReadiness(d, a);
          return !readiness.calculable || readiness.studied < readiness.total;
        })
      : undefined;
  const ordered =
    fixed && weekday >= 5
      ? [...rankings].sort((a, b) => {
          const need = (course: Course) =>
            d.lectures.filter(
              (l) =>
                l.courseId === course.id &&
                !l.excluded &&
                (l.needsRevision ||
                  (l.nextRevision && l.nextRevision <= targetDay) ||
                  (l.number >= 3 &&
                    l.number <= weeklyUnitNumber(targetDay) &&
                    l.status !== "completed")),
            ).length;
          // Add a bounded recovery/weak-area boost within the existing time budget.
          return (
            (b.course.id === quizPriority?.courseId ? 100 : 0) -
              (a.course.id === quizPriority?.courseId ? 100 : 0) ||
            b.score +
              Math.min(30, need(b.course) * 5) -
              (a.score + Math.min(30, need(a.course) * 5))
          );
        })
      : rankings;
  const chosen =
    fixed && weekday < 5
      ? rankings
          .filter(
            (r) =>
              r.course.code.trim().toUpperCase() === weeklySubjects[weekday],
          )
          .slice(0, 1)
      : ordered.slice(0, budget >= 30 ? 2 : 1);
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
          const urgentDay =
            urgent && assessmentPlanningDay(d, urgent, targetDay);
          const c =
            urgent &&
            (!fixed ||
              (urgentDay && daysBetween(targetDay, urgentDay) <= 14)) &&
            assessmentReadiness(d, urgent).calculable
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
          const weekendUnit =
            fixed && weekday >= 5
              ? d.lectures
                  .filter(
                    (l) =>
                      l.courseId === r.course.id &&
                      !l.excluded &&
                      (l.needsRevision ||
                        (l.nextRevision && l.nextRevision <= targetDay)),
                  )
                  .sort((a, b) => a.number - b.number)[0] ||
                (weekday === 6
                  ? d.lectures
                      .filter(
                        (l) =>
                          l.courseId === r.course.id &&
                          !l.excluded &&
                          l.status !== "completed" &&
                          l.number <= weeklyUnitNumber(targetDay),
                      )
                      .sort((a, b) => a.number - b.number)[0]
                  : undefined) ||
                weeklyUnit(d, r.course.id, targetDay)
              : undefined;
          const quizPrep = r.course.id === quizPriority?.courseId;
          const unit = quizPrep
            ? undefined
            : fixed && weekday < 5
              ? covered || weeklyUnit(d, r.course.id, targetDay)
              : covered ||
                weekendUnit ||
                (fixed ? undefined : nextStudyUnit(d, r.course.id, targetDay));
          const mode = fixed
            ? weekday === 5
              ? "Practice: MCQs, mastery tests and revision"
              : weekday === 6
                ? "Catch-up: unfinished work and weak areas"
                : `Complete one official unit (weekly target ${weeklyUnitNumber(targetDay)})`
            : "";
          return {
            role: i === 0 ? "Main" : "Secondary",
            courseId: r.course.id,
            lectureId: unit?.id,
            focus: quizPrep
              ? `${weekday === 5 ? "Practice" : "Catch-up"}: CS101 Quiz 1 · Topics 1–38`
              : fixed && weekday >= 5
                ? `${weekday === 5 ? "Practice" : "Catch-up"}: ${unit?.title || "current material"}`.slice(
                    0,
                    300,
                  )
                : unit?.title ||
                  (fixed
                    ? `Unit ${weeklyUnitNumber(targetDay)} — add or confirm syllabus details`
                    : "Review current material"),
            minutes: i === 0 ? main : total - main,
            reason: [
              quizPrep
                ? "Quiz 1 opens 2 November; Topics 1–38 coverage is not yet secure"
                : mode,
              ...r.reasons,
            ]
              .filter(Boolean)
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
    explanation: fixed
      ? `Monday–Friday: one subject and one unit. Saturday: practice. Sunday: catch-up. Deadlines guide preparation within these slots; saved Today stays fixed.${booked ? ` ${Math.round(booked)} min already scheduled.` : ""}`
      : booked
        ? `${Math.round(booked)} min already scheduled; recommendations use the remaining daily budget.`
        : "Conservative daily budget; overdue work raises priority, not daily hours.",
  };
}

function assignment(plan: DailyPlan, omitTopics = false) {
  return {
    id: plan.id,
    semesterId: plan.semesterId,
    day: plan.day,
    zone: plan.zone,
    notes: plan.notes,
    maximumMinutes: plan.maximumMinutes,
    createdAt: plan.createdAt,
    previousAssignments: plan.previousAssignments,
    items: plan.items.map(({ status, sessionId, ...item }) => {
      if (!omitTopics) return item;
      const { focus, lectureId, source, reason, ...rest } = item;
      return rest;
    }),
  };
}
export function assertPlanTransitions(
  before: Dataset,
  after: Dataset,
  topicEditPlanId?: string,
  scheduleResetPlanId?: string,
) {
  for (const previous of before.dailyPlans) {
    const next = after.dailyPlans.find((p) => p.id === previous.id);
    if (previous.id === scheduleResetPlanId && next) {
      const expected = structuredClone(before);
      const reset = useScheduledSubject(expected, previous.id, next.updatedAt);
      if (JSON.stringify(reset) !== JSON.stringify(next))
        throw new Error("Use the scheduled-subject action to change this plan");
      continue;
    }
    const topicEdit =
      previous.id === topicEditPlanId && previous.day >= today(previous.zone);
    if (
      fixedDay(before, previous.semesterId, previous.day) &&
      previous.day === today(previous.zone) &&
      (!next ||
        JSON.stringify(assignment(previous, topicEdit)) !==
          JSON.stringify(assignment(next, topicEdit)) ||
        (previous.locked && !next.locked))
    )
      throw new Error(
        "Today's plan stays fixed. Schedule changes for tomorrow or later.",
      );
    if (
      previous.day < today(previous.zone) &&
      JSON.stringify(previous) !== JSON.stringify(next)
    )
      throw new Error("Historical daily plans cannot be rewritten or moved");
    if (previous.locked) {
      if (
        !next ||
        JSON.stringify(assignment(previous, topicEdit)) !==
          JSON.stringify(assignment(next, topicEdit))
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
export function useScheduledSubject(
  d: Dataset,
  planId: string,
  now = new Date().toISOString(),
) {
  const plan = d.dailyPlans.find((p) => p.id === planId);
  if (
    !plan ||
    plan.day < dayOf(now, plan.zone) ||
    !fixedDay(d, plan.semesterId, plan.day) ||
    weekdayIndex(plan.day) >= 5
  )
    throw new Error("Choose today or a future weekday in the weekly plan");
  if (d.semesters.find((s) => s.id === plan.semesterId)?.archived)
    throw new Error("Archived semesters cannot be edited");
  const code = weeklySubjects[weekdayIndex(plan.day)];
  if (
    plan.items.length === 1 &&
    d.courses
      .find((c) => c.id === plan.items[0].courseId)
      ?.code.trim()
      .toUpperCase() === code
  )
    return plan;
  if (
    plan.items.some(
      (item) => item.sessionId && item.sessionId === d.timer?.sessionId,
    )
  )
    throw new Error(
      "Finish the current timer before changing the assigned subject",
    );
  const items = recommendDay(d, plan.semesterId, plan.day).items;
  if (
    items.length !== 1 ||
    d.courses
      .find((c) => c.id === items[0].courseId)
      ?.code.trim()
      .toUpperCase() !== code
  )
    throw new Error(
      `Add an active ${code} course and available study time first`,
    );
  plan.previousAssignments = [
    ...(plan.previousAssignments || []),
    { at: now, items: structuredClone(plan.items) },
  ];
  plan.items = items.map((item) => ({
    ...item,
    minutes: Math.min(item.minutes, plan.maximumMinutes),
  }));
  plan.updatedAt = now;
  return plan;
}
export function editDayTopics(
  d: Dataset,
  planId: string,
  topics: { role: "Main" | "Secondary"; focus: string; lectureId?: string }[],
  now = new Date().toISOString(),
) {
  const plan = d.dailyPlans.find((p) => p.id === planId);
  if (!plan || plan.day < dayOf(now, plan.zone))
    throw new Error("Past plans cannot be edited");
  if (d.semesters.find((s) => s.id === plan.semesterId)?.archived)
    throw new Error("Archived semesters cannot be edited");
  if (
    topics.length !== plan.items.length ||
    new Set(topics.map((t) => t.role)).size !== topics.length
  )
    throw new Error("Keep the existing plan items when editing topics");
  for (const item of plan.items) {
    const topic = topics.find((t) => t.role === item.role);
    if (!topic || !topic.focus.trim() || topic.focus.trim().length > 300)
      throw new Error("Enter a topic of 1–300 characters for each item");
    if (
      topic.lectureId &&
      !d.lectures.some(
        (l) =>
          l.id === topic.lectureId &&
          l.courseId === item.courseId &&
          (!l.excluded || l.id === item.lectureId),
      )
    )
      throw new Error("Choose a study unit from the assigned course");
    if (topic.lectureId !== item.lectureId) {
      if (item.sessionId && d.timer?.sessionId === item.sessionId)
        throw new Error(
          "Finish the running timer before changing its study unit",
        );
      // Keep the recorded session on its original unit. New study gets a new session.
      delete item.sessionId;
      item.status = "pending";
    }
    item.focus = topic.focus.trim();
    item.lectureId = topic.lectureId;
    item.source = "Personal Plan";
    item.reason = "Topic chosen in the weekly plan";
  }
  plan.updatedAt = now;
  return plan;
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
  if (old && fixedDay(d, semesterId, day) && day === currentDay)
    throw new Error(
      "Today's plan stays fixed. Schedule changes for tomorrow or later.",
    );
  if (
    fixedDay(d, semesterId, day) &&
    weekdayIndex(day) < 5 &&
    (items.length !== 1 ||
      d.courses
        .find((c) => c.id === items[0]?.courseId)
        ?.code.trim()
        .toUpperCase() !== weeklySubjects[weekdayIndex(day)])
  )
    throw new Error(
      "Weekdays follow the fixed subject schedule with one unit per day.",
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
    locked: lock || (fixedDay(d, semesterId, day) && day === currentDay),
    notes,
    maximumMinutes: cap,
    lockHistory: [
      ...(old?.lockHistory || []),
      ...(lock || (fixedDay(d, semesterId, day) && day === currentDay)
        ? [{ at: now, action: "locked" as const }]
        : []),
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
  if (fixedDay(d, plan.semesterId, plan.day))
    throw new Error(
      "Today's plan stays fixed. Schedule changes for tomorrow or later.",
    );
  plan.locked = false;
  plan.updatedAt = now;
  plan.lockHistory.push({ at: now, action: "unlocked" });
}

export function freezeToday(
  d: Dataset,
  semesterId: string,
  now = new Date().toISOString(),
) {
  const day = dayOf(now, d.settings.timezone);
  if (
    !fixedDay(d, semesterId, day) ||
    d.semesters.find((s) => s.id === semesterId)?.archived
  )
    return;
  const old = d.dailyPlans.find(
    (p) => p.semesterId === semesterId && p.day === day,
  );
  if (old) {
    if (!old.locked) {
      old.locked = true;
      old.updatedAt = now;
      old.lockHistory.push({ at: now, action: "locked" });
    }
    return;
  }
  const recommendation = recommendDay(d, semesterId, day);
  if (recommendation.items.length)
    saveDayPlan(d, semesterId, day, recommendation.items, "", true, now);
}
