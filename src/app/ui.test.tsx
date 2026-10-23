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
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function systemDark(value: boolean) {
  act(() => {
    dark = value;
    mediaListeners.forEach((fn) => fn());
  });
}
function fixture() {
  const d = initialData();
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
