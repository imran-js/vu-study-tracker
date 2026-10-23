import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "./supabase";
import { initialData, stamp } from "../domain/model";
import { saveDayPlan, recommendDay } from "../domain/planner";

function mock(
  user = "owner",
  rpcResult = { data: 2, error: null } as {
    data: number | null;
    error: { message: string } | null;
  },
) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: user } }, error: null }),
    },
    rpc,
  };
  return { client: client as unknown as SupabaseClient, rpc };
}
describe("cloud snapshot saves", () => {
  it("accepts and transmits schema 3 daily plans through the same owner-scoped RPC", async () => {
    const { client, rpc } = mock();
    const data = initialData();
    const semesterId = data.settings.activeSemesterId;
    data.courses.push({
      ...stamp(),
      semesterId,
      code: "TEST",
      title: "Synthetic",
      priority: "normal",
      notes: "",
      folderUrl: "",
    });
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: data.settings.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    saveDayPlan(
      data,
      semesterId,
      date,
      recommendDay(data, semesterId, date).items,
      "Cloud planner test",
      true,
    );
    const result = await new SupabaseRepository(client, "owner").replace(
      data,
      1,
    );
    expect(result.data.schemaVersion).toBe(4);
    expect(result.data.dailyPlans).toHaveLength(1);
    expect(rpc.mock.calls[0][1].payload.dailyPlans[0].locked).toBe(true);
  });
  it("validates and sends the expected revision to the server", async () => {
    const { client, rpc } = mock();
    const data = initialData();
    expect(
      (await new SupabaseRepository(client, "owner").replace(data, 1)).revision,
    ).toBe(2);
    expect(rpc).toHaveBeenCalledWith("save_study_snapshot", {
      payload: data,
      expected_revision: 1,
    });
  });
  it("rejects account switches before transmitting records", async () => {
    const { client, rpc } = mock("other");
    await expect(
      new SupabaseRepository(client, "owner").replace(initialData(), 1),
    ).rejects.toThrow("session changed");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not treat a server conflict as a successful save", async () => {
    const { client } = mock("owner", {
      data: null,
      error: { message: "Records changed on another device" },
    });
    await expect(
      new SupabaseRepository(client, "owner").replace(initialData(), 1),
    ).rejects.toThrow("Records changed");
  });
  it("rejects an unexpected server revision", async () => {
    const { client } = mock("owner", { data: 8, error: null });
    await expect(
      new SupabaseRepository(client, "owner").replace(initialData(), 1),
    ).rejects.toThrow("Unexpected cloud revision");
  });
});
