import type { StudyRepository, Snapshot } from "./contracts";
import { validateData, type Dataset } from "../domain/model";
import { migrateData } from "./migrations";

export class IndexedDbRepository implements StudyRepository {
  private connection?: Promise<IDBDatabase>;
  constructor(private name = "vu-study-desk") {}
  private open() {
    return (this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(new Error("Close other Study Desk tabs to upgrade storage."));
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
    }));
  }
  async load(): Promise<Snapshot | undefined> {
    const db = await this.open();
    const raw = await new Promise<Snapshot | undefined>((resolve, reject) => {
      const req = db.transaction("state").objectStore("state").get("dataset");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return undefined;
    const data = migrateData(raw.data);
    if (raw.data.schemaVersion !== data.schemaVersion)
      return this.replace(data, raw.revision);
    return { data, revision: raw.revision };
  }
  async replace(input: Dataset, expectedRevision: number): Promise<Snapshot> {
    const data = validateData(input);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      const store = tx.objectStore("state");
      let result: Snapshot;
      let reason: Error | undefined;
      const req = store.get("dataset");
      req.onsuccess = () => {
        const current = req.result as Snapshot | undefined;
        if ((current?.revision ?? 0) !== expectedRevision) {
          reason = new Error(
            "Records changed in another tab. Reload before saving again.",
          );
          tx.abort();
          return;
        }
        result = { data, revision: expectedRevision + 1 };
        store.put(result, "dataset");
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          reason ||
            tx.error ||
            new Error("Storage failed; previous records were preserved."),
        );
      tx.onerror = () => {
        reason ??= tx.error || new Error("Unable to save records");
      };
    });
  }
}
