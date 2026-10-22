import { useState } from "react";
import { Plus, FileText, Pencil, Trash2, Search } from "lucide-react";
import { useStudy } from "../../app/context";
import { Empty, PageHeading, ExternalLink, Pill } from "../../shared/ui";
export function ResourceList({
  courseId,
  lectureId,
  query = "",
}: {
  courseId?: string;
  lectureId?: string;
  query?: string;
}) {
  const { data: d, semesterId, edit, run } = useStudy();
  const courseIds = new Set(
    d.courses.filter((c) => c.semesterId === semesterId).map((c) => c.id),
  );
  const resources = d.resources.filter(
    (r) =>
      courseIds.has(r.courseId) &&
      (!courseId || r.courseId === courseId) &&
      (!lectureId || r.lectureId === lectureId) &&
      `${r.title} ${r.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return !resources.length ? (
    <Empty
      title="No saved resources"
      action={() => edit({ kind: "resource", courseId, lectureId })}
      label="Add resource"
    >
      Save a title and an original Drive link. Your documents stay in Google
      Drive.
    </Empty>
  ) : (
    <div className="resource-grid">
      {resources.map((r) => (
        <article className="resource-card" key={r.id}>
          <div className="resource-icon">
            <FileText size={23} />
          </div>
          <div className="resource-body">
            <h3>{r.title}</h3>
            <p className="meta">
              {d.courses.find((c) => c.id === r.courseId)?.code}
              {r.lectureId &&
                ` · Lecture ${d.lectures.find((l) => l.id === r.lectureId)?.number}`}
            </p>
            <div className="tags">
              {r.tags.map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </div>
            <ExternalLink url={r.url}>Open in Google Drive</ExternalLink>
          </div>
          <div className="resource-actions">
            <button
              className="icon-button"
              aria-label={`Edit ${r.title}`}
              onClick={() => edit({ kind: "resource", id: r.id })}
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Remove ${r.title}`}
              onClick={() => {
                if (
                  confirm(
                    "Remove this tracker link? The Drive file will not be changed.",
                  )
                )
                  void run((d) => {
                    d.resources = d.resources.filter((x) => x.id !== r.id);
                  }, "Resource link removed");
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
export function Resources() {
  const { data: d, semesterId, edit } = useStudy();
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("");
  const [lecture, setLecture] = useState("");
  const courses = d.courses.filter((c) => c.semesterId === semesterId);
  const safeCourse = courses.some((c) => c.id === course) ? course : "";
  return (
    <>
      <PageHeading
        eyebrow="YOUR REFERENCE SHELF"
        title="Notes & Resources"
        action={
          <button
            className="primary"
            disabled={!courses.length}
            onClick={() => edit({ kind: "resource", courseId: safeCourse })}
          >
            <Plus size={17} />
            Add resource
          </button>
        }
      >
        Your notes, one click away. Keep the originals in Google Drive.
      </PageHeading>
      <div className="notice">
        <FileText size={20} />
        <p>
          Access and editing follow each file’s existing Google permissions and
          your Google account. Public sharing is not required. Backups save
          links and metadata, not the Drive files.
        </p>
      </div>
      <div className="filters">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search saved resource titles and tags"
            placeholder="Search saved titles and tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sr-only" htmlFor="resource-course">
          Course filter
        </label>
        <select
          id="resource-course"
          value={safeCourse}
          onChange={(e) => {
            setCourse(e.target.value);
            setLecture("");
          }}
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option value={c.id} key={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="resource-lecture">
          Lecture filter
        </label>
        <select
          id="resource-lecture"
          value={lecture}
          onChange={(e) => setLecture(e.target.value)}
        >
          <option value="">All lectures</option>
          {d.lectures
            .filter((l) => safeCourse && l.courseId === safeCourse)
            .map((l) => (
              <option key={l.id} value={l.id}>
                Lecture {l.number}
              </option>
            ))}
        </select>
      </div>
      {!courses.length ? (
        <section className="panel">
          <Empty
            title="Add a course to start your shelf"
            action={() => edit({ kind: "course" })}
            label="Add course"
          >
            Resources belong to a course offering, so your semesters stay
            organized.
          </Empty>
        </section>
      ) : (
        <>
          <div className="folder-links">
            {courses
              .filter(
                (c) => c.folderUrl && (!safeCourse || safeCourse === c.id),
              )
              .map((c) => (
                <ExternalLink key={c.id} url={c.folderUrl}>
                  {c.code} folder
                </ExternalLink>
              ))}
          </div>
          <ResourceList
            courseId={safeCourse || undefined}
            lectureId={lecture || undefined}
            query={query}
          />
        </>
      )}
    </>
  );
}
