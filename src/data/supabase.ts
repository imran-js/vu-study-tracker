import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StudyRepository, Snapshot } from "./contracts";
import { validateData, type Dataset } from "../domain/model";
import { migrateData } from "./migrations";

const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
export const supabase =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
    : undefined;

export class SupabaseRepository implements StudyRepository {
  constructor(
    private client: SupabaseClient,
    private owner: string,
  ) {}
  private async checkOwner() {
    const { data, error } = await this.client.auth.getUser();
    if (error || data.user?.id !== this.owner)
      throw new Error("Your session changed. Sign in again before saving.");
  }
  async load(): Promise<Snapshot | undefined> {
    await this.checkOwner();
    const { data, error } = await this.client
      .from("study_snapshots")
      .select("data, revision")
      .eq("owner_id", this.owner)
      .maybeSingle();
    if (error)
      throw new Error(
        `Cloud load failed: ${error.message}. Check that the database setup script has been run.`,
      );
    return data
      ? { data: migrateData(data.data), revision: data.revision }
      : undefined;
  }
  async replace(input: Dataset, expectedRevision: number): Promise<Snapshot> {
    const data = validateData(input);
    await this.checkOwner();
    const { data: revision, error } = await this.client.rpc(
      "save_study_snapshot",
      { payload: data, expected_revision: expectedRevision },
    );
    if (error)
      throw new Error(
        `Cloud save failed: ${error.message}. Your unsaved changes were not committed. Reload if another device changed your records.`,
      );
    if (!Number.isSafeInteger(revision) || revision !== expectedRevision + 1)
      throw new Error("Unexpected cloud revision. Reload before continuing.");
    return { data, revision };
  }
}
