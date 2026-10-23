import { Plus, Clock3, BookOpen, CalendarDays, RotateCcw } from "lucide-react";
import { DailyPlanner, CourseStatus, PlanHistory } from "../planner/Planner";
import { assessmentPlanningDay } from "../../domain/planner";
import { useStudy } from "../../app/context";
import { Empty, PageHeading, Pill } from "../../shared/ui";
import {
  deadlineLabel,
  duration,
  isOverdue,
  today,
  dayOf,
  addDays,
} from "../../domain/dates";
import { progress } from "../../domain/progress";
import { SessionRow } from "../sessions/Sessions";
export function Today() {
  const { data: d, semesterId, edit, cloud } = useStudy();
  const zone = d.settings.timezone;
  const day = today(zone);
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  const ids = new Set(courses.map((c) => c.id));
  const p = progress(d, semesterId);
  const open = d.assessments.filter(
    (a) =>
      ids.has(a.courseId) &&
      !["completed", "submitted", "cancelled"].includes(a.status),
  );
  const overdue = open.filter((a) => isOverdue(a.deadline, zone));
  const dueToday = open.filter(
    (a) =>
      !isOverdue(a.deadline, zone) && assessmentPlanningDay(d, a, day) === day,
  );
  const upcoming = open.filter((a) => {
    const date = assessmentPlanningDay(d, a, day);
    return (
      !isOverdue(a.deadline, zone) &&
      date &&
      date > day &&
      date <= addDays(day, 7)
    );
  });
  const sortDue = (a: (typeof open)[number], b: (typeof open)[number]) => {
    const key = (x: typeof a) =>
      x.deadline.kind === "timed"
        ? x.deadline.at
        : x.deadline.kind === "date"
          ? `${x.deadline.date}T23:59`
          : "9999";
    return key(a).localeCompare(key(b));
  };
  const sessions = d.sessions
    .filter(
      (s) =>
        s.semesterId === semesterId &&
        s.status !== "cancelled" &&
        s.plannedStart &&
        dayOf(s.plannedStart, zone) === day,
    )
    .sort((a, b) => a.plannedStart!.localeCompare(b.plannedStart!));
  const revisions = d.lectures
    .filter(
      (l) =>
        ids.has(l.courseId) &&
        !l.excluded &&
        l.status === "completed" &&
        l.nextRevision &&
        l.nextRevision <= day,
    )
    .sort((a, b) => a.nextRevision!.localeCompare(b.nextRevision!));
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE PROGRESS, EVERY DAY"
        title="Today"
        action={
          <button className="primary" onClick={() => edit({ kind: "session" })}>
            <Plus size={17} />
            Plan a session
          </button>
        }
      >
        Pick your next step. Keep a steady rhythm.
      </PageHeading>
      <DailyPlanner part="today" />
      <div className="today-columns">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR NEXT STEPS</p>
              <h2>On your radar</h2>
            </div>
            <button
              className="text-button"
              disabled={!courses.length}
              onClick={() => edit({ kind: "assessment" })}
            >
              <Plus size={16} />
              Add assessment
            </button>
          </div>
          <p className="section-caption">
            Overdue first, then today’s deadlines, then the next 7 days. Each
            group is ordered by deadline.
          </p>
          {![...overdue, ...dueToday, ...upcoming].length ? (
            <Empty title="A clear view ahead">
              No known deadlines in this window. Add assessments when they’re
              announced.
            </Empty>
          ) : (
            <div className="radar-list">
              {[
                ...overdue.sort(sortDue),
                ...dueToday.sort(sortDue),
                ...upcoming.sort(sortDue),
              ].map((a) => (
                <button
                  className="radar-item"
                  key={a.id}
                  onClick={() => edit({ kind: "assessment", id: a.id })}
                >
                  <span
                    className={`radar-mark ${overdue.includes(a) ? "urgent" : ""}`}
                  />
                  <span className="grow">
                    <strong>{a.title}</strong>
                    <span className="meta">
                      {courses.find((c) => c.id === a.courseId)?.code} ·{" "}
                      {deadlineLabel(a.deadline, zone)}
                      {a.opensOn && ` · Opens ${a.opensOn}`}
                    </span>
                  </span>
                  <Pill tone={overdue.includes(a) ? "danger" : ""}>
                    {overdue.includes(a)
                      ? "Overdue"
                      : dueToday.includes(a)
                        ? "Today"
                        : "Upcoming"}
                  </Pill>
                </button>
              ))}
            </div>
          )}
          {!!revisions.length && (
            <div className="revision-due">
              <h3>Ready for another look</h3>
              {revisions.map((l) => (
                <button
                  className="text-button"
                  key={l.id}
                  onClick={() => edit({ kind: "revision", id: l.id })}
                >
                  <RotateCcw size={15} />
                  {courses.find((c) => c.id === l.courseId)?.code} · {l.title}
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MAKE THE TIME</p>
              <h2>Today’s sessions</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Add study session"
              onClick={() => edit({ kind: "session" })}
            >
              <Plus size={20} />
            </button>
          </div>
          {sessions.length ? (
            sessions.map((s) => <SessionRow key={s.id} session={s} />)
          ) : (
            <Empty
              title="Give your day a little structure"
              action={() => edit({ kind: "session" })}
              label="Plan a session"
            >
              Choose a time and a small, achievable focus.
            </Empty>
          )}
          <div className="panel-foot">
            <button
              className="text-button"
              onClick={() => edit({ kind: "manual" })}
            >
              <Clock3 size={16} />
              Already studied? Log your time
            </button>
          </div>
        </section>
      </div>
      <DailyPlanner part="tomorrow" />
      <div className="stats-grid">
        <Stat
          icon={<Clock3 size={20} />}
          label="STUDIED THIS WEEK"
          value={duration(p.weekMinutes)}
          detail={
            d.settings.weeklyTarget
              ? `of ${duration(d.settings.weeklyTarget)} target`
              : "Actual time, pauses excluded"
          }
        />
        <Stat
          icon={<BookOpen size={20} />}
          label="LECTURES COMPLETED"
          value={String(p.completed)}
          detail={
            p.total === undefined
              ? "Semester total unknown"
              : `of ${p.total} confirmed lectures`
          }
        />
        <Stat
          icon={<CalendarDays size={20} />}
          label="DUE TODAY"
          value={String(dueToday.length)}
          detail={`${overdue.length} overdue assessments`}
        />
        <Stat
          icon={<RotateCcw size={20} />}
          label="REVISION DUE"
          value={String(revisions.length)}
          detail="Your scheduled revision dates"
        />
      </div>
      <CourseStatus />
      <PlanHistory />
      <p className="page-footnote">
        {cloud
          ? "Your records are saved to your private cloud account."
          : "Your records stay in this browser."}{" "}
        Export a backup regularly in Settings & Data.
      </p>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
