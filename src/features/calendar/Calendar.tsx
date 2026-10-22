import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStudy } from "../../app/context";
import {
  addDays,
  dayOf,
  deadlineDay,
  deadlineLabel,
  today,
  weekStart,
  formatInstant,
} from "../../domain/dates";
import { Empty, PageHeading } from "../../shared/ui";
import { SessionRow } from "../sessions/Sessions";
import { planOutcome } from "../../domain/planner";
export function Calendar() {
  const { data: d, semesterId, edit, run } = useStudy();
  const [anchor, setAnchor] = useState(today(d.settings.timezone));
  const [view, setView] = useState("week");
  const [period, setPeriod] = useState("week");
  const zone = d.settings.timezone;
  const date = Temporal.PlainDate.from(anchor);
  const start =
    period === "month"
      ? weekStart(date.with({ day: 1 }).toString(), d.settings.weekStart)
      : weekStart(anchor, d.settings.weekStart);
  const days = Array.from({ length: period === "month" ? 42 : 7 }, (_, i) =>
    addDays(start, i),
  );
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  const assessments = d.assessments.filter(
    (a) => courses.some((c) => c.id === a.courseId) && a.status !== "cancelled",
  );
  const sessions = d.sessions.filter(
    (s) => s.semesterId === semesterId && s.status !== "cancelled",
  );
  const dailyPlans = d.dailyPlans.filter((p) => p.semesterId === semesterId);
  const hasItems = days.some(
    (day) =>
      dailyPlans.some((p) => p.day === day) ||
      assessments.some((a) => deadlineDay(a.deadline, zone) === day) ||
      sessions.some(
        (s) => s.plannedStart && dayOf(s.plannedStart, zone) === day,
      ),
  );
  function move(n: number) {
    setAnchor(
      period === "month"
        ? date.add({ months: n }).toString()
        : addDays(anchor, n * 7),
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="A RHYTHM THAT WORKS FOR YOU"
        title="Study calendar"
        action={
          <button className="primary" onClick={() => edit({ kind: "session" })}>
            <Plus size={17} />
            Plan a session
          </button>
        }
      >
        Planned sessions and assessment dates · {zone}
      </PageHeading>
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Previous period"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={19} />
            </button>
            <h2>
              {date.toLocaleString("en", { month: "long", year: "numeric" })}
            </h2>
            <button
              className="icon-button"
              aria-label="Next period"
              onClick={() => move(1)}
            >
              <ChevronRight size={19} />
            </button>
            <button className="small" onClick={() => setAnchor(today(zone))}>
              Today
            </button>
          </div>
          <div className="segmented" aria-label="Calendar view">
            {["week", "month", "list"].map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  if (v !== "list") setPeriod(v);
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {view !== "list" ? (
          <>
            <div
              className={`calendar-grid ${view}`}
              role="list"
              aria-label={`${view} calendar`}
            >
              {days.map((day) => {
                const p = Temporal.PlainDate.from(day);
                return (
                  <section
                    className={`calendar-day ${day === today(zone) ? "is-today" : ""} ${p.month !== date.month ? "other-month" : ""}`}
                    key={day}
                    role="listitem"
                  >
                    <div className="day-heading">
                      <span>
                        {p.toLocaleString("en", { weekday: "short" })}
                      </span>
                      <strong>{p.day}</strong>
                    </div>
                    {dailyPlans
                      .filter((p) => p.day === day)
                      .map((p) => (
                        <details key={p.id} className="calendar-event">
                          <summary>
                            Daily plan · {p.locked ? "Locked" : "Draft"} ·{" "}
                            {planOutcome(d, p)}
                          </summary>
                          {p.items.map((i) => (
                            <p key={i.role}>
                              {i.role} ·{" "}
                              {courses.find((c) => c.id === i.courseId)?.code} ·{" "}
                              {i.minutes} min · {i.focus}
                            </p>
                          ))}
                        </details>
                      ))}
                    {assessments
                      .filter((a) => deadlineDay(a.deadline, zone) === day)
                      .map((a) => (
                        <button
                          key={a.id}
                          className="calendar-event assessment-event"
                          onClick={() => edit({ kind: "assessment", id: a.id })}
                        >
                          <span>
                            Assessment ·{" "}
                            {courses.find((c) => c.id === a.courseId)?.code}
                          </span>
                          <strong>{a.title}</strong>
                          <span>
                            {a.deadline.kind === "timed"
                              ? formatInstant(a.deadline.at, zone)
                              : "Date only"}
                          </span>
                          {a.endsAt && (
                            <span>Ends {formatInstant(a.endsAt, zone)}</span>
                          )}
                        </button>
                      ))}
                    {sessions
                      .filter(
                        (s) =>
                          s.plannedStart && dayOf(s.plannedStart, zone) === day,
                      )
                      .map((s) => (
                        <button
                          key={s.id}
                          className="calendar-event"
                          onClick={() => edit({ kind: "session", id: s.id })}
                        >
                          <span>Study · {s.status}</span>
                          <strong>{s.title}</strong>
                          <span>
                            {formatInstant(s.plannedStart!, zone)} –{" "}
                            {formatInstant(s.plannedEnd!, zone)}
                          </span>
                        </button>
                      ))}
                  </section>
                );
              })}
            </div>
            {!hasItems && (
              <p className="calendar-empty">
                Nothing scheduled in this period. Use Plan a session to make a
                start.
              </p>
            )}
          </>
        ) : (
          <div>
            {!hasItems && (
              <Empty title="An open week">
                No scheduled sessions or assessments in this week.
              </Empty>
            )}
            {days.map((day) => {
              const aa = assessments.filter(
                (a) => deadlineDay(a.deadline, zone) === day,
              );
              const ss = sessions.filter(
                (s) => s.plannedStart && dayOf(s.plannedStart, zone) === day,
              );
              const pp = dailyPlans.filter((p) => p.day === day);
              return aa.length || ss.length || pp.length ? (
                <section key={day} className="agenda-day">
                  <h3>{day}</h3>
                  {pp.map((p) => (
                    <div className="agenda-assessment" key={p.id}>
                      Daily plan · {p.locked ? "Locked" : "Draft"} ·{" "}
                      {planOutcome(d, p)}
                      <span>
                        {p.items
                          .map(
                            (i) =>
                              `${i.role}: ${courses.find((c) => c.id === i.courseId)?.code} ${i.minutes} min`,
                          )
                          .join(" · ")}
                      </span>
                    </div>
                  ))}
                  {aa.map((a) => (
                    <button
                      className="agenda-assessment"
                      key={a.id}
                      onClick={() => edit({ kind: "assessment", id: a.id })}
                    >
                      {a.title}
                      <span>{deadlineLabel(a.deadline, zone)}</span>
                    </button>
                  ))}
                  {ss.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </section>
              ) : null;
            })}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Session register</h2>
          <button onClick={() => edit({ kind: "manual" })}>
            Log study time
          </button>
        </div>
        <p className="muted">
          All sessions in this semester, including unscheduled and cancelled
          sessions.
        </p>
        {sessions.length ||
        d.sessions.some((s) => s.semesterId === semesterId) ? (
          d.sessions
            .filter((s) => s.semesterId === semesterId)
            .sort((a, b) =>
              (b.plannedStart || b.createdAt).localeCompare(
                a.plannedStart || a.createdAt,
              ),
            )
            .map((s) => (
              <div key={s.id}>
                <SessionRow session={s} />
                {!!s.intervals.length && (
                  <details className="time-details">
                    <summary>Recorded intervals · correct time entries</summary>
                    {s.intervals.map((i, idx) => (
                      <div className="interval-row" key={`${i.start}-${idx}`}>
                        <span>
                          {formatInstant(i.start, zone)} →{" "}
                          {formatInstant(i.end, zone)}
                        </span>
                        <button
                          className="small danger-button"
                          onClick={() => {
                            if (
                              confirm(
                                "Remove this actual study interval? You can then enter corrected time.",
                              )
                            )
                              void runRemove(s.id, idx);
                          }}
                        >
                          Remove interval
                        </button>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))
        ) : (
          <Empty title="No study sessions yet">
            Plan a session, or log time you have already studied.
          </Empty>
        )}
      </section>
    </>
  );
  async function runRemove(id: string, index: number) {
    await run((d) => {
      const s = d.sessions.find((s) => s.id === id)!;
      s.intervals.splice(index, 1);
      s.updatedAt = new Date().toISOString();
    }, "Time interval removed");
  }
}
