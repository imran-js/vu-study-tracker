import { z } from "zod";

export const defaultCalendarSettings = () => ({
  automatic: false,
  reminders: [10080, 1440],
  openingReminder: false,
});
export const calendarSettingsSchema = z.object({
  calendarId: z.string().min(1).max(1024).optional(),
  calendarName: z.string().max(300).optional(),
  automatic: z.boolean(),
  reminders: z.array(z.number().int().min(0).max(40320)).max(4),
  openingReminder: z.boolean(),
});
export const calendarMappingSchema = z.object({
  provider: z.literal("google-calendar"),
  assessmentId: z.string().min(1).max(200),
  calendarId: z.string().min(1).max(1024),
  eventId: z.string().regex(/^[0-9a-v]{5,1024}$/),
  generation: z.number().int().min(0),
  status: z.enum(["pending", "synced", "failed", "removed"]),
  sourceHash: z.string().max(100000).optional(),
  lastSyncedAt: z.string().datetime().optional(),
  lastError: z.string().max(500).optional(),
  suppressed: z.boolean().optional(),
});
export const alertReceiptSchema = z.object({
  key: z.string().min(1).max(300),
  fingerprint: z.string().max(100000),
  state: z.enum(["read", "dismissed"]),
  at: z.string().datetime(),
});
export function defaultCalendarEligible(label: string) {
  return [
    "quiz",
    "assignment",
    "gdb",
    "midterm",
    "final exam",
    "exam",
    "administrative deadline",
  ].includes(label.trim().toLowerCase());
}
