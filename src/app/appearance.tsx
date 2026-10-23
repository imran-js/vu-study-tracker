import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type Theme = "system" | "light" | "dark";
export type TextSize = "compact" | "default" | "large";
export type Appearance = { theme: Theme; textSize: TextSize };
export const appearanceKey = "study-desk.appearance.v1";
const defaults: Appearance = { theme: "system", textSize: "default" };

// Device preferences are deliberately separate from academic records and backups.
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(appearanceKey) || "null");
    return {
      theme: ["system", "light", "dark"].includes(value?.theme)
        ? value.theme
        : defaults.theme,
      textSize: ["compact", "default", "large"].includes(value?.textSize)
        ? value.textSize
        : defaults.textSize,
    };
  } catch {
    return { ...defaults };
  }
}
export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.theme =
    value.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : value.theme;
  document.documentElement.dataset.textSize = value.textSize;
}
const AppearanceContext = createContext<
  | {
      value: Appearance;
      update: (patch: Partial<Appearance>) => void;
      saved: boolean;
    }
  | undefined
>(undefined);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(readAppearance);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    applyAppearance(value);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () => applyAppearance(value);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, [value]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === appearanceKey || event.key === null)
        setValue(readAppearance());
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function update(patch: Partial<Appearance>) {
    const next = { ...value, ...patch };
    setValue(next);
    applyAppearance(next);
    try {
      localStorage.setItem(appearanceKey, JSON.stringify(next));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }
  return (
    <AppearanceContext.Provider value={{ value, update, saved }}>
      {children}
    </AppearanceContext.Provider>
  );
}
function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("Appearance provider missing");
  return context;
}
export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { value, update } = useAppearance();
  const Icon =
    value.theme === "dark" ? Moon : value.theme === "light" ? Sun : Monitor;
  return (
    <label className={compact ? "theme-control" : ""}>
      {compact ? <Icon size={19} aria-hidden="true" /> : "Theme"}
      <select
        aria-label="Color theme"
        title={`Theme: ${value.theme}`}
        value={value.theme}
        onChange={(e) => update({ theme: e.target.value as Theme })}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
export function AppearanceSettings() {
  const { value, update, saved } = useAppearance();
  return (
    <section className="panel appearance-settings">
      <h2>Appearance</h2>
      <p className="muted">
        Make Study Desk comfortable to read. These preferences stay in this
        browser.
      </p>
      <div className="appearance-fields">
        <ThemeControl />
        <label>
          Text size
          <select
            value={value.textSize}
            onChange={(e) => update({ textSize: e.target.value as TextSize })}
          >
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>
      {!saved && (
        <p role="status" className="notice">
          Appearance changed for this visit. Your browser could not save the
          preference.
        </p>
      )}
    </section>
  );
}
