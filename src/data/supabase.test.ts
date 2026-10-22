import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "./supabase";
import { initialData } from "../domain/model";

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
