import { useState, type FormEvent } from "react";
import { useStudy } from "../../app/context";
import { Modal, Pill } from "../../shared/ui";
import { addDays, minutes, today } from "../../domain/dates";
import {
  activePlanningCourses,
  lastStudiedDay,
  nextStudyUnit,
  openAssessments,
  assessmentPlanningDay,
  planOutcome,
  recommendDay,
  saveDayPlan,
  unlockDayPlan,
} from "../../domain/planner";
import { type DailyPlan } from "../../domain/model";
import {
  logPlanMinutes,
  logPlanStatus,
  startPlanTimer,
} from "../../app/planner-actions";
import { setLectureStatus } from "../../app/actions";
import { progress } from "../../domain/progress";

export function DailyPlanner({ part }: { part: "today" | "tomorrow" }) {
  const { data: d, semesterId, run } = useStudy();
  const day = today(d.settings.timezone),
    tomorrow = addDays(day, 1);
  const plan = d.dailyPlans.find(
    (p) => p.semesterId === semesterId && p.day === day,
  );
  const recommendation = recommendDay(d, semesterId, day);
  const preview = recommendDay(d, semesterId, tomorrow);
  const tomorrowDraft = d.dailyPlans.find(
    (p) => p.semesterId === semesterId && p.day === tomorrow,
  );
  const [editing, setEditing] = useState<{ day: string; replan: boolean }>();
  const archived = d.semesters.find((s) => s.id === semesterId)?.archived;
  const items = plan?.items || recommendation.items;
  return (
    <>
      {part === "today" && (
        <section className="panel daily-planner">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TODAY · {day}</p>
              <h2>{plan?.locked ? "Today — Locked" : "Today's study plan"}</h2>
            </div>
            <Pill>{plan ? planOutcome(d, plan) : "Not confirmed"}</Pill>
          </div>
          <p className="muted">
            {plan?.locked
              ? "Today's choices are fixed. New deadlines and priority changes influence tomorrow onward."
              : "Review a realistic plan, then explicitly confirm and lock it. Recommendations are not saved automatically."}
          </p>
          {!items.length && (
            <p>
              {archived
                ? "This semester is archived. Its plan history remains available."
                : recommendation.booked
                  ? "Your existing sessions already fill the daily budget. Keep those sessions or adjust them before adding work."
                  : "Add an active course to begin planning."}
            </p>
          )}
          <p>
            <strong>
              Total planned: {items.reduce((s, i) => s + i.minutes, 0)} min
            </strong>{" "}
            ·{" "}
            {plan
              ? `Limit when saved: ${plan.maximumMinutes}`
              : `Daily maximum: ${d.settings.planner.maximumMinutes}`}{" "}
            min
          </p>
          <div className="daily-items">
            {items.map((item) => (
              <article className="daily-item" key={item.role}>
                <p className="eyebrow">{item.role}</p>
                <h3>
                  {d.courses.find((c) => c.id === item.courseId)?.code} ·{" "}
                  {item.minutes} min
                </h3>
                <strong>{item.focus}</strong>
                <details className="plan-reason">
                  <summary>Why this item?</summary>
                  <p className="meta">
                    {item.source}: {item.reason}
                  </p>
                </details>
                {plan && (
                  <>
                    <p>
                      <Pill>{item.status}</Pill>
                      {item.sessionId &&
                        ` · ${Math.round(minutes(d.sessions.find((s) => s.id === item.sessionId)?.intervals || []))} min recorded`}
                    </p>
                    <div className="button-row planner-actions">
                      {(["completed", "partial", "skipped"] as const).map(
                        (status) => (
                          <button
                            className="small"
                            key={status}
                            aria-pressed={item.status === status}
                            onClick={() =>
                              void run(
                                (d) =>
                                  logPlanStatus(d, plan.id, item.role, status),
                                `Plan item ${status}; academic completion is unchanged`,
                              )
                            }
                          >
                            {status[0].toUpperCase() + status.slice(1)}
                          </button>
                        ),
                      )}
                      <button
                        className="small"
                        disabled={!!d.timer}
                        onClick={() =>
                          void run(
                            (d) => startPlanTimer(d, plan.id, item.role),
                            "Study timer started",
                          )
                        }
                      >
                        Start timer
                      </button>
                      {([30, 60] as const).map((n) => (
                        <button
                          className="small"
                          key={n}
                          disabled={!!d.timer}
                          title={`Record actual study during the last ${n} minutes`}
                          onClick={() => {
                            if (
                              confirm(
                                `Record that you studied this item during the last ${n} minutes? Overlapping time entries will be rejected.`,
                              )
                            )
                              void run(
                                (d) => logPlanMinutes(d, plan.id, item.role, n),
                                `${n} actual study minutes recorded`,
                              );
                          }}
                        >
                          Log {n} min
                        </button>
                      ))}
                      {item.lectureId && (
                        <>
                          <button
                            className="small"
                            onClick={() =>
                              void run((d) => {
                                d.lectures.find(
                                  (l) => l.id === item.lectureId,
                                )!.needsRevision = true;
                              }, "Unit flagged for revision; today's plan remains fixed")
                            }
                          >
                            Needs revision
                          </button>
                          <button
                            className="small"
                            disabled={
                              d.lectures.find((l) => l.id === item.lectureId)
                                ?.status === "completed"
                            }
                            onClick={() =>
                              void run(
                                (d) =>
                                  setLectureStatus(
                                    d,
                                    item.lectureId!,
                                    "completed",
                                  ),
                                "Academic unit explicitly marked complete",
                              )
                            }
                          >
                            Mark unit complete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
          {plan?.notes && <p className="prewrap">{plan.notes}</p>}
          <div className="button-row">
            {plan?.locked ? (
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Unlock today's plan for intentional editing? New information will still never rewrite it automatically.",
                    )
                  )
                    void run(
                      (d) => unlockDayPlan(d, plan.id),
                      "Today's plan unlocked; edit it explicitly",
                    );
                }}
              >
                Unlock today's plan
              </button>
            ) : (
              <>
                <button
                  className="primary"
                  disabled={
                    archived || !activePlanningCourses(d, semesterId).length
                  }
                  onClick={() => setEditing({ day, replan: false })}
                >
                  Review & lock Today
                </button>
                {plan && (
                  <button onClick={() => setEditing({ day, replan: true })}>
                    Replan unlocked draft
                  </button>
                )}
              </>
            )}
          </div>
          <p className="meta">
            Completed / Partial / Skipped records the plan outcome. Only “Mark
            unit complete” changes academic completion. Time buttons record
            actual sessions separately.
          </p>
        </section>
      )}
      {part === "tomorrow" && (
        <section className="panel tomorrow-preview">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TOMORROW · {tomorrow}</p>
              <h2>Tomorrow recommendation</h2>
            </div>
            <button
              disabled={!preview.items.length}
              onClick={() => setEditing({ day: tomorrow, replan: false })}
            >
              Review tomorrow
            </button>
          </div>
          {tomorrowDraft && (
            <p className="notice">
              Saved tomorrow draft:{" "}
              {tomorrowDraft.items
                .map(
                  (i) =>
                    `${d.courses.find((c) => c.id === i.courseId)?.code} ${i.minutes} min`,
                )
                .join(" + ")}
              . Review it to keep or change these choices.
            </p>
          )}
          {preview.items.map((item) => (
            <div key={item.role}>
              <strong>
                {item.role}:{" "}
                {d.courses.find((c) => c.id === item.courseId)?.code} ·{" "}
                {item.minutes} min
              </strong>
              <p>{item.focus}</p>
              <details>
                <summary>Why this item?</summary>
                <p className="meta">{item.reason}</p>
              </details>
            </div>
          ))}
          {!preview.items.length && (
            <p>No additional study recommended within the available budget.</p>
          )}
          <p className="meta">
            {preview.explanation} Subject to change until tomorrow becomes Today
            and you lock it. A manually saved draft is kept until you edit it.
          </p>
          <details>
            <summary>How courses were ranked</summary>
            {preview.rankings.map((r) => (
              <p key={r.course.id}>
                <strong>
                  {r.course.code}: {r.score}
                </strong>{" "}
                · {r.reasons.join(" · ")}
              </p>
            ))}
          </details>
        </section>
      )}
      {editing && (
        <PlanEditor
          key={`${editing.day}:${editing.replan}`}
          day={editing.day}
          replan={editing.replan}
          close={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

function PlanEditor({
  day,
  replan,
  close,
}: {
  day: string;
  replan: boolean;
  close: () => void;
}) {
  const { data: d, semesterId, run, saveError } = useStudy();
  const stored = d.dailyPlans.find(
    (p) => p.semesterId === semesterId && p.day === day,
  );
  const [light, setLight] = useState(false);
  const [items, setItems] = useState<DailyPlan["items"]>(() =>
    structuredClone(
      !replan && stored ? stored.items : recommendDay(d, semesterId, day).items,
    ),
  );
  const [notes, setNotes] = useState(stored?.notes || "");
  const [busy, setBusy] = useState(false);
  const courses = activePlanningCourses(d, semesterId);
  function change(index: number, patch: Partial<DailyPlan["items"][number]>) {
    setItems((old) =>
      old.map((item, i) =>
        i === index ? { ...item, ...patch, source: "Personal Plan" } : item,
      ),
    );
  }
  function choose(index: number, courseId: string) {
    const unit = nextStudyUnit(d, courseId, day);
    change(index, {
      courseId,
      lectureId: unit?.id,
      focus: unit?.title || "Review current material",
      reason: "Personal plan: selected manually",
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const lock =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "lock";
    const ok = await run(
      (d) => saveDayPlan(d, semesterId, day, items, notes, lock),
      lock
        ? "Today's plan confirmed and locked"
        : "Draft saved; it is not locked",
    );
    setBusy(false);
    if (ok) close();
  }
  return (
    <Modal title={`Plan ${day}`} close={close}>
      <form className="stack-form" onSubmit={save}>
        <p>
          Save a draft, or explicitly lock Today. Maximum{" "}
          {d.settings.planner.maximumMinutes} min. Existing scheduled sessions
          count toward the recommendation budget.
        </p>
        <div className="button-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={light}
              onChange={(e) => {
                setLight(e.target.checked);
                setItems(
                  recommendDay(d, semesterId, day, e.target.checked).items,
                );
              }}
            />
            Light day ({d.settings.planner.lightMinutes} min)
          </label>
          <button
            type="button"
            onClick={() =>
              setItems(recommendDay(d, semesterId, day, light).items)
            }
          >
            Use latest recommendation
          </button>
        </div>
        {items.map((item, index) => (
          <fieldset key={item.role}>
            <legend>{item.role}</legend>
            <div className="form-grid">
              <label>
                Course
                <select
                  value={item.courseId}
                  onChange={(e) => choose(index, e.target.value)}
                  required
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Planned minutes
                <input
                  type="number"
                  required
                  min={1}
                  max={d.settings.planner.maximumMinutes}
                  value={item.minutes}
                  onChange={(e) =>
                    change(index, { minutes: Number(e.target.value) })
                  }
                />
              </label>
              <label className="span-2">
                Study unit (optional)
                <select
                  value={item.lectureId || ""}
                  onChange={(e) => {
                    const unit = d.lectures.find(
                      (l) => l.id === e.target.value,
                    );
                    change(index, {
                      lectureId: unit?.id,
                      focus: unit?.title || "Review current material",
                    });
                  }}
                >
                  <option value="">General study / review</option>
                  {d.lectures
                    .filter((l) => l.courseId === item.courseId && !l.excluded)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="span-2">
                Study focus
                <input
                  required
                  maxLength={300}
                  value={item.focus}
                  onChange={(e) => change(index, { focus: e.target.value })}
                />
              </label>
              <label className="span-2">
                Reason / source
                <textarea
                  required
                  value={item.reason}
                  onChange={(e) => change(index, { reason: e.target.value })}
                />
              </label>
            </div>
            {item.role === "Secondary" && (
              <button
                type="button"
                onClick={() => setItems((old) => old.slice(0, 1))}
              >
                Remove secondary item
              </button>
            )}
          </fieldset>
        ))}
        {!items.length && courses.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const course = courses[0];
              const unit = nextStudyUnit(d, course.id, day);
              setItems([
                {
                  role: "Main",
                  courseId: course.id,
                  lectureId: unit?.id,
                  focus: unit?.title || "Review current material",
                  minutes: Math.min(60, d.settings.planner.maximumMinutes),
                  reason: "Personal plan: selected manually",
                  source: "Personal Plan",
                  status: "pending",
                },
              ]);
            }}
          >
            Add Main item manually
          </button>
        )}
        {items.length === 1 && courses.length > 1 && (
          <button
            type="button"
            onClick={() => {
              const c = courses.find((c) => c.id !== items[0].courseId)!;
              setItems((old) => [
                ...old,
                {
                  role: "Secondary",
                  courseId: c.id,
                  focus: "Review current material",
                  minutes: 25,
                  reason: "Personal plan: selected manually",
                  source: "Personal Plan",
                  status: "pending",
                },
              ]);
            }}
          >
            Add Secondary item
          </button>
        )}
        <label>
          Plan notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p>
          Total {items.reduce((s, i) => s + i.minutes, 0)} min · maximum{" "}
          {d.settings.planner.maximumMinutes} min
        </p>
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}
        <footer className="dialog-footer">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button disabled={busy || !items.length}>Save draft</button>
          {day === today(d.settings.timezone) && (
            <button
              className="primary"
              value="lock"
              disabled={busy || !items.length}
            >
              Confirm & lock Today
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}

export function CourseStatus() {
  const { data: d, semesterId, edit } = useStudy();
  const day = today(d.settings.timezone);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Semester status</h2>
      </div>
      <div className="course-status-grid">
        {activePlanningCourses(d, semesterId).map((c) => {
          const p = progress(d, semesterId, c.id),
            next = nextStudyUnit(d, c.id, day),
            last = lastStudiedDay(d, c.id, day);
          const current = d.lectures
            .filter(
              (l) =>
                l.courseId === c.id &&
                !l.excluded &&
                (l.status === "in progress" || l.status === "completed"),
            )
            .sort((a, b) => b.number - a.number)[0];
          const assessment = openAssessments(d, c.id).sort((a, b) =>
            (assessmentPlanningDay(d, a, day) || "9999").localeCompare(
              assessmentPlanningDay(d, b, day) || "9999",
            ),
          )[0];
          const weak = d.lectures.filter(
            (l) =>
              l.courseId === c.id &&
              !l.excluded &&
              (l.needsRevision || (l.nextRevision && l.nextRevision <= day)),
          ).length;
          return (
            <article
              key={c.id}
              className="course-status"
              data-status={c.planning?.status || "On track"}
            >
              <h3>{c.code}</h3>
              <p>{c.title}</p>
              <Pill>{c.planning?.status || "On track"}</Pill>

              <p>
                <strong>
                  {p.completed} / {p.total ?? "unknown"} studied units
                </strong>
                {p.total !== undefined && p.total > 0
                  ? ` · ${Math.round((p.completed / p.total) * 100)}%`
                  : ""}
              </p>
              <p className="meta">
                {p.total !== undefined && p.completed === p.total && p.total > 0
                  ? "Study outline completed"
                  : p.completed
                    ? "In progress"
                    : "Not started"}
              </p>
              <p className="meta">
                <strong>Next:</strong>{" "}
                {next?.title || "Review current material"}
              </p>
              <p className="meta">
                Upcoming:{" "}
                {assessment
                  ? `${assessment.title} · ${assessmentPlanningDay(d, assessment, day) || "date unknown"}`
                  : "None entered"}
              </p>
              <details>
                <summary>Status details</summary>
                <p className="meta">
                  {c.planning?.reason ||
                    "Manual status; no weekly syllabus or relative course pace assumed."}
                </p>
                <p>
                  Current: {current?.title || "Not started"}
                  <br />
                  Last studied: {last || "No record"}
                  <br />
                  Revision / weak units: {weak}
                </p>
              </details>
              <button
                className="small"
                onClick={() => edit({ kind: "course", id: c.id })}
              >
                Update status
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
export function PlanHistory() {
  const { data: d, semesterId } = useStudy();
  const day = today(d.settings.timezone);
  const plans = d.dailyPlans
    .filter((p) => p.semesterId === semesterId && p.day < day)
    .sort((a, b) => b.day.localeCompare(a.day));
  return (
    <section className="panel">
      <h2>Plan history</h2>
      <p className="muted">
        Missed and partial days stay on their original dates. Recovery raises
        future priority within your daily limit.
      </p>
      {!plans.length ? (
        <p>No previous daily plans yet.</p>
      ) : (
        plans.map((p) => (
          <details key={p.id}>
            <summary>
              {p.day} · {planOutcome(d, p, day)} ·{" "}
              {p.items.reduce((s, i) => s + i.minutes, 0)} min planned
            </summary>
            {p.items.map((i) => (
              <p key={i.role}>
                {i.role} · {d.courses.find((c) => c.id === i.courseId)?.code} ·{" "}
                {i.focus} · {i.minutes} min · {i.status}
              </p>
            ))}
            {p.notes && <p>{p.notes}</p>}
          </details>
        ))
      )}
    </section>
  );
}

export function PlannerSettings() {
  const { data: d, run, saveError } = useStudy();
  const [v, setV] = useState(d.settings.planner);
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Daily planning budget</h2>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await run((d) => {
            d.settings.planner = v;
          }, "Planner preferences saved; locked plans stay unchanged");
          setBusy(false);
        }}
      >
        {(
          [
            ["normalMinutes", "Normal day"],
            ["lightMinutes", "Minimum / light day"],
            ["maximumMinutes", "Maximum recommended day"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label} (minutes)
            <input
              type="number"
              min={30}
              max={180}
              required
              value={v[key]}
              onChange={(e) =>
                setV((old) => ({ ...old, [key]: Number(e.target.value) }))
              }
            />
          </label>
        ))}
        <p className="meta">
          Light ≤ normal ≤ maximum. Defaults: 65 / 90 / 120 min. Missed work
          changes priority, never expands the limit. Lowering the limit
          preserves already locked plans.
        </p>
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Save planning budget
        </button>
      </form>
    </section>
  );
}
