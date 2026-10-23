import type { Dataset } from "../domain/model";
import {
  calendarEligible,
  calendarEvent,
  calendarSource,
  datesConfirmed,
} from "../domain/calendar";
import type { CalendarGateway } from "../integrations/google-calendar";
export type CalendarStore = {
  read(): Dataset;
  save(mutate: (d: Dataset) => void): Promise<boolean>;
};
export async function eventId(
  assessmentId: string,
  calendarId: string,
  generation: number,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([assessmentId, calendarId, generation]),
    ),
  );
  return (
    "sd" +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function syncAssessment(
  store: CalendarStore,
  api: CalendarGateway,
  assessmentId: string,
  automatic = false,
) {
  const d = store.read(),
    calendarId = d.settings.googleCalendar.calendarId;
  const a = d.assessments.find((a) => a.id === assessmentId);
  if (!calendarId || !a || !datesConfirmed(a) || !calendarEligible(d, a))
    throw new Error(
      "Select a calendar and confirm eligible assessment dates first.",
    );
  const prior = d.calendarMappings.find(
    (m) => m.calendarId === calendarId && m.assessmentId === a.id,
  );
  if (automatic && prior?.suppressed) return false;
  if (!prior && ["cancelled", "completed", "submitted"].includes(a.status))
    return false;
  const body = calendarEvent(d, a),
    hash = calendarSource(d, a);
  if (automatic && prior?.status === "synced" && prior.sourceHash === hash)
    return false;
  const generation =
    (prior?.generation || 0) + (prior?.status === "removed" ? 1 : 0);
  const id =
    prior && prior.status !== "removed"
      ? prior.eventId
      : await eventId(a.id, calendarId, generation);
  // Reserve the deterministic mapping durably before any network mutation.
  // A lost response or failed post-sync save can retry exactly the same event ID.
  if (
    !(await store.save((next) => {
      const current = next.assessments.find((x) => x.id === a.id);
      if (
        !current ||
        next.settings.googleCalendar.calendarId !== calendarId ||
        !datesConfirmed(current) ||
        calendarSource(next, current) !== hash
      )
        throw new Error("Assessment changed before sync. Retry.");
      next.calendarMappings = next.calendarMappings.filter(
        (m) => !(m.calendarId === calendarId && m.assessmentId === a.id),
      );
      next.calendarMappings.push({
        ...prior,
        provider: "google-calendar",
        assessmentId: a.id,
        calendarId,
        eventId: id,
        generation,
        status: "pending",
        suppressed: false,
        lastError: undefined,
      });
    }))
  )
    throw new Error(
      "Could not reserve Calendar mapping. No external write was attempted.",
    );
  try {
    await api.upsert(calendarId, id, body);
    if (
      !(await store.save((next) => {
        const m = next.calendarMappings.find(
          (m) =>
            m.calendarId === calendarId &&
            m.assessmentId === a.id &&
            m.eventId === id,
        );
        if (!m) throw new Error("Mapping changed. Reload and retry.");
        Object.assign(m, {
          status: "synced",
          sourceHash: hash,
          lastSyncedAt: new Date().toISOString(),
          lastError: undefined,
        });
      }))
    )
      throw new Error(
        "Google may be updated, but saving sync status failed. Reload and retry; the same event ID is retained.",
      );
    return true;
  } catch (e) {
    // Never persist raw provider responses, OAuth errors, or tokens.
    await store.save((next) => {
      const m = next.calendarMappings.find(
        (m) => m.calendarId === calendarId && m.eventId === id,
      );
      if (m) {
        m.status = "failed";
        m.lastError =
          "Calendar sync failed. Study Desk data is safe. Retry sync.";
      }
    });
    throw e;
  }
}
export async function removeCalendarEvent(
  store: CalendarStore,
  api: CalendarGateway,
  calendarId: string,
  id: string,
) {
  const m = store
    .read()
    .calendarMappings.find(
      (m) => m.calendarId === calendarId && m.eventId === id,
    );
  if (!m) throw new Error("Mapping missing");
  // Persist suppression first, so automatic sync cannot recreate a removed event.
  if (
    !(await store.save((d) => {
      const row = d.calendarMappings.find(
        (x) => x.calendarId === calendarId && x.eventId === id,
      )!;
      row.suppressed = true;
    }))
  )
    throw new Error("Could not save removal intent. No event was deleted.");
  await api.remove(calendarId, id, m.assessmentId);
  if (
    !(await store.save((d) => {
      const row = d.calendarMappings.find(
        (x) => x.calendarId === calendarId && x.eventId === id,
      );
      if (row) {
        row.status = "removed";
        row.lastError = undefined;
      }
    }))
  )
    throw new Error(
      "Event removed; saving status failed. Reload and retry removal.",
    );
}
