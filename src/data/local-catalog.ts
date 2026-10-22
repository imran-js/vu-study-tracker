import { catalogSchema, mergeCatalog } from "../features/backup/catalog";
import type { StudyRepository, Snapshot } from "./contracts";

// Private catalog is served only by the loopback development server. Never bundled.
export async function applyLocalCatalog(
  repository: StudyRepository,
  snapshot: Snapshot,
  accountId: string,
) {
  if (!(import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV)
    return snapshot;
  const response = await fetch("/__private/course-catalog", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 404) return snapshot;
  if (!response.ok) throw new Error("Unable to read the local course catalog");
  const catalog = catalogSchema.parse(await response.json());
  const marker = `study-catalog:${accountId}:${catalog.id}`;
  if (localStorage.getItem(marker)) return snapshot;
  const { data } = mergeCatalog(snapshot.data, catalog);
  const result =
    JSON.stringify(data) === JSON.stringify(snapshot.data)
      ? snapshot
      : await repository.replace(data, snapshot.revision);
  localStorage.setItem(marker, "imported");
  return result;
}
