import { defaultCalendarEligible } from "../domain/calendar-model";
import { useState, type FormEvent, type ReactNode } from "react";
import { useStudy, type EditorRequest } from "./context";
import { Modal } from "../shared/ui";
import { stamp, type Dataset, type Deadline } from "../domain/model";
import { localInput, localToInstant } from "../domain/dates";
import { revise, startTimer } from "./actions";
import { driveFileId } from "../integrations/google-drive";
import { sourceTypes, unknownCoverage } from "../domain/planner-model";

type Values = Record<string, string>;
function original(d: Dataset, r: EditorRequest): Values {
  const zone = d.settings.timezone;
  const defaults: Values = {
    courseId: r.courseId || "",
    lectureId: r.lectureId || "",
    title: "",
    notes: "",
    priority: "normal",
    status: "not started",
    tags: "",
    number: "1",
    excluded: "false",
    deadlineKind: "none",
    zone,
    typeId: d.types[0]?.id || "",
    url: "",
    provider: "google-drive",
    name: "",
    code: "",
  };
  const rows =
    r.kind === "course"
      ? d.courses
      : r.kind === "lecture" || r.kind === "revision"
        ? d.lectures
        : r.kind === "assessment"
          ? d.assessments
          : r.kind === "session" || r.kind === "manual"
            ? d.sessions
            : r.kind === "resource"
              ? d.resources
              : r.kind === "semester"
                ? d.semesters
                : d.types;
  const record = rows.find((x) => x.id === r.id);
  if (record)
    for (const [k, v] of Object.entries(record))
      if (typeof v === "string" || typeof v === "number")
        defaults[k] = String(v);
  if (r.kind === "lecture" && !record)
    defaults.number = String(
      Math.max(
        0,
        ...d.lectures
          .filter((l) => l.courseId === r.courseId)
          .map((l) => l.number),
      ) + 1,
    );
  if (r.kind === "lecture" && record)
    defaults.excluded = String(d.lectures.find((l) => l.id === r.id)!.excluded);
  if (r.kind === "lecture")
    defaults.needsRevision = String(
      d.lectures.find((l) => l.id === r.id)?.needsRevision || false,
    );
  if (r.kind === "course") {
    const p = d.courses.find((c) => c.id === r.id)?.planning;
    defaults.planningActive = String(p?.active ?? true);
    defaults.planningStatus = p?.status || "On track";
    defaults.planningReason = p?.reason || "";
    defaults.catchUpMinutes = String(p?.catchUpMinutes || 0);
  }
  if (r.kind === "assessment") {
    const a = d.assessments.find((a) => a.id === r.id);
    const coverage = a?.coverage || unknownCoverage();
    for (const [key, val] of Object.entries(coverage))
      if (val !== undefined) defaults[`coverage_${key}`] = String(val);
    defaults.practicePercent = a?.practice?.percent.toString() || "";
    defaults.practiceSource = a?.practice?.sourceNote || "";
  }
  if (r.kind === "revision") defaults.nextRevision = "";
  if (r.kind === "resource" && record)
    defaults.tags = d.resources.find((x) => x.id === r.id)!.tags.join(", ");
  if (r.kind === "assessment" && record) {
    const a = d.assessments.find((x) => x.id === r.id)!;
    defaults.deadlineKind = a.deadline.kind;
    if (a.deadline.kind === "date") defaults.due = a.deadline.date;
    if (a.deadline.kind === "timed") {
      defaults.zone = a.deadline.zone;
      defaults.at = localInput(a.deadline.at, a.deadline.zone);
      if (a.endsAt) defaults.endsAt = localInput(a.endsAt, a.deadline.zone);
    }
  }
  if (r.kind === "session" || r.kind === "manual") {
    defaults.status = record
      ? d.sessions.find((s) => s.id === r.id)!.status
      : "planned";
    const s = d.sessions.find((s) => s.id === r.id);
    if (s?.plannedStart)
      defaults.plannedStart = localInput(s.plannedStart, zone);
    if (s?.plannedEnd) defaults.plannedEnd = localInput(s.plannedEnd, zone);
  }
  return defaults;
}
const labels = {
  course: "course",
  lecture: "lecture",
  assessment: "assessment",
  session: "study session",
  manual: "study time",
  resource: "resource",
  semester: "semester",
  type: "assessment type",
  revision: "revision",
};

