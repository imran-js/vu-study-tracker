import { validateData, type Dataset } from "../domain/model";

// v1 was the pre-resource record format. Never mutate the input backup.
const migrations: Record<
  number,
  (d: Record<string, unknown>) => Record<string, unknown>
> = {
  1: (d) => ({
    ...d,
    schemaVersion: 2,
    resources: [],
    courses: (d.courses as Record<string, unknown>[]).map((c) => ({
      ...c,
      folderUrl: "",
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
  if (value.schemaVersion > 2)
    throw new Error(
      "This backup is from a newer version. Update Study Desk before restoring.",
    );
  while (value.schemaVersion !== 2) {
    const migrate = migrations[value.schemaVersion as number];
    if (!migrate) throw new Error("No supported migration");
    value = migrate(value);
  }
  return validateData(value);
}
