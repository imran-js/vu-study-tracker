import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import "fake-indexeddb/auto";
import {
  initialData,
  stamp,
  validateData,
  type Assessment,
  type Dataset,
} from "./model";
import {
  calendarEvent,
  calendarStatus,
  dateSignature,
  datesConfirmed,
} from "./calendar";
import { studyAlerts, acknowledgeAlert } from "./alerts";
import {
  syncAssessment,
  removeCalendarEvent,
  type CalendarStore,
} from "../app/calendar-sync";
import {
  GoogleCalendarClient,
  CalendarApiError,
  type CalendarGateway,
} from "../integrations/google-calendar";
import { exportBackup, parseBackup } from "../features/backup/backup";
import { migrateData } from "../data/migrations";
import { recommendDay, saveDayPlan, rankCourses } from "./planner";
import { commit } from "../app/actions";
import { IndexedDbRepository } from "../data/indexeddb";
import { SupabaseRepository } from "../data/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
const now = "2026-10-23T10:00:00Z";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  let d = initialData();
  d.courses.push({
    ...stamp(),
    semesterId: d.settings.activeSemesterId,
    code: "TEST",
    title: "Synthetic",
    notes: "",
    folderUrl: "",
    priority: "normal",
  });
  const a: Assessment = {
    ...stamp(),
    courseId: d.courses[0].id,
    typeId: d.types[1].id,
    title: "Synthetic quiz",
    notes: "",
    sourceUrl: "",
    opensOn: "2026-11-03",
    deadline: { kind: "date", date: "2026-11-05" },
    status: "not started",
  };
  a.dateConfirmation = {
    signature: dateSignature(a),
    source: "Synthetic official source",
    at: now,
  };
  d.assessments.push(a);
  d.settings.googleCalendar.calendarId = "test-calendar";
  const store: CalendarStore = {
    read: () => d,
    save: async (mutate) => {
      const copy = structuredClone(d);
      mutate(copy);
      d = validateData(copy);
      return true;
    },
  };
  const events = new Map<string, unknown>();
  const api: CalendarGateway = {
    upsert: vi.fn(async (cal, id, body) => {
      events.set(`${cal}:${id}`, structuredClone(body));
    }),
    remove: vi.fn(async (cal, id) => {
      events.delete(`${cal}:${id}`);
    }),
  };
  return { store, api, a, events };
}
describe("one-way Calendar application flow", () => {
  it("creates one event and updates the same ID on a later revision", async () => {
    const f = fixture();
    await syncAssessment(f.store, f.api, f.a.id);
    const first = f.store.read().calendarMappings[0];
    await f.store.save((d) => {
      d.assessments[0].title = "Changed title";
    });
    expect(calendarStatus(f.store.read(), f.store.read().assessments[0])).toBe(
      "Update available",
    );
    await syncAssessment(f.store, f.api, f.a.id);
    expect(f.events.size).toBe(1);
    expect(f.store.read().calendarMappings[0].eventId).toBe(first.eventId);
    expect(f.store.read().calendarMappings[0].status).toBe("synced");
  });
  it("uses inclusive academic ranges with exclusive Google end dates", () => {
    const f = fixture(),
      body = calendarEvent(f.store.read(), f.a);
    expect(body.start).toEqual({ date: "2026-11-03" });
    expect(body.end).toEqual({ date: "2026-11-06" });
  });
  it("preserves exact instants and source timezone with an explicitly described point marker", () => {
    const f = fixture();
    f.a.deadline = {
      kind: "timed",
      at: "2026-11-05T18:59:00Z",
      zone: "Asia/Karachi",
    };
    delete f.a.opensOn;
    f.a.dateConfirmation!.signature = dateSignature(f.a);
    const body = calendarEvent(f.store.read(), f.a);
    expect(body.start).toEqual({
      dateTime: "2026-11-05T18:59:00Z",
      timeZone: "Asia/Karachi",
    });
    expect(body.end).toEqual({
      dateTime: "2026-11-05T19:00:00Z",
      timeZone: "Asia/Karachi",
    });
    expect(body.description).toContain("one-minute calendar marker");
  });
  it("does not sync unverified dates or stale confirmations", async () => {
    const f = fixture();
    delete f.a.dateConfirmation;
    await expect(syncAssessment(f.store, f.api, f.a.id, true)).rejects.toThrow(
      /confirm/,
    );
    expect(f.api.upsert).not.toHaveBeenCalled();
  });
  it("keeps unknown coverage explicit and omits provisional syllabus", () => {
    const f = fixture();
    expect(calendarEvent(f.store.read(), f.a).description).toContain(
      "Awaiting official VU announcement",
    );
    expect(calendarEvent(f.store.read(), f.a).description).not.toContain(
      "Topics 1",
    );
  });
  it("keeps academic changes after provider failure and retries reserved identity", async () => {
    const f = fixture();
    await f.store.save((d) => {
      d.assessments[0].notes = "Saved academic change";
    });
    vi.mocked(f.api.upsert).mockRejectedValueOnce(new Error("network"));
    await expect(syncAssessment(f.store, f.api, f.a.id)).rejects.toThrow(
      "network",
    );
    const id = f.store.read().calendarMappings[0].eventId;
    expect(f.store.read().assessments[0].notes).toBe("Saved academic change");
    expect(f.store.read().calendarMappings[0].status).toBe("failed");
    await syncAssessment(f.store, f.api, f.a.id);
    expect(f.store.read().calendarMappings[0].eventId).toBe(id);
  });
  it("does not write remotely when mapping reservation fails", async () => {
    const f = fixture();
    f.store.save = async () => false;
    await expect(syncAssessment(f.store, f.api, f.a.id)).rejects.toThrow(
      "reserve",
    );
    expect(f.api.upsert).not.toHaveBeenCalled();
  });
  it("retries the same event after a response is lost", async () => {
    const f = fixture();
    const real = f.api.upsert;
    f.api.upsert = vi.fn(
      async (...args: Parameters<CalendarGateway["upsert"]>) => {
        await real(...args);
        throw new Error("lost response");
      },
    );
    await expect(syncAssessment(f.store, f.api, f.a.id)).rejects.toThrow();
    f.api.upsert = real;
    await syncAssessment(f.store, f.api, f.a.id);
    expect(f.events.size).toBe(1);
  });
  it("never imports externally changed academic content", async () => {
    const f = fixture();
    await syncAssessment(f.store, f.api, f.a.id);
    const academic = structuredClone(f.store.read().assessments);
    f.events.set([...f.events.keys()][0], {
      summary: "External edit",
      start: { date: "2099-01-01" },
    });
    await syncAssessment(f.store, f.api, f.a.id);
    expect(f.store.read().assessments).toEqual(academic);
    expect([...f.events.values()][0]).toMatchObject({
      summary: "TEST – Synthetic quiz",
    });
  });
  it("marks cancellation without deletion and clears reminders", async () => {
    const f = fixture();
    await syncAssessment(f.store, f.api, f.a.id);
    await f.store.save((d) => {
      d.assessments[0].status = "cancelled";
    });
    await syncAssessment(f.store, f.api, f.a.id, true);
    expect(f.events.size).toBe(1);
    expect([...f.events.values()][0]).toMatchObject({
      summary: "Cancelled · TEST – Synthetic quiz",
      reminders: { overrides: [] },
    });
    expect(f.api.remove).not.toHaveBeenCalled();
  });
  it("explicit removal suppresses auto recreation but manual resync uses a new identity", async () => {
    const f = fixture();
    await syncAssessment(f.store, f.api, f.a.id);
    const m = f.store.read().calendarMappings[0];
    await removeCalendarEvent(f.store, f.api, m.calendarId, m.eventId);
    expect(f.events.size).toBe(0);
    await syncAssessment(f.store, f.api, f.a.id, true);
    expect(f.events.size).toBe(0);
    await syncAssessment(f.store, f.api, f.a.id);
    expect(f.events.size).toBe(1);
    expect(f.store.read().calendarMappings[0].eventId).not.toBe(m.eventId);
  });
  it("round-trips mapping, reminder configuration and receipts through backups", async () => {
    const f = fixture();
    await f.store.save((d) => {
      d.settings.googleCalendar.reminders = [1440, 120];
      d.settings.googleCalendar.openingReminder = true;
    });
    await syncAssessment(f.store, f.api, f.a.id);
    expect(parseBackup(exportBackup(f.store.read()))).toEqual(f.store.read());
    expect(
      calendarEvent(f.store.read(), f.a).reminders.overrides.map(
        (r) => r.minutes,
      ),
    ).toEqual([1440, 120, 0]);
  });
  it("migrates schema 3 records and locked history without loss", () => {
    const f = fixture(),
      d = f.store.read();
    saveDayPlan(
      d,
      d.settings.activeSemesterId,
      "2026-10-23",
      recommendDay(d, d.settings.activeSemesterId, "2026-10-23").items,
      "locked",
      true,
    );
    const old = JSON.parse(JSON.stringify(d));
    old.schemaVersion = 3;
    delete old.calendarMappings;
    delete old.alertReceipts;
    delete old.settings.googleCalendar;
    const next = migrateData(old);
    expect(next.schemaVersion).toBe(4);
    expect(next.assessments).toEqual(d.assessments);
    expect(next.dailyPlans).toEqual(d.dailyPlans);
    expect(old.schemaVersion).toBe(3);
    expect(next.settings.googleCalendar.automatic).toBe(false);
  });
  it("persists Calendar data in browser mode and preserves locked Today through sync and urgent changes", async () => {
    const f = fixture(),
      d = f.store.read(),
      semester = d.settings.activeSemesterId;
    d.courses.push({
      ...stamp(),
      semesterId: semester,
      code: "OTHER",
      title: "Synthetic",
      notes: "",
      folderUrl: "",
      priority: "low",
    });
    saveDayPlan(
      d,
      semester,
      "2026-10-23",
      recommendDay(d, semester, "2026-10-23").items,
      "",
      true,
    );
    const locked = structuredClone(d.dailyPlans);
    const repo = new IndexedDbRepository(crypto.randomUUID());
    let snapshot = await repo.replace(d, 0);
    const store: CalendarStore = {
      read: () => snapshot.data,
      save: async (mutate) => {
        snapshot = await commit(repo, snapshot, mutate);
        return true;
      },
    };
    const before = rankCourses(snapshot.data, semester, "2026-10-24").find(
      (r) => r.course.id === d.courses[1].id,
    )!.score;
    await store.save((d) => {
      const a = {
        ...d.assessments[0],
        ...stamp(),
        courseId: d.courses[1].id,
        opensOn: undefined,
        deadline: { kind: "date" as const, date: "2026-10-24" },
      };
      a.dateConfirmation = {
        signature: dateSignature(a),
        source: "Official test",
        at: now,
      };
      d.assessments.push(a);
    });
    await syncAssessment(store, f.api, snapshot.data.assessments[1].id);
    studyAlerts(snapshot.data, semester);
    expect(snapshot.data.dailyPlans).toEqual(locked);
    expect(
      rankCourses(snapshot.data, semester, "2026-10-24").find(
        (r) => r.course.id === d.courses[1].id,
      )!.score,
    ).toBeGreaterThan(before);
    expect((await repo.load())!.data.calendarMappings).toEqual(
      snapshot.data.calendarMappings,
    );
  });
  it("uses the existing owner-scoped Supabase RPC for mappings and reload", async () => {
    const f = fixture();
    await syncAssessment(f.store, f.api, f.a.id);
    const d = f.store.read();
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const single = vi
      .fn()
      .mockResolvedValue({ data: { data: d, revision: 2 }, error: null });
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
      },
      rpc,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: single }) }) }),
    } as unknown as SupabaseClient;
    const repo = new SupabaseRepository(client, "owner");
    await repo.replace(d, 1);
    expect((await repo.load())!.data).toEqual(d);
    expect(rpc.mock.calls[0][1].payload.calendarMappings).toEqual(
      d.calendarMappings,
    );
  });
  it("strips unexpected token fields on validation and rejects malformed mappings", () => {
    const f = fixture(),
      raw = JSON.parse(JSON.stringify(f.store.read()));
    raw.settings.googleCalendar.access_token = "synthetic-token";
    raw.oauthToken = "synthetic-token";
    expect(exportBackup(validateData(raw))).not.toContain("synthetic-token");
    raw.calendarMappings = [{ provider: "google-calendar" }];
    expect(() => validateData(raw)).toThrow();
  });
});
describe("attention center", () => {
  function alertFixture(date = "2026-10-28") {
    const f = fixture();
    delete f.a.opensOn;
    f.a.deadline = { kind: "date", date };
    return f;
  }
  it("consolidates assessment signals into one alert", () => {
    const f = alertFixture();
    expect(
      studyAlerts(f.store.read(), f.store.read().settings.activeSemesterId),
    ).toHaveLength(1);
  });
  it("keeps dismissal through countdown but resurfaces a material date change", () => {
    const f = alertFixture(),
      d = f.store.read(),
      semester = d.settings.activeSemesterId;
    const a = studyAlerts(d, semester)[0];
    acknowledgeAlert(d, a, "dismissed");
    expect(
      studyAlerts(d, semester, Temporal.Instant.from("2026-10-24T10:00:00Z"))[0]
        .state,
    ).toBe("dismissed");
    d.assessments[0].deadline = { kind: "date", date: "2026-10-23" };
    expect(studyAlerts(d, semester)[0].state).toBeUndefined();
  });
  it("ranks closing-today above an assessment within seven days", () => {
    const f = alertFixture();
    f.a.dateConfirmation = undefined;
    const d = f.store.read();
    d.assessments.push({
      ...f.a,
      ...stamp(),
      title: "Closes today",
      deadline: { kind: "date", date: "2026-10-23" },
    });
    const alerts = studyAlerts(d, d.settings.activeSemesterId);
    expect(alerts[0].level).toBe("Critical");
    expect(alerts[1].level).toBe("Informational");
  });
  it("shows an opening within seven days without fake readiness", () => {
    const f = fixture();
    f.a.opensOn = "2026-10-27";
    const alerts = studyAlerts(
      f.store.read(),
      f.store.read().settings.activeSemesterId,
    );
    expect(alerts[0].title).toContain("opens in 4 days");
    expect(alerts[0].reason).toContain("Awaiting official VU announcement");
    expect(alerts[0].reason).not.toContain("Readiness:");
  });
  it("uses actual closing time for a timed assessment and filters completed work", () => {
    const f = fixture();
    delete f.a.opensOn;
    f.a.deadline = {
      kind: "timed",
      at: "2026-10-22T10:00:00Z",
      zone: "Asia/Riyadh",
    };
    f.a.endsAt = "2026-10-23T20:00:00Z";
    const d = f.store.read();
    expect(studyAlerts(d, d.settings.activeSemesterId)[0].title).toContain(
      "closing today",
    );
    f.a.status = "completed";
    expect(studyAlerts(d, d.settings.activeSemesterId)).toHaveLength(0);
  });
  it("isolates semester alerts and persists read receipts", () => {
    const f = alertFixture(),
      d = f.store.read();
    const a = studyAlerts(d, d.settings.activeSemesterId)[0];
    acknowledgeAlert(d, a, "read");
    expect(studyAlerts(d, "unrelated")).toHaveLength(0);
    expect(
      studyAlerts(parseBackup(exportBackup(d)), d.settings.activeSemesterId)[0]
        .state,
    ).toBe("read");
  });
});
describe("Google adapter safety", () => {
  it("requests only Calendar scopes and adds creation scope only on explicit creation", async () => {
    const requested: string[] = [];
    const oauth = {
      initTokenClient: (options: {
        scope: string;
        callback: (r: unknown) => void;
      }) => {
        requested.push(options.scope);
        return {
          requestAccessToken: () =>
            options.callback({
              access_token: "synthetic-token",
              expires_in: 3600,
            }),
        };
      },
      hasGrantedAllScopes: () => true,
      revoke: vi.fn(),
    };
    vi.stubGlobal("window", { google: { accounts: { oauth2: oauth } } });
    const api = new GoogleCalendarClient();
    await api.connect("synthetic-client");
    expect(requested[0].split(" ")).toEqual([
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events.owned",
    ]);
    await api.connect("synthetic-client", true);
    expect(requested[1]).toContain("calendar.app.created");
    expect(requested.join(" ")).not.toMatch(/gmail|drive|contacts/);
    api.disconnect();
    expect(oauth.revoke).toHaveBeenCalledOnce();
  });
  it("can cancel pending OAuth and ignores a late authorization callback", async () => {
    let callback: ((r: unknown) => void) | undefined;
    vi.stubGlobal("window", {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (options: { callback: (r: unknown) => void }) => {
              callback = options.callback;
              return { requestAccessToken: () => {} };
            },
            hasGrantedAllScopes: () => true,
          },
        },
      },
    });
    const api = new GoogleCalendarClient();
    const pending = api.connect("synthetic-client");
    const rejected = expect(pending).rejects.toThrow("cancelled");
    await Promise.resolve();
    api.disconnect(false);
    await rejected;
    callback?.({ access_token: "late-token", expires_in: 3600 });
    expect(api.connected).toBe(false);
  });
  it("date verification survives equivalent timestamp serialization", () => {
    const f = fixture();
    delete f.a.opensOn;
    f.a.deadline = {
      kind: "timed",
      at: "2026-11-05T10:00:00.000Z",
      zone: "Asia/Riyadh",
    };
    f.a.dateConfirmation!.signature = dateSignature(f.a);
    f.a.deadline.at = "2026-11-05T10:00:00Z";
    expect(datesConfirmed(f.a)).toBe(true);
    f.a.deadline.at = "2026-11-05T11:00:00Z";
    expect(datesConfirmed(f.a)).toBe(false);
  });
  function connected() {
    const api = new GoogleCalendarClient();
    Object.assign(api, {
      token: "synthetic-access-token",
      expiry: Date.now() + 3600000,
    });
    return api;
  }
  it("updates an existing owned mapping without insert", async () => {
    const f = fixture(),
      body = calendarEvent(f.store.read(), f.a),
      api = connected();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "abcde",
            extendedProperties: body.extendedProperties,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api.upsert("calendar", "abcde", body);
    expect(fetch.mock.calls.map((c) => c[1].method)).toEqual(["GET", "PATCH"]);
  });
  it("inserts with explicit identity and recovers a collision by updating same event", async () => {
    const f = fixture(),
      body = calendarEvent(f.store.read(), f.a),
      api = connected();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "abcde",
            extendedProperties: body.extendedProperties,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api.upsert("calendar", "abcde", body);
    expect(JSON.parse(fetch.mock.calls[1][1].body).id).toBe("abcde");
    expect(fetch.mock.calls[3][1].method).toBe("PATCH");
  });
  it("refuses to overwrite an unrelated Google event", async () => {
    const f = fixture(),
      api = connected();
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "abcde" })));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api.upsert("calendar", "abcde", calendarEvent(f.store.read(), f.a)),
    ).rejects.toThrow("matching");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("disconnect clears authorization without deleting events or study records", async () => {
    const f = fixture(),
      before = structuredClone(f.store.read()),
      api = connected();
    vi.stubGlobal("window", {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    api.disconnect();
    expect(api.connected).toBe(false);
    expect(f.store.read()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      api.upsert("calendar", "abcde", calendarEvent(before, f.a)),
    ).rejects.toBeInstanceOf(CalendarApiError);
  });
});
