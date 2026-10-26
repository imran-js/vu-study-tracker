import { useEffect, useState } from "react";
import {
  Plus,
  ArrowLeft,
  BookOpen,
  RotateCcw,
  Pencil,
  Check,
  Link2,
} from "lucide-react";
import { useStudy } from "../../app/context";
import { Empty, PageHeading, Pill, Meter, ExternalLink } from "../../shared/ui";
import { progress } from "../../domain/progress";
import { generateLectures, setLectureStatus } from "../../app/actions";
import { ResourceList } from "../resources/Resources";
import { AssessmentList } from "../assessments/Assessments";
import { Cs101Grading } from "../assessments/Cs101Grading";

export function Courses() {
  const { data: d, semesterId, edit, run } = useStudy();
  const [selected, setSelected] = useState<string>();
  useEffect(() => setSelected(undefined), [semesterId]);
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  const c = courses.find((c) => c.id === selected);
  if (c) {
    const lectures = d.lectures
      .filter((l) => l.courseId === c.id)
      .sort((a, b) => a.number - b.number);
    const p = progress(d, semesterId, c.id);
    return (
      <>
        <button
          className="text-button back"
          onClick={() => setSelected(undefined)}
        >
          <ArrowLeft size={16} />
          All courses
        </button>
        <PageHeading
          eyebrow={c.code}
          title={c.title}
          action={
            <button onClick={() => edit({ kind: "course", id: c.id })}>
              <Pencil size={16} />
              Edit course
            </button>
          }
        >
          {c.credits !== undefined ? `${c.credits} credit hours · ` : ""}
          {c.priority} priority
        </PageHeading>
        <Cs101Grading courseId={c.id} />
        <div className="course-overview">
          <section className="panel">
            <div className="section-heading">
              <h2>Lecture progress</h2>
              <span>
                {p.completed} / {p.total ?? "?"} completed
              </span>
            </div>
            <Meter
              value={p.completed}
              total={p.total}
              label="Lecture completion"
            />
            <p className="muted">
              {p.total === undefined
                ? "Total unknown"
                : "Confirmed lecture total"}{" "}
              · {p.revised} revised · {p.revisionDue} due for revision
            </p>
          </section>
          <section className="panel">
            <h2>Course notebook</h2>
            <p className="prewrap">
              {c.notes || "Keep a short note here using Edit course."}
            </p>
            {c.folderUrl && (
              <ExternalLink url={c.folderUrl}>Open Drive folder</ExternalLink>
            )}
          </section>
        </div>
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ONE STEP AT A TIME</p>
              <h2>Lectures</h2>
            </div>
            <div className="button-row">
              <button
                disabled={c.lectureTotal === undefined}
                onClick={() => {
                  if (
                    confirm(
                      "Add missing numbered lectures from your confirmed total? Existing lectures are preserved.",
                    )
                  )
                    void run(
                      (d) => generateLectures(d, c.id),
                      "Numbered lectures added",
                    );
                }}
              >
                Generate from total
              </button>
              <button onClick={() => edit({ kind: "lecture", courseId: c.id })}>
                <Plus size={16} />
                Add lecture
              </button>
            </div>
          </div>
          {!lectures.length ? (
            <Empty
              title="Your lecture list starts here"
              action={() => edit({ kind: "lecture", courseId: c.id })}
              label="Add lecture"
            >
              Enter lectures individually, or generate them after confirming the
              total.
            </Empty>
          ) : (
            <div className="lecture-list">
              {lectures.map((l) => (
                <article className="lecture" key={l.id}>
                  <button
                    className={`completion-button ${l.status === "completed" ? "checked" : ""}`}
                    aria-label={`${l.status === "completed" ? "Reopen" : "Complete"} ${l.title}`}
                    onClick={() =>
                      void run(
                        (d) =>
                          setLectureStatus(
                            d,
                            l.id,
                            l.status === "completed"
                              ? "not started"
                              : "completed",
                          ),
                        "Lecture updated",
                      )
                    }
                  >
                    <Check size={16} />
                  </button>
                  <div className="lecture-main">
                    <strong>
                      <span className="lecture-number">
                        {String(l.number).padStart(2, "0")}
                      </span>
                      {l.title}
                    </strong>
                    <div className="meta">
                      <Pill>{l.status}</Pill>
                      {l.excluded && <Pill>excluded</Pill>}
                      {l.needsRevision && <Pill>Needs Revision</Pill>}
                      <span>
                        {d.revisions.filter((r) => r.lectureId === l.id).length}{" "}
                        revisions
                        {l.nextRevision ? ` · next ${l.nextRevision}` : ""}
                      </span>
                    </div>
                    <div className="lecture-resources">
                      {d.resources
                        .filter((r) => r.lectureId === l.id)
                        .map((r) => (
                          <ExternalLink key={r.id} url={r.url}>
                            {r.title}
                          </ExternalLink>
                        ))}
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      className="small"
                      aria-pressed={!!l.needsRevision}
                      onClick={() =>
                        void run((d) => {
                          d.lectures.find(
                            (unit) => unit.id === l.id,
                          )!.needsRevision = !l.needsRevision;
                        }, "Revision flag updated; completion preserved")
                      }
                    >
                      {l.needsRevision
                        ? "Clear revision flag"
                        : "Needs Revision"}
                    </button>
                    <button
                      className="small"
                      disabled={l.status !== "completed"}
                      onClick={() => edit({ kind: "revision", id: l.id })}
                    >
                      <RotateCcw size={14} />
                      Revise
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Add resource to ${l.title}`}
                      onClick={() =>
                        edit({
                          kind: "resource",
                          courseId: c.id,
                          lectureId: l.id,
                        })
                      }
                    >
                      <Link2 size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${l.title}`}
                      onClick={() => edit({ kind: "lecture", id: l.id })}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Assessments</h2>
            <button
              onClick={() => edit({ kind: "assessment", courseId: c.id })}
            >
              <Plus size={16} />
              Add assessment
            </button>
          </div>
          <AssessmentList courseId={c.id} />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Notes & resources</h2>
            <button onClick={() => edit({ kind: "resource", courseId: c.id })}>
              <Plus size={16} />
              Add resource
            </button>
          </div>
          <ResourceList courseId={c.id} />
        </section>
      </>
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR LEARNING SPACE"
        title="Courses"
        action={
          <button className="primary" onClick={() => edit({ kind: "course" })}>
            <Plus size={17} />
            Add course
          </button>
        }
      >
        A place for every course, lecture, and small step forward.
      </PageHeading>
      {!courses.length ? (
        <section className="panel">
          <Empty
            title="Make room for your first course"
            action={() => edit({ kind: "course" })}
            label="Add your first course"
          >
            Add the courses you’re enrolled in. Lecture counts and dates stay
            unknown until you enter them.
          </Empty>
        </section>
      ) : (
        <div className="course-grid">
          {courses.map((c) => {
            const p = progress(d, semesterId, c.id);
            return (
              <button
                className="course-card"
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <div className="section-heading">
                  <span className="course-icon">
                    <BookOpen size={22} />
                  </span>
                  <Pill>{c.priority} priority</Pill>
                </div>
                <p className="eyebrow">{c.code}</p>
                <h2>{c.title}</h2>
                <Meter
                  value={p.completed}
                  total={p.total}
                  label={`${c.title} completion`}
                />
                <div className="meta">
                  <span>
                    {p.completed} completed ·{" "}
                    {p.total === undefined
                      ? "total unknown"
                      : `${p.total} total`}
                  </span>
                  <span>View course →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
