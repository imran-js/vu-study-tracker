import {
  defaultCalendarSettings,
  defaultCalendarEligible,
} from "../domain/calendar-model";
import { validateData, type Dataset } from "../domain/model";
import {
  defaultPlannerSettings,
  unknownCoverage,
} from "../domain/planner-model";

// v1 was the pre-resource record format. Never mutate the input backup.
const migrations: Record<
  number,
  (d: Record<string, unknown>) => Record<string, unknown>
> = {
  3: (d) => ({
    ...d,
    schemaVersion: 4,
    settings: {
      ...(d.settings as object),
      googleCalendar: defaultCalendarSettings(),
    },
    calendarMappings: [],
    alertReceipts: [],
    types: (d.types as Record<string, unknown>[]).map((t) => ({
      ...t,
      calendarEligible: defaultCalendarEligible(String(t.label)),
    })),
  }),
  1: (d) => ({
    ...d,
    schemaVersion: 2,
    resources: [],
    courses: (d.courses as Record<string, unknown>[]).map((c) => ({
      ...c,
      folderUrl: "",
    })),
  }),
  2: (d) => ({
    ...d,
    schemaVersion: 3,
    settings: {
      ...(d.settings as object),
      planner: { ...defaultPlannerSettings },
    },
    dailyPlans: [],
    courses: (d.courses as Record<string, unknown>[]).map((c) => ({
      ...c,
      planning: {
        active: String(c.code).toUpperCase() !== "VU001",
        status: "On track",
        reason: "",
        catchUpMinutes: 0,
      },
    })),
    assessments: (d.assessments as Record<string, unknown>[]).map((a) => ({
      ...a,
      coverage: unknownCoverage(),
    })),
  }),
};
export function migrateData(raw: unknown): Dataset {
  if (!raw || typeof raw !== "object") throw new Error("Invalid dataset");
  let value = structuredClone(raw) as Record<string, unknown>;
  if (
    typeof value.schemaVersion !== "number" ||
    !Number.isInteger(value.schemaVersion) ||
    value.schemaVersion < 1
  )
    throw new Error("Missing or unsupported schema version");
  if (value.schemaVersion > 4)
    throw new Error(
      "This backup is from a newer version. Update Study Desk before restoring.",
    );
  while (value.schemaVersion !== 4) {
    const migrate = migrations[value.schemaVersion as number];
    if (!migrate) throw new Error("No supported migration");
    value = migrate(value);
  }
  return validateData(value);
}
