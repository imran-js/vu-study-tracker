import { AppearanceSettings } from "../../app/appearance";
import { GoogleCalendarSettings } from "../calendar/GoogleCalendar";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Download,
  Upload,
  Plus,
  Archive,
  Pencil,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useStudy } from "../../app/context";
import { PageHeading, Modal, Pill } from "../../shared/ui";
import { exportBackup, parseBackup } from "../backup/backup";
import type { Dataset } from "../../domain/model";
import { PlannerSettings } from "../planner/Planner";
export function downloadBackup(data: Dataset, prefix = "study-desk-backup") {
  const url = URL.createObjectURL(
    new Blob([exportBackup(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Settings() {
  const { data: d, run, edit, saveError, cloud } = useStudy();
  const [timezone, setTimezone] = useState(d.settings.timezone);
  const [weekStart, setWeekStart] = useState(d.settings.weekStart);
  const [target, setTarget] = useState(
    d.settings.weeklyTarget?.toString() || "",
  );
  const [backup, setBackup] = useState<Dataset>();
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [exportedRecovery, setExportedRecovery] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimezone(d.settings.timezone);
    setWeekStart(d.settings.weekStart);
    setTarget(d.settings.weeklyTarget?.toString() || "");
  }, [d.settings.timezone, d.settings.weekStart, d.settings.weeklyTarget]);
  async function exportData() {
    downloadBackup(d);
    await run((d) => {
      d.settings.lastExportAt = new Date().toISOString();
    }, "Backup download requested. Keep the file somewhere private.");
  }
  async function loadFile(selected?: File) {
    if (!selected) return;
    setError("");
    try {
      if (selected.size > 25_000_000)
        throw new Error("Backup exceeds the 25 MB import limit.");
      const incoming = parseBackup(await selected.text());
      setBackup(incoming);
      setConfirmed(false);
      setExportedRecovery(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid backup");
    }
    if (file.current) file.current.value = "";
  }
  async function settings(e: FormEvent) {
    e.preventDefault();
    await run((d) => {
      d.settings.timezone = timezone.trim();
      d.settings.weekStart = weekStart;
      d.settings.weeklyTarget = target ? Number(target) : undefined;
    }, "Preferences saved");
  }
  return (
    <>
      <PageHeading eyebrow="MAKE IT YOURS" title="Settings & Data">
        Your semesters, preferences, and a safe copy of your work.
      </PageHeading>
      <AppearanceSettings />
      <div className="settings-grid">
        <PlannerSettings key={JSON.stringify(d.settings.planner)} />
        <section className="panel">
          <div className="section-heading">
            <h2>Study preferences</h2>
          </div>
          <form onSubmit={settings} className="stack-form">
            <label>
              Display timezone
              <input
                value={timezone}
                required
                onChange={(e) => setTimezone(e.target.value)}
                list="timezones"
              />
              <datalist id="timezones">
                <option>Asia/Riyadh</option>
                <option>Asia/Karachi</option>
                <option>UTC</option>
                <option>Europe/London</option>
                <option>America/New_York</option>
              </datalist>
              <small>
                Use an IANA timezone. Timed deadlines keep their actual instant;
                date-only entries keep their date.
              </small>
            </label>
            <label>
              Week starts on
              <select
                value={weekStart}
                onChange={(e) => setWeekStart(Number(e.target.value) as 1 | 7)}
              >
                <option value={1}>Monday</option>
                <option value={7}>Sunday</option>
              </select>
            </label>
            <label>
              Weekly study target (minutes)
              <input
                type="number"
                min={1}
                max={10080}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <small>Optional. Leave blank to track without a target.</small>
            </label>
            <button className="primary">Save preferences</button>
          </form>
        </section>
        <GoogleCalendarSettings />
        <section className="panel">
          <div className="section-heading">
            <h2>Backups & restore</h2>
            <ShieldCheck size={21} />
          </div>
          <p>
            All semesters, including archived history, are included. Backups
            contain Drive links and metadata,{" "}
            <strong>not the actual Drive documents</strong>.
          </p>
          <p className="muted">
            Last export requested:{" "}
            {d.settings.lastExportAt
              ? new Date(d.settings.lastExportAt).toLocaleString("en", {
                  timeZone: d.settings.timezone,
                })
              : "Never"}
            . Check your browser’s downloads to confirm the file was saved.
          </p>
          <div className="backup-actions">
            <button className="primary" onClick={() => void exportData()}>
              <Download size={17} />
              Export all records
            </button>
            <button onClick={() => file.current?.click()}>
              <Upload size={17} />
              Restore from file
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Select backup file"
              onChange={(e) => void loadFile(e.target.files?.[0])}
            />
          </div>
          <p className="form-note">
            Keep exports in a private folder outside the code repository.
            Restore replaces the complete dataset; merging is not supported.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Semesters & history</h2>
          <button onClick={() => edit({ kind: "semester" })}>
            <Plus size={16} />
            Add semester
          </button>
        </div>
        {d.semesters.map((s) => (
          <article className="settings-row" key={s.id}>
            <div className="grow">
              <h3>{s.name}</h3>
              <p className="meta">
                {d.courses.filter((c) => c.semesterId === s.id).length} courses
                {s.startDate ? ` · ${s.startDate}` : ""}
                {s.endDate ? ` to ${s.endDate}` : ""}
              </p>
            </div>
            <Pill>{s.archived ? "Archived" : "Open"}</Pill>
            <button
              className="small"
              onClick={() =>
                void run((d) => {
                  d.settings.activeSemesterId = s.id;
                }, "Semester selected")
              }
            >
              View
            </button>
            <button
              className="icon-button"
              aria-label={`Edit ${s.name}`}
              onClick={() => edit({ kind: "semester", id: s.id })}
            >
              <Pencil size={16} />
            </button>
            <button
              className="small"
              onClick={() =>
                void run(
                  (d) => {
                    const row = d.semesters.find((x) => x.id === s.id)!;
                    row.archived = !row.archived;
                    row.updatedAt = new Date().toISOString();
                  },
                  s.archived ? "Semester reopened" : "Semester archived",
                )
              }
            >
              {s.archived ? <RotateCcw size={14} /> : <Archive size={14} />}
              {s.archived ? "Reopen" : "Archive"}
            </button>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Assessment types</h2>
          <button onClick={() => edit({ kind: "type" })}>
            <Plus size={16} />
            Add type
          </button>
        </div>
        <div className="type-list">
          {d.types.map((t) => (
            <button key={t.id} onClick={() => edit({ kind: "type", id: t.id })}>
              {t.label}
              <Pencil size={14} />
            </button>
          ))}
        </div>
      </section>
      <section className="panel storage-explanation">
        <h2>Where everything lives</h2>
        <details>
          <summary>Hosting, code, and personal data</summary>
          <div className="explanation-grid">
            <div>
              <h3>Website hosting</h3>
              <p>
                GitHub Pages publishes the application code and assets so you
                can open the website.
              </p>
            </div>
            <div>
              <h3>Code backup</h3>
              <p>
                GitHub preserves code you commit and push. It does not save your
                personal study records.
              </p>
            </div>
            <div>
              <h3>Personal study data</h3>
              <p>
                {cloud
                  ? "Records are stored in your private Supabase account. Sign in with the same account on another device, then reload to get the latest records. Internet access is required to save. Conflicting saves are rejected; export your current view before reloading if needed."
                  : "Records live in IndexedDB in this browser. Devices, browser profiles, localhost ports, and the published origin have separate records. Clearing browser data can erase them."}
              </p>
            </div>
          </div>
        </details>
        <p>
          Export regularly. Publishing an update does not back up or synchronize
          records. Google Drive notes remain separate from study-data storage.
        </p>
        <p className="muted">
          Study Desk alerts appear inside the website. Connected Google Calendar
          provides external reminders; Study Desk does not send native push.
        </p>
        <button
          onClick={async () => {
            if (navigator.storage?.persist) {
              const granted = await navigator.storage.persist();
              alert(
                granted
                  ? "Persistent storage was granted. Continue keeping external backups."
                  : "Persistent storage was not granted. Continue keeping external backups.",
              );
            } else
              alert(
                "This browser does not support persistent-storage requests. Keep external backups.",
              );
          }}
        >
          Request persistent browser storage
        </button>
      </section>
      {backup && (
        <Modal
          title="Review backup before restoring"
          close={() => setBackup(undefined)}
        >
          <p className="form-note">
            This will replace all current records, including every semester.
            Drive files and their permissions are unaffected.
          </p>
          <ul className="restore-preview">
            {backup.semesters.map((s) => (
              <li key={s.id}>
                {s.name}
                {s.archived ? " (archived)" : ""}
              </li>
            ))}
          </ul>
          <p>
            {backup.courses.length} courses · {backup.lectures.length} lectures
            · {backup.assessments.length} assessments · {backup.sessions.length}{" "}
            sessions · {backup.resources.length} resources ·{" "}
            {backup.revisions.length} revisions · {backup.types.length}{" "}
            assessment types
          </p>
          {backup.timer && (
            <p className="notice">
              This backup includes an unfinished timer. Review it after
              restoration.
            </p>
          )}
          <button
            onClick={() => {
              downloadBackup(d, "study-desk-recovery");
              setExportedRecovery(true);
            }}
          >
            <Download size={16} />
            Download recovery backup
          </button>
          <p className="muted">
            {exportedRecovery
              ? "Recovery download requested. Verify the saved file before proceeding."
              : "A recovery export lets you return to your current records."}
          </p>
          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I understand that restoring replaces all current study records.
          </label>
          <footer className="dialog-footer">
            <button onClick={() => setBackup(undefined)}>Cancel</button>
            <button
              className="primary"
              disabled={!confirmed}
              onClick={async () => {
                if (
                  d.timer &&
                  !confirm(
                    "Restoring will replace the current unfinished timer too. Continue?",
                  )
                )
                  return;
                const ok = await run(
                  (current) => {
                    for (const key of Object.keys(current))
                      delete (current as unknown as Record<string, unknown>)[
                        key
                      ];
                    Object.assign(current, structuredClone(backup));
                  },
                  "Backup restored successfully",
                  { restore: true },
                );
                if (ok) setBackup(undefined);
              }}
            >
              Replace & restore
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
