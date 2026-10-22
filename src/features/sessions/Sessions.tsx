import { useEffect, useState } from "react";
import { Play, Pause, Square, Pencil, Clock3 } from "lucide-react";
import { useStudy } from "../../app/context";
import {
  finishTimer,
  startTimer,
  timerIntervals,
  toggleTimer,
} from "../../app/actions";
import {
  duration,
  formatInstant,
  localSeconds,
  localToInstant,
  minutes,
} from "../../domain/dates";
import { Modal, Pill } from "../../shared/ui";
import type { Session } from "../../domain/model";

export function SessionRow({ session: s }: { session: Session }) {
  const { data: d, run, edit } = useStudy();
  return (
    <article className="session-row">
      <span className="session-icon">
        <Clock3 size={20} />
      </span>
      <div className="grow">
        <h3>{s.title}</h3>
        <p className="meta">
          {s.plannedStart
            ? formatInstant(s.plannedStart, d.settings.timezone)
            : "Unscheduled"}{" "}
          · {duration(minutes(s.intervals))} recorded
          {s.courseId
            ? ` · ${d.courses.find((c) => c.id === s.courseId)?.code}`
            : ""}
        </p>
        <Pill>{s.status}</Pill>
      </div>
      <div className="button-row">
        <button
          className="small"
          disabled={!!d.timer || s.status === "cancelled"}
          onClick={() => void run((d) => startTimer(d, s.id), "Timer started")}
        >
          <Play size={14} />
          Start
        </button>
        <button
          className="icon-button"
          aria-label={`Edit session ${s.title}`}
          onClick={() => edit({ kind: "session", id: s.id })}
        >
          <Pencil size={16} />
        </button>
        <button
          className="small"
          onClick={() => edit({ kind: "manual", id: s.id })}
        >
          Log time
        </button>
      </div>
    </article>
  );
}
export function Timer({
  recovered,
  clearRecovered,
}: {
  recovered: boolean;
  clearRecovered: () => void;
}) {
  const { data: d, run, saveError } = useStudy();
  const [, tick] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [end, setEnd] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const timer = d.timer;
  if (!timer) return null;
  const session = d.sessions.find((s) => s.id === timer.sessionId)!;
  function review() {
    setEnd("");
    setErr("");
    setFinishing(true);
  }
  return (
    <>
      <div className="timer-bar">
        <span className="timer-dot" />
        <div className="grow">
          <strong>{session.title}</strong>
          <span>
            {duration(minutes(timerIntervals(d)))} ·{" "}
            {recovered
              ? "Recovered timer — review elapsed time"
              : timer.startedAt
                ? "Studying now"
                : "Paused"}
          </span>
        </div>
        <button
          disabled={recovered}
          onClick={() =>
            void run(
              (d) => toggleTimer(d),
              timer.startedAt ? "Timer paused" : "Timer resumed",
            )
          }
        >
          {timer.startedAt ? <Pause size={16} /> : <Play size={16} />}
          <span>{timer.startedAt ? "Pause" : "Resume"}</span>
        </button>
        <button onClick={review}>
          <Square size={15} />
          Review & finish
        </button>
      </div>
      {(finishing || recovered) && (
        <Modal
          title={
            recovered ? "Recover your study timer" : "Finish study session"
          }
          close={() => {
            setFinishing(false);
            clearRecovered();
          }}
        >
          <p className="form-note">
            Confirm the actual finish time before recording. Paused intervals
            are excluded. If this timer ran while you were away, correct the
            finish time or discard it.
          </p>
          <label>
            Finish time · {d.settings.timezone}
            <input
              type="datetime-local"
              step="1"
              value={
                end ||
                localSeconds(new Date().toISOString(), d.settings.timezone)
              }
              onInput={(e) => setEnd(e.currentTarget.value)}
              onChange={(e) => setEnd(e.target.value)}
              disabled={!timer.startedAt}
            />
          </label>
          <p className="muted">
            {timer.startedAt
              ? "This adjusts the current running interval; earlier paused intervals are preserved."
              : `${duration(minutes(timer.intervals))} recorded before pausing.`}
          </p>
          {(err || saveError) && (
            <p role="alert" className="error">
              {saveError || err}
            </p>
          )}
          <footer className="dialog-footer">
            <button
              className="danger-button"
              onClick={() => {
                if (
                  confirm(
                    "Discard this unfinished timer? Previously saved session time is preserved.",
                  )
                )
                  void run((d) => {
                    d.timer = undefined;
                  }, "Timer discarded").then((ok) => {
                    if (ok) {
                      clearRecovered();
                      setFinishing(false);
                    }
                  });
              }}
            >
              Discard timer
            </button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  const at =
                    timer.startedAt && end
                      ? localToInstant(end, d.settings.timezone)
                      : new Date().toISOString();
                  const ok = await run(
                    (d) => finishTimer(d, at),
                    "Study time saved",
                  );
                  if (ok) {
                    clearRecovered();
                    setFinishing(false);
                  } else setErr("Time was not saved. Check the error message.");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Invalid time");
                }
              }}
            >
              Confirm & save
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
