import { useState } from "react";
import { useStudy } from "../../app/context";
import { PageHeading, Meter } from "../../shared/ui";
import { progress } from "../../domain/progress";
import { addDays, duration, today, weekStart } from "../../domain/dates";
export function Progress() {
  const { data: d, semesterId } = useStudy();
  const [courseId, setCourseId] = useState("");
  const [reportDay, setReportDay] = useState(today(d.settings.timezone));
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  const safeCourse = courses.some((c) => c.id === courseId)
    ? courseId
    : undefined;
  const p = progress(d, semesterId, safeCourse, reportDay);
  const start = weekStart(reportDay, d.settings.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const max = Math.max(60, ...days.map((day) => p.days[day] || 0));
  return (
    <>
      <PageHeading eyebrow="SMALL STEPS ADD UP" title="Your progress">
        A clear picture of your work, without a single catch-all score.
      </PageHeading>
      <div className="filters">
        <label>
          Course
          <select
            value={safeCourse || ""}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Whole semester</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Week containing
          <input
            type="date"
            value={reportDay}
            onInput={(e) => {
              if (e.currentTarget.value) setReportDay(e.currentTarget.value);
            }}
            onChange={(e) => {
              if (e.target.value) setReportDay(e.target.value);
            }}
          />
        </label>
        <button onClick={() => setReportDay(today(d.settings.timezone))}>
          This week
        </button>
      </div>
      <div className="progress-grid">
        <Metric
          title="Lecture completion"
          value={p.completed}
          total={p.total}
          help={
            p.total === undefined
              ? `${p.completed} completed · total unknown (${p.entered} included lectures entered).`
              : "Completed included lectures ÷ confirmed included total."
          }
        />
        <Metric
          title="Revision coverage"
          value={p.revised}
          total={p.completed}
          help={`Completed lectures revised at least once ÷ completed lectures. ${p.revisionDue} due for revision.`}
        />
        <Metric
          title="Assessment completion"
          value={p.assessmentDone}
          total={p.assessmentTotal}
          help="Submitted or completed ÷ non-cancelled assessments. Submission does not imply a passing grade."
        />
        <Metric
          title="Scheduled sessions · selected week"
          value={p.scheduledDone}
          total={p.scheduledTotal}
          help="Completed ÷ non-cancelled sessions scheduled in the selected week, including future sessions."
        />
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACTUAL STUDY TIME</p>
            <h2>
              {duration(p.weekMinutes)} · week of {start}
            </h2>
          </div>
          <strong>{duration(p.totalMinutes)} this semester</strong>
        </div>
        <div
          className="week-bars"
          role="img"
          aria-label={days
            .map((day) => `${day}: ${duration(p.days[day] || 0)}`)
            .join("; ")}
        >
          {days.map((day) => (
            <div className="bar-column" key={day}>
              <span>{duration(p.days[day] || 0)}</span>
              <div className="bar-track">
                <div
                  style={{ height: `${((p.days[day] || 0) / max) * 100}%` }}
                />
              </div>
              <strong>
                {new Date(`${day}T12:00:00Z`).toLocaleDateString("en", {
                  weekday: "short",
                  timeZone: "UTC",
                })}
              </strong>
              <small>{day.slice(5)}</small>
            </div>
          ))}
        </div>
        <p className="muted">
          {d.settings.weeklyTarget
            ? `Weekly target: ${duration(d.settings.weeklyTarget)} · ${Math.round((p.weekMinutes / d.settings.weeklyTarget) * 100)}% attained.`
            : "Set an optional weekly time target in Settings & Data."}{" "}
          Pauses are excluded; intervals crossing midnight are split using{" "}
          {d.settings.timezone}.
        </p>
      </section>
      <section className="panel">
        <h2>Time by course · this semester</h2>
        <div className="course-times">
          {courses.map((c) => (
            <div key={c.id}>
              <span>
                {c.code} · {c.title}
              </span>
              <strong>
                {duration(progress(d, semesterId, c.id).totalMinutes)}
              </strong>
            </div>
          ))}
          {!courses.length && (
            <p className="muted">Add a course to see its study time here.</p>
          )}
          <div>
            <span>General study (no course)</span>
            <strong>
              {duration(
                d.sessions
                  .filter((s) => s.semesterId === semesterId && !s.courseId)
                  .flatMap((s) => s.intervals)
                  .reduce(
                    (sum, i) =>
                      sum + (Date.parse(i.end) - Date.parse(i.start)) / 60000,
                    0,
                  ),
              )}
            </strong>
          </div>
        </div>
      </section>
    </>
  );
}
function Metric({
  title,
  value,
  total,
  help,
}: {
  title: string;
  value: number;
  total?: number;
  help: string;
}) {
  return (
    <section className="panel metric">
      <h2>{title}</h2>
      <div className="metric-value">
        {total
          ? `${Math.round((value / total) * 100)}%`
          : total === undefined
            ? value
            : "—"}
        <span>{total !== undefined ? `${value} / ${total}` : "completed"}</span>
      </div>
      <Meter value={value} total={total} label={title} />
      <p>{help}</p>
    </section>
  );
}
