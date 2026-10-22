import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbRepository } from "./indexeddb";
import { initialData } from "../domain/model";
import { commit } from "../app/actions";
import { exportBackup, parseBackup } from "../features/backup/backup";
describe("atomic storage and restore", () => {
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
