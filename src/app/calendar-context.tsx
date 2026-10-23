import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStudy } from "./context";
import {
  calendarEligible,
  calendarSource,
  datesConfirmed,
} from "../domain/calendar";
import {
  GoogleCalendarClient,
  type GoogleCalendar,
} from "../integrations/google-calendar";
import { syncAssessment, removeCalendarEvent } from "./calendar-sync";

const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
export const calendarClientId = env.VITE_GOOGLE_CALENDAR_CLIENT_ID || "";
type CalendarContextValue = {
  connected: boolean;
  ready: boolean;
  busy: boolean;
  message: string;
  calendars: GoogleCalendar[];
  connect(): Promise<void>;
  create(name: string): Promise<void>;
  disconnect(): Promise<void>;
  select(id: string): Promise<void>;
  sync(ids?: string[], automatic?: boolean): Promise<void>;
  remove(calendarId: string, eventId: string): Promise<void>;
};
const CalendarContext = createContext<CalendarContextValue | undefined>(
  undefined,
);
export function useGoogleCalendar() {
  const value = useContext(CalendarContext);
  if (!value) throw new Error("Calendar provider missing");
  return value;
}
export function GoogleCalendarProvider({ children }: { children: ReactNode }) {
  const { data, run, getData, semesterId } = useStudy();
  const [api] = useState(() => new GoogleCalendarClient());
  const [connected, setConnected] = useState(false),
    [approved, setApproved] = useState("");
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = useRef(false),
    attempted = useRef(new Set<string>()),
    alive = useRef(true);
  const store = {
    read: getData,
    save: (mutate: Parameters<typeof run>[0]) =>
      run(mutate, "Calendar status saved"),
  };
  const ready =
    connected &&
    !!approved &&
    approved === data.settings.googleCalendar.calendarId;
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => {
      if (!api.connected) {
        setConnected(false);
        setApproved("");
      }
    }, 10000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      api.disconnect(false);
    };
  }, [api]);
  async function task(work: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Calendar action failed. Study Desk data is safe.",
        );
    } finally {
      active.current = false;
      if (alive.current) {
        setBusy(false);
        setConnected(api.connected);
      }
    }
  }
  async function connect() {
    await task(async () => {
      await api.connect(calendarClientId);
      setApproved("");
      attempted.current.clear();
      const list = await api.calendars();
      setCalendars(list);
      setMessage(
        "Connected. Select and confirm a calendar for this session before syncing.",
      );
    });
  }
  async function select(id: string) {
    if (!api.connected || !calendars.some((c) => c.id === id)) return;
    if (
      await run((d) => {
        if (d.settings.googleCalendar.calendarId !== id)
          d.settings.googleCalendar.automatic = false;
        d.settings.googleCalendar.calendarId = id;
        d.settings.googleCalendar.calendarName = calendars.find(
          (c) => c.id === id,
        )!.summary;
      }, "Calendar selected")
    ) {
      setApproved(id);
      attempted.current.clear();
    }
  }
  async function create(name: string) {
    await task(async () => {
      if (!name.trim()) throw new Error("Enter a calendar name.");
      // Request the extra scope only for the explicit calendar-creation action.
      await api.connect(calendarClientId, true);
      setApproved("");
      const matches = (await api.calendars()).filter(
        (c) => c.summary === name.trim(),
      );
      if (matches.length) {
        setCalendars(await api.calendars());
        throw new Error(
          "A calendar with that name exists. Select it or use another name; no duplicate was created.",
        );
      }
      const created = await api.createCalendar(
        name.trim(),
        getData().settings.timezone,
      );
      setCalendars(await api.calendars());
      if (
        await run((d) => {
          d.settings.googleCalendar.automatic = false;
          d.settings.googleCalendar.calendarId = created.id;
          d.settings.googleCalendar.calendarName = created.summary;
        }, "Calendar created and selected")
      )
        setApproved(created.id);
      setMessage(
        "Dedicated calendar created. No study events have been added yet.",
      );
    });
  }
  async function disconnect() {
    api.disconnect();
    setConnected(false);
    setApproved("");
    setCalendars([]);
    attempted.current.clear();
    await run((d) => {
      d.settings.googleCalendar.automatic = false;
    }, "Calendar disconnected. Existing Google events and study records are preserved.");
  }
  async function sync(ids?: string[], automatic = false) {
    await task(async () => {
      if (
        !api.connected ||
        approved !== getData().settings.googleCalendar.calendarId
      )
        throw new Error("Connect and confirm the selected calendar first.");
      const d = getData();
      const selected =
        ids ||
        d.assessments
          .filter(
            (a) =>
              d.courses.some(
                (c) => c.id === a.courseId && c.semesterId === semesterId,
              ) &&
              calendarEligible(d, a) &&
              datesConfirmed(a) &&
              !d.calendarMappings.some(
                (m) =>
                  m.assessmentId === a.id &&
                  m.calendarId === approved &&
                  m.suppressed,
              ),
          )
          .map((a) => a.id);
      let success = 0,
        failed = 0,
        skipped = 0;
      let firstError = "";
      for (const id of selected) {
        if (!api.connected || !alive.current) break;
        const a = getData().assessments.find((a) => a.id === id);
        if (!a) continue;
        const key = `${approved}:${id}:${datesConfirmed(a) ? calendarSource(getData(), a) : "unverified"}`;
        if (automatic && attempted.current.has(key)) {
          skipped++;
          continue;
        }
        attempted.current.add(key);
        try {
          if (await syncAssessment(store, api, id, automatic)) success++;
          else skipped++;
        } catch (error) {
          firstError ||=
            error instanceof Error ? error.message : "Calendar sync failed.";
          failed++;
        }
      }
      setMessage(
        `${firstError ? firstError + " " : ""}${success} synced · ${failed} failed · ${skipped} unchanged/skipped.${failed ? " Study Desk data is safe. Check assessment status and retry sync." : ""}`,
      );
    });
  }
  async function remove(calendarId: string, eventId: string) {
    await task(async () => {
      if (!api.connected || !calendars.some((c) => c.id === calendarId))
        throw new Error(
          "Connect the Google account that owns this calendar first.",
        );
      await removeCalendarEvent(store, api, calendarId, eventId);
      setMessage(
        "Google event removed. Automatic recreation is disabled; Study Desk records are preserved.",
      );
    });
  }
  useEffect(() => {
    if (!ready || busy || !data.settings.googleCalendar.automatic) return;
    const pending = data.assessments.some(
      (a) =>
        data.courses.some(
          (c) => c.id === a.courseId && c.semesterId === semesterId,
        ) &&
        calendarEligible(data, a) &&
        datesConfirmed(a) &&
        !data.calendarMappings.some(
          (m) =>
            m.assessmentId === a.id &&
            m.calendarId === approved &&
            m.suppressed,
        ) &&
        !attempted.current.has(
          `${approved}:${a.id}:${calendarSource(data, a)}`,
        ),
    );
    if (!pending) return;
    const timer = setTimeout(() => {
      void sync(undefined, true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [data, ready, busy, semesterId]);
  return (
    <CalendarContext.Provider
      value={{
        connected,
        ready,
        busy,
        message,
        calendars,
        connect,
        create,
        disconnect,
        select,
        sync,
        remove,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}