export function Editor({
  request: r,
  close,
}: {
  request: EditorRequest;
  close: () => void;
}) {
  const { data, semesterId, run, saveError } = useStudy();
  const [v, setV] = useState<Values>(() => original(data, r));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const value = (key: string) => v[key] || "";
  function update(key: string, val: string) {
    setV((old) => ({
      ...old,
      [key]: val,
      ...(key === "courseId" ? { lectureId: "", assessmentId: "" } : {}),
    }));
  }
  function field(
    key: string,
    label: string,
    opts: {
      type?: string;
      required?: boolean;
      hint?: string;
      min?: number;
      max?: number;
      step?: string;
    } = {},
  ) {
    return (
      <label className={opts.type === "textarea" ? "span-2" : ""}>
        {label}
        {opts.type === "textarea" ? (
          <textarea
            value={value(key)}
            onChange={(e) => update(key, e.target.value)}
            maxLength={20000}
            rows={3}
          />
        ) : (
          <input
            type={opts.type || "text"}
            value={value(key)}
            required={opts.required}
            min={opts.min}
            max={opts.max}
            step={opts.step}
            maxLength={opts.type === "url" ? 4000 : 300}
            onInput={(e) => update(key, e.currentTarget.value)}
            onChange={(e) => update(key, e.target.value)}
          />
        )}{" "}
        {opts.hint && <small>{opts.hint}</small>}
      </label>
    );
  }
  function select(
    key: string,
    label: string,
    options: { id: string; label: string }[],
    optional = false,
  ) {
    return (
      <label>
        {label}
        <select
          value={value(key)}
          required={!optional}
          onChange={(e) => update(key, e.target.value)}
        >
          <option value="">{optional ? "None" : "Choose…"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const courseSelect = select(
    "courseId",
    "Course",
    data.courses
      .filter((c) => c.semesterId === semesterId)
      .map((c) => ({ id: c.id, label: `${c.code} · ${c.title}` })),
    r.kind === "session" || r.kind === "manual",
  );
  const lectureSelect = select(
    "lectureId",
    "Lecture (optional)",
    data.lectures
      .filter((l) => l.courseId === v.courseId)
      .map((l) => ({ id: l.id, label: `${l.number}. ${l.title}` })),
    true,
  );
  const statusSelect = (options: string[]) =>
    select(
      "status",
      "Status",
      options.map((id) => ({ id, label: id })),
    );
  let fields: ReactNode;
  switch (r.kind) {
    case "course":
      fields = (
        <>
          {field("code", "Course code", { required: true })}
          {field("title", "Course title", { required: true })}
          {field("credits", "Credit hours (optional)", {
            type: "number",
            min: 0,
            max: 100,
            step: "0.5",
          })}
          {select(
            "priority",
            "Priority",
            ["low", "normal", "high"].map((id) => ({ id, label: id })),
          )}
          {field("lectureTotal", "Confirmed lecture total", {
            type: "number",
            min: 0,
            max: 2000,
            hint: "Leave blank if unknown. No lectures are assumed.",
          })}
          {field("folderUrl", "Google Drive folder URL", { type: "url" })}
          {field("notes", "Short course notes", { type: "textarea" })}
          {select("planningActive", "Include in daily planner", [
            { id: "true", label: "Active" },
            { id: "false", label: "Completed / inactive" },
          ])}
          {select(
            "planningStatus",
            "Planning status",
            [
              "On track",
              "Needs attention",
              "Behind",
              "Temporarily high priority",
            ].map((id) => ({ id, label: id })),
          )}
          {field("planningReason", "Reason for planning status", {
            type: "textarea",
            hint: "Affects tomorrow onward. A locked Today plan stays unchanged.",
          })}
          {field("catchUpMinutes", "Catch-up need (minutes)", {
            type: "number",
            min: 0,
            max: 180,
            hint: "Priority signal only; extra work is spread across days within the daily limit.",
          })}
        </>
      );
      break;
    case "lecture":
      fields = (
        <>
          {courseSelect}
          {field("number", "Lecture number", {
            type: "number",
            min: 1,
            required: true,
          })}
          {field("title", "Title", { required: true })}
          {statusSelect(["not started", "in progress", "completed"])}
          {field("nextRevision", "Next revision (optional)", { type: "date" })}
          {select("excluded", "Progress tracking", [
            { id: "false", label: "Included" },
            { id: "true", label: "Excluded" },
          ])}
          {select("needsRevision", "Weak-area / revision flag", [
            { id: "false", label: "No flag" },
            { id: "true", label: "Needs revision" },
          ])}
        </>
      );
      break;
    case "revision":
      fields = (
        <>
          <p className="span-2 form-note">
            Record a revision of{" "}
            {data.lectures.find((l) => l.id === r.id)?.title}. It will be dated
            now. The next revision date is optional.
          </p>
          {field("nextRevision", "Next revision (optional)", { type: "date" })}
        </>
      );
      break;
    case "assessment":
      fields = (
        <>
          {courseSelect}
          {select(
            "typeId",
            "Assessment type",
            data.types.map((t) => ({ id: t.id, label: t.label })),
          )}
          {field("title", "Title", { required: true })}
          {statusSelect([
            "not started",
            "in progress",
            "submitted",
            "completed",
            "cancelled",
          ])}
          {field("opensOn", "Opening date (optional)", { type: "date" })}
          {select("deadlineKind", "Scheduling", [
            { id: "none", label: "Date unknown" },
            { id: "date", label: "Date only" },
            { id: "timed", label: "Timed deadline / scheduled start" },
          ])}
          {v.deadlineKind === "date" &&
            field("due", "Due date", { type: "date", required: true })}
          {v.deadlineKind === "timed" && (
            <>
              {field("zone", "Source timezone", {
                required: true,
                hint: "IANA name, e.g. Asia/Karachi",
              })}
              {field("at", "Deadline / scheduled start", {
                type: "datetime-local",
                required: true,
              })}
              {field("endsAt", "Scheduled end (optional)", {
                type: "datetime-local",
              })}
            </>
          )}
          {field("sourceUrl", "Source link (optional)", { type: "url" })}
          {field("notes", "Notes", { type: "textarea" })}
          <details
            className="span-2 coverage-editor"
            open={v.coverage_type !== "unknown" || !!v.practicePercent}
          >
            <summary>Coverage, source and practice details</summary>
            <div className="form-grid">
              <p className="span-2 form-note">
                Dates do not establish syllabus coverage. Leave coverage
                awaiting announcement until VU confirms it. Numbered topics must
                match the tracked study units explicitly; handout chapters and
                video topics may differ.
              </p>
              {select(
                "coverage_type",
                "Coverage type",
                ["unknown", "text", "numbered"].map((id) => ({
                  id,
                  label: id,
                })),
              )}
              {select(
                "coverage_verification",
                "Coverage verification",
                ["awaiting", "provisional", "verified"].map((id) => ({
                  id,
                  label: id,
                })),
              )}
              {field("coverage_officialText", "Official coverage text", {
                type: "textarea",
              })}
              {v.coverage_type === "numbered" && (
                <>
                  {field("coverage_startUnit", "Start unit/topic", {
                    type: "number",
                    min: 1,
                    max: 2000,
                    required: true,
                  })}
                  {field("coverage_endUnit", "End unit/topic", {
                    type: "number",
                    min: 1,
                    max: 2000,
                    required: true,
                  })}
                </>
              )}
              {select("coverage_mapping", "Coverage-to-tracker mapping", [
                {
                  id: "unconfirmed",
                  label: "Not confirmed / different numbering",
                },
                {
                  id: "direct",
                  label: "I confirmed these numbers match the tracked units",
                },
              ])}
              {field("coverage_readingDependency", "Reading dependency text", {
                type: "textarea",
              })}
              {field(
                "coverage_readingStart",
                "Reading range start (optional)",
                {
                  type: "number",
                  min: 1,
                },
              )}
              {field("coverage_readingEnd", "Reading range end (optional)", {
                type: "number",
                min: 1,
              })}
              {field("marks", "Marks (optional)", {
                type: "number",
                min: 0,
                max: 100000,
                step: "0.5",
              })}
              {select(
                "coverage_sourceType",
                "Coverage source type",
                sourceTypes.map((id) => ({ id, label: id })),
              )}
              {field(
                "coverage_sourceNote",
                "Coverage source note / reference",
                {
                  type: "textarea",
                  required: v.coverage_verification === "verified",
                },
              )}
              {field(
                "practicePercent",
                "Practice mastery % (manually recorded)",
                {
                  type: "number",
                  min: 0,
                  max: 100,
                  step: "0.1",
                  hint: "Optional practice result, separate from studying and revision. Never calculated from completion.",
                },
              )}
              {field("practiceSource", "Practice result source / reference", {
                required: !!v.practicePercent,
              })}
            </div>
          </details>
        </>
      );
      break;
    case "session":
    case "manual":
      fields = (
        <>
          {field("title", "Session title", { required: true })}
          {courseSelect}
          {v.courseId && lectureSelect}
          {v.courseId &&
            select(
              "assessmentId",
              "Assessment (optional)",
              data.assessments
                .filter((a) => a.courseId === v.courseId)
                .map((a) => ({ id: a.id, label: a.title })),
              true,
            )}
          <p className="span-2 form-note">
            Times use {data.settings.timezone}. Planned time and actual study
            time are kept separately.
          </p>
          {r.kind === "session" ? (
            <>
              {field("plannedStart", "Planned start (optional)", {
                type: "datetime-local",
              })}
              {field("plannedEnd", "Planned end (optional)", {
                type: "datetime-local",
              })}
              {statusSelect(["planned", "completed", "cancelled", "missed"])}
            </>
          ) : (
            <>
              {field("actualStart", "Actual start", {
                type: "datetime-local",
                required: true,
              })}
              {field("actualEnd", "Actual end", {
                type: "datetime-local",
                required: true,
              })}
            </>
          )}
          {field("notes", "Notes", { type: "textarea" })}
        </>
      );
      break;
    case "resource":
      fields = (
        <>
          {courseSelect}
          {lectureSelect}
          {field("title", "Saved title", { required: true })}
          {field("url", "Original Google Drive URL", {
            type: "url",
            required: true,
          })}
          {field("tags", "Tags, separated by commas")}
          <p className="span-2 form-note">
            Files open in Google Drive. Access and editing follow the file’s
            existing Google permissions and your Google account. Saving a link
            does not change sharing permissions or copy the file.
          </p>
        </>
      );
      break;
    case "semester":
      fields = (
        <>
          {field("name", "Semester name", { required: true })}
          {field("startDate", "Start date (optional)", { type: "date" })}
          {field("endDate", "End date (optional)", { type: "date" })}
        </>
      );
      break;
    case "type":
      fields = (
        <>
          {field("label", "Type name", { required: true })}
          <p className="span-2 form-note">
            Types are labels. Scheduling behavior uses each assessment’s
            explicit dates.
          </p>
        </>
      );
      break;
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const startAfterSave =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "start";
    setError("");
    setSaving(true);
    const fresh = stamp();
    const now = fresh.updatedAt;
    try {
      const ok = await run((d) => {
        const optional = (key: string) => value(key).trim() || undefined;
        const numeric = (key: string) =>
          optional(key) === undefined ? undefined : Number(value(key));
        const put = <T extends { id: string; updatedAt: string }>(
          rows: T[],
          item: T,
        ) => {
          const i = rows.findIndex((x) => x.id === r.id);
          if (i < 0) rows.push(item);
          else
            rows[i] = {
              ...item,
              id: rows[i].id,
              createdAt: (rows[i] as T & { createdAt: string }).createdAt,
              updatedAt: now,
            };
        };
        if (r.kind === "course")
          put(d.courses, {
            ...fresh,
            semesterId,
            code: value("code").trim(),
            title: value("title").trim(),
            credits: numeric("credits"),
            priority: value("priority") as "normal",
            lectureTotal: numeric("lectureTotal"),
            notes: value("notes"),
            folderUrl: value("folderUrl").trim(),
            baselineUnitIds: d.courses.find((c) => c.id === r.id)
              ?.baselineUnitIds,
            cs101ScheduleVersion: d.courses.find((c) => c.id === r.id)
              ?.cs101ScheduleVersion,
            planning: {
              active: value("planningActive") === "true",
              status: value("planningStatus") as "On track",
              reason: value("planningReason"),
              catchUpMinutes: Number(value("catchUpMinutes") || 0),
            },
          });
        if (r.kind === "lecture") {
          const previous = d.lectures.find((l) => l.id === r.id);
          put(d.lectures, {
            ...fresh,
            courseId: value("courseId"),
            number: Number(value("number")),
            title: value("title").trim(),
            status: value("status") as "completed",
            completedAt:
              value("status") === "completed"
                ? previous?.completedAt || now
                : undefined,
            excluded: value("excluded") === "true",
            nextRevision: optional("nextRevision"),
            needsRevision: value("needsRevision") === "true",
          });
        }
        if (r.kind === "revision") revise(d, r.id!, optional("nextRevision"));
        if (r.kind === "assessment") {
          const deadline: Deadline =
            v.deadlineKind === "date"
              ? { kind: "date", date: value("due") }
              : v.deadlineKind === "timed"
                ? {
                    kind: "timed",
                    at: localToInstant(value("at"), value("zone")),
                    zone: value("zone"),
                  }
                : { kind: "none" };
          const previous = d.assessments.find((a) => a.id === r.id);
          put(d.assessments, {
            ...fresh,
            calendarEligible: previous?.calendarEligible,
            dateConfirmation: previous?.dateConfirmation,
            courseId: value("courseId"),
            typeId: value("typeId"),
            title: value("title").trim(),
            notes: value("notes"),
            sourceUrl: value("sourceUrl").trim(),
            opensOn: optional("opensOn"),
            deadline,
            endsAt:
              deadline.kind === "timed" && value("endsAt")
                ? localToInstant(value("endsAt"), value("zone"))
                : undefined,
            status: value("status") as "completed",
            completedAt: ["submitted", "completed"].includes(value("status"))
              ? previous?.completedAt || now
              : undefined,
            coverage: {
              type: value("coverage_type") as "unknown",
              verification: value("coverage_verification") as "awaiting",
              officialText: value("coverage_officialText"),
              startUnit: numeric("coverage_startUnit"),
              endUnit: numeric("coverage_endUnit"),
              mapping: value("coverage_mapping") as "unconfirmed",
              readingDependency: value("coverage_readingDependency"),
              readingStart: numeric("coverage_readingStart"),
              readingEnd: numeric("coverage_readingEnd"),
              sourceType: value("coverage_sourceType") as "VULMS",
              sourceNote: value("coverage_sourceNote"),
            },
            marks: numeric("marks"),
            practice:
              optional("practicePercent") !== undefined
                ? {
                    percent: Number(value("practicePercent")),
                    sourceNote: value("practiceSource"),
                    recordedAt:
                      previous?.practice?.percent ===
                        Number(value("practicePercent")) &&
                      previous.practice.sourceNote === value("practiceSource")
                        ? previous.practice.recordedAt
                        : now,
                  }
                : undefined,
          });
        }
        if (r.kind === "session" || r.kind === "manual") {
          const previous = d.sessions.find((s) => s.id === r.id);
          const intervals = previous?.intervals || [];
          if (r.kind === "manual")
            intervals.push({
              start: localToInstant(value("actualStart"), d.settings.timezone),
              end: localToInstant(value("actualEnd"), d.settings.timezone),
            });
          put(d.sessions, {
            ...fresh,
            semesterId,
            title: value("title").trim(),
            notes: value("notes"),
            courseId: optional("courseId"),
            lectureId: optional("lectureId"),
            assessmentId: optional("assessmentId"),
            plannedStart:
              r.kind === "session" && value("plannedStart")
                ? localToInstant(value("plannedStart"), d.settings.timezone)
                : previous?.plannedStart,
            plannedEnd:
              r.kind === "session" && value("plannedEnd")
                ? localToInstant(value("plannedEnd"), d.settings.timezone)
                : previous?.plannedEnd,
            status:
              r.kind === "manual"
                ? "completed"
                : (value("status") as "planned"),
            intervals,
          });
        }
        if (r.kind === "resource")
          put(d.resources, {
            ...fresh,
            courseId: value("courseId"),
            lectureId: optional("lectureId"),
            title: value("title").trim(),
            url: value("url").trim(),
            tags: [
              ...new Set(
                value("tags")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ],
            provider: "google-drive",
            providerFileId: driveFileId(value("url")),
          });
        if (r.kind === "semester") {
          put(d.semesters, {
            ...fresh,
            name: value("name").trim(),
            startDate: optional("startDate"),
            endDate: optional("endDate"),
            archived: d.semesters.find((s) => s.id === r.id)?.archived || false,
          });
          if (!r.id) d.settings.activeSemesterId = fresh.id;
        }
        if (r.kind === "type")
          put(d.types, {
            ...fresh,
            label: value("label").trim(),
            calendarEligible:
              d.types.find((t) => t.id === r.id)?.calendarEligible ??
              defaultCalendarEligible(value("label")),
          });
        if (r.kind === "session" && startAfterSave)
          startTimer(d, r.id || fresh.id);
      }, "Saved successfully");
      if (ok) close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    }
    setSaving(false);
  }
  return (
    <Modal
      title={`${r.kind === "manual" || r.kind === "revision" ? "Record" : r.id ? "Edit" : "Add"} ${labels[r.kind]}`}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">{fields}</div>
        {(error || saveError) && (
          <p role="alert" className="error">
            {error || saveError}
          </p>
        )}
        <footer className="dialog-footer">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {r.kind === "session" && (
            <button
              className="primary"
              value="start"
              disabled={saving || !!data.timer}
            >
              Save & start timer
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
