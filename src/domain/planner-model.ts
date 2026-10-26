import { z } from "zod";

export const sourceTypes = [
  "VULMS",
  "Official VU Announcement",
  "Official Handout",
  "Personal Plan",
  "Unknown / Awaiting Announcement",
] as const;
export const coverageSchema = z
  .object({
    type: z.enum(["unknown", "text", "numbered"]),
    verification: z.enum(["awaiting", "provisional", "verified"]),
    officialText: z.string().max(20000),
    startUnit: z.number().int().min(1).max(2000).optional(),
    endUnit: z.number().int().min(1).max(2000).optional(),
    mapping: z.enum(["unconfirmed", "direct"]),
    readingDependency: z.string().max(20000),
    readingStart: z.number().int().positive().optional(),
    readingEnd: z.number().int().positive().optional(),
    sourceType: z.enum(sourceTypes),
    sourceNote: z.string().max(20000),
  })
  .superRefine((c, ctx) => {
    if (
      c.type === "numbered" &&
      (c.startUnit === undefined ||
        c.endUnit === undefined ||
        c.endUnit < c.startUnit)
    )
      ctx.addIssue({
        code: "custom",
        message: "Numbered coverage needs a valid start/end range",
      });
    if (
      c.readingStart !== undefined &&
      c.readingEnd !== undefined &&
      c.readingEnd < c.readingStart
    )
      ctx.addIssue({
        code: "custom",
        message: "Reading range ends before it starts",
      });
    if (
      c.verification === "verified" &&
      (!c.sourceNote.trim() ||
        !["VULMS", "Official VU Announcement", "Official Handout"].includes(
          c.sourceType,
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "Verified coverage requires an official source and reference",
      });
  });
export function unknownCoverage(): z.infer<typeof coverageSchema> {
  return {
    type: "unknown",
    verification: "awaiting",
    officialText: "",
    mapping: "unconfirmed",
    readingDependency: "",
    sourceType: "Unknown / Awaiting Announcement",
    sourceNote: "",
  };
}
export const plannerSettingsSchema = z
  .object({
    normalMinutes: z.number().int().min(30).max(180),
    lightMinutes: z.number().int().min(30).max(180),
    maximumMinutes: z.number().int().min(30).max(180),
  })
  .refine(
    (s) =>
      s.lightMinutes <= s.normalMinutes && s.normalMinutes <= s.maximumMinutes,
    "Use light ≤ normal ≤ maximum daily minutes",
  );
export const defaultPlannerSettings = {
  normalMinutes: 90,
  lightMinutes: 65,
  maximumMinutes: 120,
};
export const coursePlanningSchema = z.object({
  active: z.boolean(),
  status: z.enum([
    "On track",
    "Needs attention",
    "Behind",
    "Temporarily high priority",
  ]),
  reason: z.string().max(20000),
  catchUpMinutes: z.number().int().min(0).max(180),
});

// Shared primitive validators are injected to avoid a domain-model import cycle.
export function dailyPlanSchema(
  id: z.ZodString,
  instant: z.ZodType<string>,
  date: z.ZodType<string>,
  zone: z.ZodType<string>,
) {
  const planItems = z
    .array(
      z.object({
        role: z.enum(["Main", "Secondary"]),
        courseId: id,
        lectureId: id.optional(),
        focus: z.string().trim().min(1).max(300),
        minutes: z.number().int().min(1).max(180),
        reason: z.string().min(1).max(20000),
        source: z.enum(["Recommendation", "Personal Plan"]),
        status: z.enum(["pending", "completed", "partial", "skipped"]),
        sessionId: id.optional(),
      }),
    )
    .min(1)
    .max(2);
  return z.object({
    id,
    createdAt: instant,
    updatedAt: instant,
    semesterId: id,
    day: date,
    zone,
    locked: z.boolean(),
    notes: z.string().max(20000),
    maximumMinutes: z.number().int().min(30).max(180),
    lockHistory: z.array(
      z.object({ at: instant, action: z.enum(["locked", "unlocked"]) }),
    ),
    items: planItems,
    previousAssignments: z
      .array(
        z.object({
          at: instant,
          items: planItems,
        }),
      )
      .optional(),
  });
}
