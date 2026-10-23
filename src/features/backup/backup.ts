import { z } from "zod";
import { instant, type Dataset } from "../../domain/model";
import { migrateData } from "../../data/migrations";
export function exportBackup(data: Dataset, at = new Date().toISOString()) {
  return JSON.stringify(
    {
      format: "vu-study-desk",
      schemaVersion: data.schemaVersion,
      exportedAt: at,
      applicationVersion: "1.2.0",
      data,
    },
    null,
    2,
  );
}
export function parseBackup(text: string): Dataset {
  if (text.length > 25_000_000)
    throw new Error("Backup exceeds the 25 MB import limit.");
  const envelope = z
    .object({
      format: z.literal("vu-study-desk"),
      schemaVersion: z.number().int(),
      exportedAt: instant,
      applicationVersion: z.string(),
      data: z.object({ schemaVersion: z.number() }).passthrough(),
    })
    .parse(JSON.parse(text));
  if (envelope.schemaVersion !== envelope.data.schemaVersion)
    throw new Error("Backup schema versions disagree");
  return migrateData(envelope.data);
}
