import { GoogleCalendarProvider } from "./calendar-context";
import { ThemeControl } from "./appearance";
import { Notifications } from "../features/notifications/Notifications";
import { studyAlerts } from "../domain/alerts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCheck,
  ChevronDown,
  FileText,
  Home,
  Bell,
  Menu,
  Settings2,
  X,
  GraduationCap,
  CircleHelp,
} from "lucide-react";
import { ZodError } from "zod";
import { initialData, type Dataset } from "../domain/model";
import { IndexedDbRepository } from "../data/indexeddb";
import type { Snapshot, StudyRepository } from "../data/contracts";
import { commit } from "./actions";
import { StudyContext, type EditorRequest } from "./context";
import { Editor } from "./Editor";
import { Today } from "../features/today/Today";
import { Courses } from "../features/courses/Courses";
import { Assessments } from "../features/assessments/Assessments";
import { Calendar } from "../features/calendar/Calendar";
import { Progress } from "../features/progress/Progress";
import { Resources } from "../features/resources/Resources";
import { Settings } from "../features/settings/Settings";
import { Timer } from "../features/sessions/Sessions";
import { Modal } from "../shared/ui";
import { today } from "../domain/dates";
import { applyLocalCatalog } from "../data/local-catalog";
import { applyWeeklyBaseline } from "../domain/weekly-framework";
import { applyCs101Schedule } from "../domain/cs101-schedule";
import { freezeToday } from "../domain/planner";

