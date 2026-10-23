import { useEffect, useState } from "react";
import { useStudy } from "../../app/context";
import {
  useGoogleCalendar,
  calendarClientId as clientId,
} from "../../app/calendar-context";
import type { Assessment } from "../../domain/model";
import {
  calendarEligible,
  calendarStatus,
  dateSignature,
  datesConfirmed,
} from "../../domain/calendar";
import { googleEventUrl } from "../../integrations/google-calendar";
import { formatInstant } from "../../domain/dates";
export function GoogleCalendarSettings() {
  const { data: d, run, semesterId } = useStudy(),
    g = useGoogleCalendar();
  const semester = d.semesters.find((s) => s.id === semesterId)!;
  const suggested = `VU – ${semester.name.replace(/^Semester\s+\d+\s*[—–-]\s*/i, "")}`;
  const [name, setName] = useState(suggested),
    [selected, setSelected] = useState(
      d.settings.googleCalendar.calendarId || "",
    );
  const [custom, setCustom] = useState("2880");
  const prefs = d.settings.googleCalendar;
  const matches = g.calendars.filter((c) => c.summary === suggested);
  useEffect(() => {
    if (g.calendars.some((c) => c.id === prefs.calendarId))
      setSelected(prefs.calendarId!);
    else setSelected(matches.length === 1 ? matches[0].id : "");
  }, [g.calendars, prefs.calendarId]);
  return (
    <section className="panel google-settings">
      <h2>Google Calendar</h2>
      <p>
        Study Desk is the source of truth. Calendar changes do not modify Study
        Desk academic records.
      </p>
      <p>
        <strong>{g.connected ? "Connected" : "Not connected"}</strong> ·{" "}
        {prefs.calendarName || "No calendar selected"}
        {g.connected && !g.ready ? " · Confirm calendar selection" : ""}
      </p>
      <details className="calendar-help">
        <summary>What gets synchronized?</summary>
        <p className="muted">
          Only confirmed academic assessments are mirrored. Ordinary study
          sessions, revision blocks, and Tomorrow recommendations stay here.
          Google access is separate from your Study Desk login.
        </p>
      </details>
      {!clientId && (
        <p className="notice">
          Google Cloud setup required: add the public OAuth client ID as
          VITE_GOOGLE_CALENDAR_CLIENT_ID and rebuild. The rest of Study Desk
          works without it.
        </p>
      )}
      <div className="button-row">
        <button disabled={g.busy || !clientId} onClick={() => void g.connect()}>
          Connect Google Calendar
        </button>
        <button
          disabled={!g.connected && !g.busy}
          onClick={() => void g.disconnect()}
        >
          Disconnect
        </button>
        <button disabled={!g.ready || g.busy} onClick={() => void g.sync()}>
          Sync confirmed deadlines
        </button>
      </div>
      {g.connected && (
        <div className="calendar-connection-fields">
          <label>
            Owned Google calendar
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select calendar</option>
              {g.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                  {c.primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!selected || g.busy}
            onClick={() => void g.select(selected)}
          >
            Use selected calendar
          </button>
          <p className="muted">
            Changing calendars keeps old events. Remove old mirrors separately
            if needed. Reconnection requires confirming your calendar to avoid
            writing to a different Google account.
          </p>
          <label>
            New dedicated calendar name
            <input
              value={name}
              maxLength={300}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            disabled={g.busy || !name.trim()}
            onClick={() => void g.create(name)}
          >
            Create dedicated calendar
          </button>
        </div>
      )}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={prefs.automatic}
          disabled={!g.ready && !prefs.automatic}
          onChange={(e) =>
            void run((d) => {
              d.settings.googleCalendar.automatic = e.target.checked;
            })
          }
        />
        Automatically sync confirmed academic deadlines
      </label>
      <p className="muted">
        Automatic sync runs for the selected semester while this page is open
        and authorization is valid. Reconnect after reload or token expiry.
        Failed changes remain retryable; no background scheduler runs.
      </p>
      <h3>Academic deadline reminders</h3>
      <p>
        Reminders are before the event's <strong>start</strong>: opening day for
        a multi-day date range, official start for timed events. Closing-day
        warnings appear inside Study Desk. Google controls delivery and all-day
        reminder timing.
      </p>
      {[10080, 1440].map((minutes) => (
        <label className="checkbox-row" key={minutes}>
          <input
            type="checkbox"
            checked={prefs.reminders.includes(minutes)}
            onChange={(e) =>
              void run((d) => {
                const p = d.settings.googleCalendar;
                p.reminders = e.target.checked
                  ? [...new Set([...p.reminders, minutes])].slice(0, 4)
                  : p.reminders.filter((m) => m !== minutes);
              })
            }
          />
          {minutes === 10080 ? "7 days before" : "1 day before"}
        </label>
      ))}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={prefs.openingReminder}
          onChange={(e) =>
            void run((d) => {
              d.settings.googleCalendar.openingReminder = e.target.checked;
            })
          }
        />
        Opening day (all-day date ranges only)
      </label>
      <details>
        <summary>Custom reminders</summary>
        <label>
          Custom reminder (minutes before start, 0–40320)
          <input
            type="number"
            min="0"
            max="40320"
            step="1"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </label>
        <button
          disabled={
            custom === "" ||
            !Number.isInteger(Number(custom)) ||
            Number(custom) < 0 ||
            Number(custom) > 40320 ||
            prefs.reminders.length >= 4
          }
          onClick={() =>
            void run((d) => {
              d.settings.googleCalendar.reminders = [
                ...new Set([
                  ...d.settings.googleCalendar.reminders,
                  Number(custom),
                ]),
              ];
            })
          }
        >
          Add custom reminder
        </button>
        <div className="button-row">
          {prefs.reminders
            .filter((m) => ![10080, 1440].includes(m))
            .map((m) => (
              <button
                key={m}
                onClick={() =>
                  void run((d) => {
                    d.settings.googleCalendar.reminders =
                      d.settings.googleCalendar.reminders.filter(
                        (v) => v !== m,
                      );
                  })
                }
              >
                Remove {m}-minute reminder
              </button>
            ))}
        </div>
        <p className="muted">
          At most four advance reminders plus opening day. Cancelled events have
          reminders disabled.
        </p>
      </details>
      <p className="muted">
        Disconnecting does not remove existing events or their Google reminders.
      </p>
      {g.busy && (
        <p role="status">
          Waiting for Google or saving Calendar status. Use Chrome or Edge for
          Google sign-in. Disconnect cancels pending work.
        </p>
      )}
      {g.message && (
        <p role="status" className="notice">
          {g.message}
        </p>
      )}
      {!!d.calendarMappings.filter((m) => m.status !== "removed").length && (
        <details>
          <summary>Manage existing Google mirrors</summary>
          <p>
            Mappings are kept after assessment deletion or calendar changes.
            Removal only deletes the matching Study Desk-created Google event.
          </p>
          {d.calendarMappings
            .filter((m) => m.status !== "removed")
            .map((m) => (
              <div
                className="calendar-mapping-row"
                key={`${m.calendarId}:${m.eventId}`}
              >
                <span>
                  {d.assessments.find((a) => a.id === m.assessmentId)?.title ||
                    "Deleted assessment"}{" "}
                  ·{" "}
                  {g.calendars.find((c) => c.id === m.calendarId)?.summary ||
                    "Previously selected calendar"}{" "}
                  · {m.status}
                </span>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={googleEventUrl(m.calendarId, m.eventId)}
                >
                  Open in Google Calendar
                </a>
                <button
                  disabled={g.busy || !g.connected}
                  onClick={() => {
                    if (
                      confirm(
                        "Remove this event from Google Calendar? Study Desk records will remain. Automatic recreation will be disabled.",
                      )
                    )
                      void g.remove(m.calendarId, m.eventId);
                  }}
                >
                  Remove from Google Calendar
                </button>
              </div>
            ))}
        </details>
      )}
    </section>
  );
}

export function AssessmentCalendar({
  assessment: a,
}: {
  assessment: Assessment;
}) {
  const { data: d, run } = useStudy(),
    g = useGoogleCalendar();
  const [source, setSource] = useState(a.dateConfirmation?.source || "");
  const m = d.calendarMappings.find(
    (m) =>
      m.assessmentId === a.id &&
      m.calendarId === d.settings.googleCalendar.calendarId,
  );
  const eligible = calendarEligible(d, a),
    verified = datesConfirmed(a);
  return (
    <details className="assessment-calendar">
      <summary>
        Google Calendar:{" "}
        {g.busy && m?.status === "pending"
          ? "Syncing"
          : calendarStatus(d, a, g.ready)}
      </summary>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={eligible}
          onChange={(e) =>
            void run((d) => {
              d.assessments.find((x) => x.id === a.id)!.calendarEligible =
                e.target.checked;
            })
          }
        />
        Important academic deadline eligible for Calendar
      </label>
      <p>
        {verified
          ? "Current dates confirmed from an official source."
          : "Current dates need official verification before Calendar sync."}
      </p>
      {!verified && (
        <>
          <label>
            Official date source/reference
            <input
              maxLength={2000}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="VULMS announcement title and date"
            />
          </label>
          <button
            disabled={!source.trim() || a.deadline.kind === "none"}
            onClick={() =>
              void run((d) => {
                const current = d.assessments.find((x) => x.id === a.id)!;
                current.dateConfirmation = {
                  source: source.trim(),
                  signature: dateSignature(current),
                  at: new Date().toISOString(),
                };
              }, "Official dates confirmed")
            }
          >
            Confirm these dates from official VU information
          </button>
        </>
      )}
      <div className="button-row">
        <button
          disabled={!g.ready || g.busy || !eligible || !verified}
          onClick={() => void g.sync([a.id])}
        >
          {m && m.status !== "removed"
            ? "Update Google Calendar"
            : "Sync to Google Calendar"}
        </button>
        {m && m.status !== "removed" && (
          <>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={googleEventUrl(m.calendarId, m.eventId)}
            >
              Open in Google Calendar
            </a>
            <button
              disabled={!g.connected || g.busy}
              onClick={() => {
                if (
                  confirm(
                    "Remove this Google Calendar event? Study Desk assessment data will remain. Automatic recreation will be disabled.",
                  )
                )
                  void g.remove(m.calendarId, m.eventId);
              }}
            >
              Remove from Google Calendar
            </button>
          </>
        )}
      </div>
      {m?.lastSyncedAt && (
        <p>Last synced: {formatInstant(m.lastSyncedAt, d.settings.timezone)}</p>
      )}
      {m?.lastError && <p className="error">{m.lastError}</p>}
      {!g.ready && (
        <a href="#/settings">Connect and select Google Calendar in Settings</a>
      )}
      {g.busy && (
        <p role="status">
          Waiting for Google or saving Calendar status. Use Chrome or Edge for
          Google sign-in. You can disconnect to cancel.
        </p>
      )}
      {g.message && <p role="status">{g.message}</p>}
    </details>
  );
}
