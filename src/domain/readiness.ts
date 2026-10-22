import type { Assessment, Dataset } from "./model";
import { unknownCoverage } from "./planner-model";

export function assessmentReadiness(d: Dataset, assessment: Assessment) {
  const c = assessment.coverage || unknownCoverage();
  const unavailable = (reason: string) => ({
    calculable: false as const,
    reason,
    studied: undefined,
    revised: undefined,
    total: undefined,
    practice: assessment.practice,
  });
  if (c.type === "unknown" || c.verification === "awaiting")
    return unavailable("Topic coverage: Awaiting official VU announcement");
  if (c.verification !== "verified")
    return unavailable(
      "Coverage is provisional; awaiting official verification",
    );
  if (
    !["VULMS", "Official VU Announcement", "Official Handout"].includes(
      c.sourceType,
    ) ||
    !c.sourceNote.trim()
  )
    return unavailable("An official coverage source is required");
  if (
    c.type !== "numbered" ||
    c.mapping !== "direct" ||
    c.startUnit === undefined ||
    c.endUnit === undefined
  )
    return unavailable(
      "Coverage cannot yet be mapped confidently to tracked study units",
    );
  const units = d.lectures.filter(
    (l) =>
      l.courseId === assessment.courseId &&
      !l.excluded &&
      l.number >= c.startUnit! &&
      l.number <= c.endUnit!,
  );
  const total = c.endUnit - c.startUnit + 1;
  if (new Set(units.map((l) => l.number)).size !== total)
    return unavailable(
      "Some covered study units are missing or excluded; readiness cannot be calculated",
    );
  return {
    calculable: true as const,
    reason: "Verified coverage mapped to tracked study units",
    total,
    studied: units.filter((l) => l.status === "completed").length,
    revised: units.filter(
      (l) =>
        l.status === "completed" &&
        d.revisions.some((r) => r.lectureId === l.id),
    ).length,
    practice: assessment.practice,
  };
}