const localRepository = new IndexedDbRepository();
const nav = [
  { id: "today", label: "Today", icon: Home },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "assessments", label: "Assessments", icon: CheckCheck },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "progress", label: "Progress", icon: ChartNoAxesCombined },
  { id: "resources", label: "Notes & Resources", icon: FileText },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "settings", label: "Settings & Data", icon: Settings2 },
];
function route() {
  const id = window.location.hash.slice(2).split("/")[0];
  return nav.some((n) => n.id === id) ? id : "today";
}
export default function App({
  repository = localRepository,
  cloud = false,
  accountId,
}: {
  repository?: StudyRepository;
  cloud?: boolean;
  accountId?: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const latest = useRef<Snapshot | undefined>(undefined);
  const saving = useRef(false);
  const [page, setPage] = useState(route);
  const [editor, setEditor] = useState<EditorRequest>();
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [loadingError, setLoadingError] = useState("");
  const [recovered, setRecovered] = useState(false);
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [, refreshClock] = useState(0);
  function closeNavigation() {
    setMenu(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  }
  useEffect(() => {
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [page]);
  useEffect(() => {
    const timer = setInterval(() => refreshClock((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!menu) return;
    sidebar.current?.querySelector<HTMLElement>("a, button")?.focus();
    function keyboard(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeNavigation();
      }
      if (e.key !== "Tab") return;
      const items = [
        ...(sidebar.current?.querySelectorAll<HTMLElement>("a,button") || []),
      ].filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [menu]);
  useEffect(() => {
    const onHash = () => {
      setPage(route());
      setMenu(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    async function load() {
      try {
        let s = await repository.load();
        if (!s) s = await repository.replace(initialData(), 0);
        if (cloud && accountId) {
          try {
            s = await applyLocalCatalog(repository, s, accountId);
          } catch (error) {
            setNotice({
              text: `Course import was not completed: ${error instanceof Error ? error.message : "Please reload to retry"}`,
              error: true,
            });
          }
        }
        const prepared = structuredClone(s.data);
        applyWeeklyBaseline(prepared);
        freezeToday(prepared, prepared.settings.activeSemesterId);
        applyCs101Schedule(prepared);
        if (JSON.stringify(prepared) !== JSON.stringify(s.data))
          s = await repository.replace(prepared, s.revision);
        latest.current = s;
        setSnapshot(s);
        setRecovered(!!s.data.timer);
      } catch (e) {
        setLoadingError(
          e instanceof Error ? e.message : "Unable to open browser storage",
        );
      }
    }
    void load();
  }, []);
  useEffect(() => {
    if (notice && !notice.error) {
      const t = setTimeout(() => setNotice(undefined), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const run = useCallback(
    async (
      mutate: (d: Dataset) => void,
      message = "Saved",
      options?: {
        restore?: boolean;
        topicEditPlanId?: string;
        scheduleResetPlanId?: string;
      },
    ) => {
      if (!latest.current || saving.current) {
        setNotice({
          text: "A save is in progress. Please try again.",
          error: true,
        });
        return false;
      }
      saving.current = true;
      setNotice({ text: cloud ? "Saving to cloud…" : "Saving…", error: false });
      try {
        const next = await commit(repository, latest.current, mutate, options);
        latest.current = next;
        setSnapshot(next);
        setNotice({ text: message, error: false });
        return true;
      } catch (e) {
        const text =
          e instanceof ZodError
            ? e.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join(" · ")
            : e instanceof Error
              ? e.message
              : "Unable to save";
        setNotice({ text, error: true });
        return false;
      } finally {
        saving.current = false;
      }
    },
    [repository, cloud],
  );
  if (!snapshot)
    return (
      <div className="loading">
        <GraduationCap size={38} />
        <h1>Study Desk</h1>
        {loadingError ? (
          <>
            <p className="error" role="alert">
              {loadingError}
            </p>
            <p>
              Existing records have not been replaced. Enable browser storage or
              close conflicting tabs, then reload.
            </p>
            <button onClick={() => location.reload()}>Reload</button>
          </>
        ) : (
          <p>Opening your study space…</p>
        )}
      </div>
    );
  const d = snapshot.data;
  const semester = d.semesters.find(
    (s) => s.id === d.settings.activeSemesterId,
  )!;
  const unread = studyAlerts(d, semester.id).filter((a) => !a.state).length;
  const content =
    page === "notifications" ? (
      <Notifications />
    ) : page === "courses" ? (
      <Courses />
    ) : page === "assessments" ? (
      <Assessments />
    ) : page === "calendar" ? (
      <Calendar />
    ) : page === "progress" ? (
      <Progress />
    ) : page === "resources" ? (
      <Resources key={semester.id} />
    ) : page === "settings" ? (
      <Settings key={d.settings.timezone + d.settings.weekStart} />
    ) : (
      <Today />
    );
  return (
    <StudyContext.Provider
      value={{
        data: d,
        getData: () => latest.current!.data,
        cloud,
        semesterId: semester.id,
        run,
        edit: (request) => {
          setNotice(undefined);
          setEditor(request);
        },
        saveError: notice?.error ? notice.text : undefined,
      }}
    >
      <GoogleCalendarProvider>
        <a
          href="#main"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            main.current?.focus();
          }}
        >
          Skip to content
        </a>
        <div className="app-shell">
          <aside
            ref={sidebar}
            className={`sidebar ${menu ? "open" : ""}`}
            aria-label="Main navigation"
          >
            <a href="#/today" className="brand">
              <span className="brand-icon">
                <GraduationCap size={26} />
              </span>
              <span>
                Study Desk<small>VIRTUAL UNIVERSITY</small>
              </span>
            </a>
            <button
              className="mobile-close icon-button"
              aria-label="Close navigation"
              onClick={closeNavigation}
            >
              <X size={21} />
            </button>
            <div className="sidebar-label">WORKSPACE</div>
            <nav>
              {nav.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#/${id}`}
                  onClick={() => {
                    if (page === id && menu) closeNavigation();
                  }}
                  aria-current={page === id ? "page" : undefined}
                >
                  <Icon size={19} />
                  {label}
                  {id === "notifications" && unread > 0 && (
                    <span className="notification-count">{unread}</span>
                  )}
                  {page === id && <span className="nav-dot" />}
                </a>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="local-status">
                <span />
                {cloud
                  ? "Saved to your private cloud"
                  : "Saved on this browser"}
              </div>
              <p>
                A steady pace.
                <br />A semester of possibilities.
              </p>
              <a href="#/settings">
                <CircleHelp size={16} />
                Storage & backups
              </a>
            </div>
          </aside>
          {menu && (
            <button
              className="menu-backdrop"
              aria-label="Close navigation"
              onClick={closeNavigation}
            />
          )}
          <div className="workspace" inert={menu}>
            <header className="topbar" aria-label="Study Desk controls">
              <div className="topbar-left">
                <button
                  ref={menuButton}
                  className="mobile-menu icon-button"
                  aria-label="Open navigation"
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  <Menu size={22} />
                </button>
                <div className="semester-control">
                  <GraduationCap size={18} />
                  <label className="sr-only" htmlFor="semester">
                    Active semester
                  </label>
                  <select
                    id="semester"
                    value={semester.id}
                    onChange={(e) => {
                      setEditor(undefined);
                      void run((d) => {
                        d.settings.activeSemesterId = e.target.value;
                      }, "Semester selected");
                    }}
                  >
                    {d.semesters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.archived ? " · Archived" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>
              <div className="topbar-actions">
                <a
                  className="notification-shortcut"
                  href="#/notifications"
                  aria-label={`Notifications, ${unread} unread`}
                >
                  <Bell size={18} />
                  {unread > 0 && (
                    <span className="notification-count" aria-hidden="true">
                      {unread}
                    </span>
                  )}
                </a>
                <ThemeControl compact />
                <div className="topbar-date">
                  <span>
                    {new Date(
                      `${today(d.settings.timezone)}T12:00:00Z`,
                    ).toLocaleDateString("en", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                  <small>{d.settings.timezone}</small>
                </div>
              </div>
            </header>
            <main
              id="main"
              ref={main}
              tabIndex={-1}
              key={`${page}-${semester.id}`}
            >
              {semester.archived && (
                <div className="notice archive-notice">
                  Archived semester · Historical records remain available.
                  Reopen it in Settings when you resume studying.
                </div>
              )}
              {content}
            </main>
            <Timer
              recovered={recovered}
              clearRecovered={() => setRecovered(false)}
            />
          </div>
        </div>
        {notice && (
          <div
            className={`toast ${notice.error ? "error-toast" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            <span>{notice.text}</span>
            <button
              aria-label="Dismiss message"
              className="icon-button"
              onClick={() => setNotice(undefined)}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {editor && (
          <Editor
            key={`${editor.kind}-${editor.id}-${editor.courseId}-${editor.lectureId}`}
            request={editor}
            close={() => setEditor(undefined)}
          />
        )}
        {!d.settings.onboarded && (
          <Modal
            title="Welcome to your Study Desk"
            close={() =>
              void run((d) => {
                d.settings.onboarded = true;
              })
            }
          >
            <p>
              A calm place to organize your Virtual University studies. Your
              first semester is ready, with no invented courses or deadlines.
            </p>
            <div className="onboarding-note">
              <strong>
                {cloud
                  ? "Your records are saved to your private cloud account."
                  : "Your records live in this browser."}
              </strong>
              <p>
                {cloud
                  ? "Sign in with the same account on another device to access your records. Cloud saves require an internet connection. Export backups regularly."
                  : "Devices, browsers, profiles, local development, and the published website have separate records. Clearing browser data can erase them."}
              </p>
              <p>
                GitHub backs up your code. GitHub Pages hosts the app.{" "}
                {cloud
                  ? "Supabase saves your study records under your signed-in account."
                  : "Neither saves or synchronizes your study records."}
              </p>
              <p>
                Export backups in Settings & Data. They include resource links,
                not Google Drive files.
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                void run((d) => {
                  d.settings.onboarded = true;
                }, "Welcome. Add a course whenever you’re ready.")
              }
            >
              Open my study desk
            </button>
          </Modal>
        )}
      </GoogleCalendarProvider>
    </StudyContext.Provider>
  );
}
