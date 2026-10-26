// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import App from "./App";
import {
  AppearanceProvider,
  AppearanceSettings,
  appearanceKey,
  readAppearance,
} from "./appearance";
import { initialData, stamp, type Dataset } from "../domain/model";
import { recommendDay, saveDayPlan } from "../domain/planner";
import { today } from "../domain/dates";
import { dateSignature } from "../domain/calendar";
import { generateLectures } from "./actions";
import { weeklySubjects } from "../domain/weekly-framework";
import type { StudyRepository } from "../data/contracts";

const calendar = vi.hoisted(() => ({
  connected: true,
  ready: true,
  busy: false,
  message: "",
  calendars: [
    { id: "test-calendar", summary: "Test calendar", primary: false },
  ],
  connect: vi.fn(),
  disconnect: vi.fn(),
  select: vi.fn(),
  create: vi.fn(),
  sync: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./calendar-context", () => ({
  calendarClientId: "public-test-id",
  GoogleCalendarProvider: ({ children }: { children: ReactNode }) => children,
  useGoogleCalendar: () => calendar,
}));
let dark = false;
let mediaListeners: Set<() => void>;
beforeEach(() => {
  localStorage.clear();
  window.location.hash = "#/today";
  dark = false;
  mediaListeners = new Set();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn),
      removeEventListener: (_: string, fn: () => void) =>
        mediaListeners.delete(fn),
    })),
  );
  vi.stubGlobal("scrollTo", vi.fn());
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fixed weekly study framework", () => {
  it("shows saved subjects and their own focus instead of mislabelling a preserved Tuesday plan", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
    const d = initialData();
    d.settings.onboarded = true;
    for (const code of weeklySubjects) {
      const course = {
        ...stamp(),
        semesterId: d.settings.activeSemesterId,
        code,
        title: code,
        notes: "",
        folderUrl: "",
        priority: "normal" as const,
        lectureTotal: 4,
      };
      d.courses.push(course);
      generateLectures(d, course.id);
    }
    // A plan saved before the fixed framework was introduced must survive.
    const semesterName = d.semesters[0].name;
    d.semesters[0].name = "Legacy semester";
    const items = [d.courses[2], d.courses[3]].map((course, index) => ({
      role: index === 0 ? ("Main" as const) : ("Secondary" as const),
      courseId: course.id,
      lectureId: d.lectures.find(
        (l) => l.courseId === course.id && l.number === 3,
      )!.id,
      focus: index === 0 ? "Rules of Debit and Credit" : "Business ownership",
      minutes: index === 0 ? 63 : 27,
      reason: "Previously saved choice",
      source: "Personal Plan" as const,
      status: "pending" as const,
    }));
    const saved = structuredClone(
      saveDayPlan(
        d,
        d.settings.activeSemesterId,
        "2026-10-27",
        items,
        "Keep my notes",
        true,
      ),
    );
    d.semesters[0].name = semesterName;
    const app = await workspace(d);
    await screen.findByRole("heading", { name: "Your weekly study rhythm" });
    const card = document.querySelector(".weekly-day.is-today") as HTMLElement;
    expect(
      within(card).getByRole("heading", { name: "MGT101 + MGT211" }),
    ).toBeTruthy();
    expect(card.textContent).toContain("Saved plan · usual slot: ENG101");
    expect(card.textContent).toContain("MGT101 · Rules of Debit and Credit");
    expect(card.textContent).toContain("MGT211 · Business ownership");
    expect(card.textContent).toContain("Today · saved");
    expect(app.data().dailyPlans.find((p) => p.id === saved.id)).toEqual(saved);
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
    const records = structuredClone({
      lectures: app.data().lectures,
      sessions: app.data().sessions,
    });
    fireEvent.click(
      within(card).getByRole("button", { name: "Edit topics for 2026-10-27" }),
    );
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getAllByLabelText("Daily topic")[0], {
      target: { value: "Practise debit and credit examples" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(app.data().dailyPlans.find((p) => p.id === saved.id)).toEqual(saved);
    fireEvent.click(
      within(card).getByRole("button", { name: "Edit topics for 2026-10-27" }),
    );
    dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getAllByLabelText("Daily topic")[0], {
      target: { value: "Practise debit and credit examples" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save topics" }),
    );
    await screen.findByText("Daily topics saved");
    const edited = app.data().dailyPlans.find((p) => p.id === saved.id)!;
    expect(edited.items[0].focus).toBe("Practise debit and credit examples");
    expect(edited.locked).toBe(true);
    expect(edited.notes).toBe(saved.notes);
    expect(
      edited.items.map((i) => [i.courseId, i.minutes, i.status, i.sessionId]),
    ).toEqual(
      saved.items.map((i) => [i.courseId, i.minutes, i.status, i.sessionId]),
    );
    expect(app.data().lectures).toEqual(records.lectures);
    expect(app.data().sessions).toEqual(records.sessions);
    expect(
      screen.queryByRole("button", { name: "Edit topics for 2026-10-26" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit topics for 2026-10-28" }),
    );
    dialog = await screen.findByRole("dialog");
    const unit = app
      .data()
      .lectures.find((l) => l.courseId === d.courses[2].id && l.number === 4)!;
    fireEvent.change(within(dialog).getByLabelText("Study unit"), {
      target: { value: unit.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save topics" }),
    );
    await vi.waitFor(() =>
      expect(
        app.data().dailyPlans.find((p) => p.day === "2026-10-28")?.items[0]
          .lectureId,
      ).toBe(unit.id),
    );
    expect(
      app.data().dailyPlans.find((p) => p.day === "2026-10-28")?.locked,
    ).toBe(false);
  });

  it("shows all seven days, baseline progress and future editing while today stays locked", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T09:00:00Z"));
    const d = initialData();
    d.settings.onboarded = true;
    for (const code of weeklySubjects) {
      const c = {
        ...stamp(),
        semesterId: d.settings.activeSemesterId,
        code,
        title: code,
        notes: "",
        folderUrl: "",
        priority: "normal" as const,
        lectureTotal: 4,
      };
      d.courses.push(c);
      generateLectures(d, c.id);
    }
    const app = await workspace(d);
    await screen.findByRole("heading", { name: "Your weekly study rhythm" });
    expect(
      screen.queryByRole("button", { name: "Unlock today's plan" }),
    ).toBeNull();
    expect(
      app.data().lectures.filter((l) => l.status === "completed"),
    ).toHaveLength(10);
    expect(app.data().dailyPlans[0].locked).toBe(true);
    const board = document.querySelector(".weekly-planner") as HTMLElement;
    expect(board.querySelectorAll(".weekly-day")).toHaveLength(7);
    expect(board.textContent).toContain("Practice");
    expect(board.textContent).toContain("Catch-up");
    fireEvent.click(
      within(board).getAllByRole("button", { name: "Plan this day" })[0],
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByLabelText("Course").querySelectorAll("option"),
    ).toHaveLength(1);
    expect(
      (within(dialog).getByLabelText("Course") as HTMLSelectElement).value,
    ).toBe(d.courses[1].id);
    expect(
      within(dialog).queryByRole("button", { name: "Add Secondary item" }),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved; it is not locked");
    expect(
      app.data().dailyPlans.find((p) => p.day === "2026-10-27")?.locked,
    ).toBe(false);
    expect(app.data().dailyPlans[0].locked).toBe(true);
  });
});
function systemDark(value: boolean) {
  act(() => {
    dark = value;
    mediaListeners.forEach((fn) => fn());
  });
}
function fixture() {
  const d = initialData();
  d.semesters[0].name = "Synthetic semester";
  d.settings.onboarded = true;
  d.courses.push({
    ...stamp(),
    semesterId: d.settings.activeSemesterId,
    code: "TEST",
    title: "Synthetic course",
    notes: "",
    folderUrl: "",
    priority: "normal",
  });
  const a = {
    ...stamp(),
    courseId: d.courses[0].id,
    typeId: d.types[1].id,
    title: "Synthetic quiz",
    notes: "",
    sourceUrl: "",
    deadline: { kind: "date" as const, date: today(d.settings.timezone) },
    status: "not started" as const,
  };
  d.assessments.push({
    ...a,
    dateConfirmation: {
      source: "Synthetic official notice",
      signature: dateSignature(a),
      at: new Date().toISOString(),
    },
  });
  d.settings.googleCalendar.calendarId = "test-calendar";
  d.settings.googleCalendar.calendarName = "Test calendar";
  const day = today(d.settings.timezone);
  saveDayPlan(
    d,
    d.settings.activeSemesterId,
    day,
    recommendDay(d, d.settings.activeSemesterId, day).items,
    "",
    true,
  );
  return d;
}
async function workspace(d = fixture()) {
  let current = d;
  const repository: StudyRepository = {
    load: vi.fn(async () => ({ data: current, revision: 1 })),
    replace: vi.fn(async (data: Dataset, revision: number) => {
      current = data;
      return { data, revision: revision + 1 };
    }),
  };
  render(
    <AppearanceProvider>
      <App repository={repository} />
    </AppearanceProvider>,
  );
  await screen.findByRole("banner", { name: "Study Desk controls" });
  return { repository, data: () => current };
}
async function route(name: string) {
  act(() => {
    window.location.hash = `#/${name}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

it("loads the CS101 official schedule once and displays grading and verified topic coverage", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T09:00:00Z"));
  const d = initialData();
  d.settings.onboarded = true;
  d.courses.push({
    ...stamp(),
    semesterId: d.settings.activeSemesterId,
    code: "CS101",
    title: "Introduction to Computing",
    notes: "My notebook",
    folderUrl: "",
    priority: "normal",
  });
  const app = await workspace(d);
  expect(app.data().assessments).toHaveLength(9);
  expect(app.data().dailyPlans[0].locked).toBe(true);
  await route("assessments");
  expect(
    screen.getByRole("region", { name: "CS101 official grading" }).textContent,
  ).toContain(
    "Coursework 40 = GDB 5 + Midterm 20 + Semester Quizzes 15. Final Exam 60.",
  );
  expect(
    screen.getByRole("region", { name: "CS101 official grading" }).textContent,
  ).toContain("overall Net Score more than 40%");
  expect(screen.getByRole("heading", { name: "Semester Quiz 1" })).toBeTruthy();
  expect(screen.getByText("Coverage: Topics 1–38")).toBeTruthy();
  expect(screen.getByText(/Opens 2026-11-02/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Final Exam" })).toBeTruthy();
  const saved = structuredClone(app.data());
  await route("settings");
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await vi.waitFor(() =>
    expect(app.data().assessments).toEqual(saved.assessments),
  );
  expect(app.data().dailyPlans).toEqual(saved.dailyPlans);
  await route("courses");
  fireEvent.click(
    screen.getByRole("button", { name: /Introduction to Computing/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit course" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Short course notes"), {
    target: { value: "Edited notebook" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await vi.waitFor(() =>
    expect(app.data().courses[0].notes).toBe("Edited notebook"),
  );
  expect(app.data().courses[0].cs101ScheduleVersion).toBe(
    saved.courses[0].cs101ScheduleVersion,
  );
  expect(app.data().assessments).toEqual(saved.assessments);
});
describe("appearance preferences", () => {
  it("defaults to System and follows system changes in both directions", () => {
    render(
      <AppearanceProvider>
        <AppearanceSettings />
      </AppearanceProvider>,
    );
    expect(
      (screen.getByLabelText("Color theme") as HTMLSelectElement).value,
    ).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
    systemDark(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    systemDark(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("persists explicit theme and text size across remounts", () => {
    const mounted = render(
      <AppearanceProvider>
        <AppearanceSettings />
      </AppearanceProvider>,
    );
    fireEvent.change(screen.getByLabelText("Color theme"), {
      target: { value: "dark" },
    });
    fireEvent.change(screen.getByLabelText("Text size"), {
      target: { value: "large" },
    });
    expect(readAppearance()).toEqual({ theme: "dark", textSize: "large" });
    mounted.unmount();
    render(
      <AppearanceProvider>
        <AppearanceSettings />
      </AppearanceProvider>,
    );
    systemDark(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.textSize).toBe("large");
    expect(
      (screen.getByLabelText("Text size") as HTMLSelectElement).value,
    ).toBe("large");
  });
  it("ignores corrupt or unsupported preferences", () => {
    localStorage.setItem(appearanceKey, "not-json");
    expect(readAppearance()).toEqual({ theme: "system", textSize: "default" });
    localStorage.setItem(
      appearanceKey,
      JSON.stringify({ theme: "bad", textSize: "tiny" }),
    );
    expect(readAppearance()).toEqual({ theme: "system", textSize: "default" });
  });
  it("keeps controls usable and explains when browser preference saving fails", () => {
    render(
      <AppearanceProvider>
        <AppearanceSettings />
      </AppearanceProvider>,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fireEvent.change(screen.getByLabelText("Color theme"), {
      target: { value: "dark" },
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("status").textContent).toContain("could not save");
  });
  it("updates a second open tab when browser preferences change", () => {
    render(
      <AppearanceProvider>
        <AppearanceSettings />
      </AppearanceProvider>,
    );
    localStorage.setItem(
      appearanceKey,
      JSON.stringify({ theme: "light", textSize: "compact" }),
    );
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: appearanceKey })),
    );
    expect(document.documentElement.dataset.textSize).toBe("compact");
  });
});
describe("study interface", () => {
  it("places the bell in the header, labels its unread count, and opens existing notifications", async () => {
    await workspace();
    const bell = within(
      screen.getByRole("banner", { name: "Study Desk controls" }),
    ).getByRole("link", { name: /Notifications, [1-9]\d* unread/ });
    expect(bell.getAttribute("href")).toBe("#/notifications");
    fireEvent.click(bell);
    await screen.findByRole("heading", { name: "Notifications", level: 1 });
    expect(
      screen.getByRole("region", { name: "Critical notifications" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Mark read" }).length,
    ).toBeGreaterThan(0);
  });
  it("preserves locked Today content and state when appearance changes", async () => {
    const d = fixture(),
      before = JSON.stringify(d);
    const { repository } = await workspace(d);
    const plan = document.querySelector(".daily-planner")!;
    const content = plan.textContent;
    fireEvent.change(screen.getByLabelText("Color theme"), {
      target: { value: "dark" },
    });
    expect(plan.textContent).toBe(content);
    expect(JSON.stringify(d)).toBe(before);
    expect(repository.replace).not.toHaveBeenCalled();
    expect(
      plan.compareDocumentPosition(
        document.querySelector(".tomorrow-preview")!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Unlock today's plan" }),
    ).toBeTruthy();
  });
  it("keeps key settings and Calendar actions available in large text", async () => {
    const { repository } = await workspace();
    await route("settings");
    fireEvent.change(screen.getByLabelText("Text size"), {
      target: { value: "large" },
    });
    expect(document.documentElement.dataset.textSize).toBe("large");
    expect(repository.replace).not.toHaveBeenCalled();
    for (const name of [
      "Save preferences",
      "Export all records",
      "Restore from file",
      "Add semester",
      "Connect Google Calendar",
    ])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Sync confirmed deadlines" }),
    );
    expect(calendar.sync).toHaveBeenCalledWith();
    fireEvent.click(
      screen.getByRole("button", { name: "Use selected calendar" }),
    );
    expect(calendar.select).toHaveBeenCalledWith("test-calendar");
  });
  it("retains assessment-specific Calendar sync actions inside disclosure", async () => {
    const d = fixture();
    await workspace(d);
    await route("assessments");
    fireEvent.click(screen.getByText(/^Google Calendar:/));
    fireEvent.click(
      screen.getByRole("button", { name: "Sync to Google Calendar" }),
    );
    expect(calendar.sync).toHaveBeenCalledWith([d.assessments[0].id]);
  });
  it("opens and closes mobile navigation and closes it after route changes", async () => {
    await workspace();
    const open = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".workspace")?.hasAttribute("inert")).toBe(
      true,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    await route("courses");
    expect(open.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".workspace")?.hasAttribute("inert")).toBe(
      false,
    );
  });
  it("shows the caught-up empty state without manufacturing alerts", async () => {
    const d = initialData();
    d.settings.onboarded = true;
    await workspace(d);
    await route("notifications");
    expect(
      screen.getByRole("heading", { name: "You’re all caught up." }),
    ).toBeTruthy();
  });
});
