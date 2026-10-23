import { AssessmentCalendar } from "../calendar/GoogleCalendar";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useStudy } from "../../app/context";
import { Empty, PageHeading, Pill, ExternalLink } from "../../shared/ui";
import { deadlineDay, deadlineLabel, isOverdue } from "../../domain/dates";
import { Readiness } from "./Readiness";
export function AssessmentList({
  courseId,
  filter = "all",
}: {
  courseId?: string;
  filter?: string;
}) {
  const { data: d, semesterId, edit } = useStudy();
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  const rows = d.assessments
    .filter(
      (a) =>
        courses.some((c) => c.id === a.courseId) &&
        (!courseId || a.courseId === courseId) &&
        (filter === "all" ||
          (filter === "open"
            ? !["submitted", "completed", "cancelled"].includes(a.status)
            : a.status === filter)),
    )
    .sort((a, b) =>
      (deadlineDay(a.deadline, d.settings.timezone) || "9999").localeCompare(
        deadlineDay(b.deadline, d.settings.timezone) || "9999",
      ),
    );
  return !rows.length ? (
    <Empty title="No assessments here yet">
      Add verified deadlines as they’re announced. Unknown dates stay unknown.
    </Empty>
  ) : (
    <div className="assessment-list">
      {rows.map((a) => {
        const overdue =
          !["submitted", "completed", "cancelled"].includes(a.status) &&
          isOverdue(a.deadline, d.settings.timezone);
        return (
          <article key={a.id} className="assessment">
            <div className="assessment-date">
              <span>{d.types.find((t) => t.id === a.typeId)?.label}</span>
              <strong>{courses.find((c) => c.id === a.courseId)?.code}</strong>
            </div>
            <div className="grow">
              <h3>{a.title}</h3>
              <p className="meta">
                {deadlineLabel(a.deadline, d.settings.timezone)}
                {a.opensOn && ` · Opens ${a.opensOn}`}
                {a.endsAt && " · end time set"}
              </p>

              <Readiness assessment={a} />
              <AssessmentCalendar assessment={a} />
              {(a.notes || a.sourceUrl) && (
                <details>
                  <summary>Notes & source link</summary>
                  {a.notes && <p className="prewrap muted">{a.notes}</p>}
                  {a.sourceUrl && (
                    <ExternalLink url={a.sourceUrl}>Source</ExternalLink>
                  )}
                </details>
              )}
            </div>
            <div className="assessment-status">
              <Pill
                tone={
                  overdue
                    ? "danger"
                    : a.status === "completed" || a.status === "submitted"
                      ? "success"
                      : ""
                }
              >
                {overdue ? "Overdue" : a.status}
              </Pill>
              <button
                className="icon-button"
                aria-label={`Edit ${a.title}`}
                onClick={() => edit({ kind: "assessment", id: a.id })}
              >
                <Pencil size={16} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
export function Assessments() {
  const { data: d, semesterId, edit } = useStudy();
  const [filter, setFilter] = useState("all");
  const [courseId, setCourseId] = useState("");
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  return (
    <>
      <PageHeading
        eyebrow="STAY A STEP AHEAD"
        title="Assessments"
        action={
          <button
            className="primary"
            disabled={!courses.length}
            onClick={() => edit({ kind: "assessment" })}
          >
            <Plus size={17} />
            Add assessment
          </button>
        }
      >
        Deadlines, submissions, and exams in one place.
      </PageHeading>
      <div className="filters">
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["all", "open", "submitted", "completed", "cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Course
          <select
            value={courses.some((c) => c.id === courseId) ? courseId : ""}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option value={c.id} key={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel">
        {courses.length ? (
          <AssessmentList
            courseId={
              courses.some((c) => c.id === courseId) ? courseId : undefined
            }
            filter={filter}
          />
        ) : (
          <Empty
            title="Start with a course"
            action={() => edit({ kind: "course" })}
            label="Add course"
          >
            Then add assignments, quizzes, GDBs, exams, or your own assessment
            types.
          </Empty>
        )}
      </section>
    </>
  );
}
