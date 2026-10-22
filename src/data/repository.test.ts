import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbRepository } from "./indexeddb";
import { initialData } from "../domain/model";
import { commit } from "../app/actions";
import { exportBackup, parseBackup } from "../features/backup/backup";
import { recommendDay, saveDayPlan, unlockDayPlan } from "../domain/planner";
import { today } from "../domain/dates";
import { stamp } from "../domain/model";
describe("atomic storage and restore", () => {
  it("enforces locked assignments at the commit boundary and preserves explicit full restore", async () => {
    const repo = new IndexedDbRepository(crypto.randomUUID()),
      data = initialData();
    data.courses.push({
      ...stamp(),
      semesterId: data.settings.activeSemesterId,
      code: "TEST",
      title: "Synthetic",
      priority: "normal",
      notes: "",
      folderUrl: "",
    });
    const day = today(data.settings.timezone);
    saveDayPlan(
      data,
      data.settings.activeSemesterId,
      day,
      recommendDay(data, data.settings.activeSemesterId, day).items,
      "Fixed",
      true,
    );
    const locked = await repo.replace(data, 0);
    await expect(
      commit(repo, locked, (d) => {
        d.dailyPlans[0].notes = "Silently rewritten";
      }),
    ).rejects.toThrow(/Unlock/);
    expect(await repo.load()).toEqual(locked);
    const unlocked = await commit(repo, locked, (d) =>
      unlockDayPlan(d, d.dailyPlans[0].id),
    );
    const edited = await commit(repo, unlocked, (d) => {
      d.dailyPlans[0].notes = "Deliberately edited";
    });
    expect(edited.data.dailyPlans[0].notes).toBe("Deliberately edited");
    const restored = await commit(
      repo,
      edited,
      (d) => {
        Object.assign(d, parseBackup(exportBackup(locked.data)));
      },
      { restore: true },
    );
    expect(restored.data.dailyPlans[0].locked).toBe(true);
  });
  it("upgrades an existing v2 browser snapshot without deleting its records", async () => {
    const name = crypto.randomUUID(),
      repo = new IndexedDbRepository(name);
    const original = initialData();
    original.semesters[0].name = "Keep original history";
    await repo.replace(original, 0);
    const legacy = JSON.parse(JSON.stringify(original));
    legacy.schemaVersion = 2;
    delete legacy.dailyPlans;
    delete legacy.settings.planner;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put({ data: legacy, revision: 7 }, "dataset");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    const loaded = await repo.load();
    expect(loaded?.data.schemaVersion).toBe(3);
    expect(loaded?.data.semesters).toEqual(original.semesters);
    expect(loaded?.data.dailyPlans).toEqual([]);
    expect(loaded?.revision).toBe(8);
  });
  it("round trips and replaces complete datasets", async () => {
    const repo = new IndexedDbRepository(crypto.randomUUID());
    const initial = await repo.replace(initialData(), 0);
    const next = structuredClone(initial.data);
    next.semesters[0].archived = true;
    const restored = await repo.replace(
      parseBackup(exportBackup(next)),
      initial.revision,
    );
    expect(await repo.load()).toEqual(restored);
  });
  it("leaves saved data intact after invalid import or application action", async () => {
    const repo = new IndexedDbRepository(crypto.randomUUID());
    const initial = await repo.replace(initialData(), 0);
    const invalid = structuredClone(initial.data);
    invalid.settings.activeSemesterId = "missing";
    expect(() => parseBackup(exportBackup(invalid))).toThrow();
    await expect(repo.replace(invalid, initial.revision)).rejects.toThrow();
    await expect(
      commit(repo, initial, (d) => {
        d.semesters = [];
      }),
    ).rejects.toThrow();
    expect(await repo.load()).toEqual(initial);
  });
  it("rejects stale writes from a second tab without changing data", async () => {
    const name = crypto.randomUUID();
    const repo = new IndexedDbRepository(name),
      other = new IndexedDbRepository(name);
    const original = await repo.replace(initialData(), 0);
    const current = await commit(repo, original, (d) => {
      d.settings.onboarded = true;
    });
    await expect(
      other.replace(original.data, original.revision),
    ).rejects.toThrow(/another tab/);
    expect(await other.load()).toEqual(current);
  });
});
