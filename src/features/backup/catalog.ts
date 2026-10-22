import { z } from "zod";
import {
  isDriveUrl,
  stamp,
  validateData,
  type Dataset,
} from "../../domain/model";
import { driveFileId } from "../../integrations/google-drive";

const title = z.string().trim().min(1).max(300);
const drive = z.string().refine(isDriveUrl, "Invalid Google Drive URL");
export const catalogSchema = z.object({
  format: z.literal("vu-study-catalog"),
  id: title,
  semesterName: title,
  courses: z
    .array(
      z.object({
        code: title,
        title,
        credits: z.number().min(0).max(100).optional(),
        folderUrl: drive,
        notes: z.string().max(20000),
        units: z
          .array(z.object({ number: z.number().int().positive(), title }))
          .max(2000),
        resources: z
          .array(
            z.object({
              title,
              url: drive,
              tags: z.array(z.string().min(1).max(100)).max(100),
              unitNumber: z.number().int().positive().optional(),
            }),
          )
          .max(20000),
      }),
    )
    .min(1)
    .max(100),
});
export type CourseCatalog = z.infer<typeof catalogSchema>;
const normalize = (s: string) =>
  s.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

// Additive import: unrelated semesters, user edits, completion and schedules survive.
export function mergeCatalog(input: Dataset, raw: unknown) {
  const catalog = catalogSchema.parse(raw);
  const data = structuredClone(input);
  const counts = { courses: 0, lectures: 0, resources: 0 };
  const codes = new Set<string>();
  for (const course of catalog.courses) {
    const key = normalize(course.code);
    if (codes.has(key)) throw new Error("Duplicate course code in catalog");
    codes.add(key);
    const numbers = course.units.map((u) => u.number);
    if (
      new Set(numbers).size !== numbers.length ||
      numbers.some((n, i) => n !== i + 1)
    )
      throw new Error(
        "Catalog units must be consecutive, unique and start at 1",
      );
    if (
      course.resources.some(
        (r) => r.unitNumber && !numbers.includes(r.unitNumber),
      )
    )
      throw new Error("Resource links to an unknown catalog unit");
  }
  let semester = data.semesters.find(
    (s) => normalize(s.name) === normalize(catalog.semesterName),
  );
  if (!semester) {
    semester = { ...stamp(), name: catalog.semesterName, archived: false };
    data.semesters.push(semester);
  }
  for (const source of catalog.courses) {
    const matches = data.courses.filter(
      (c) =>
        c.semesterId === semester.id &&
        normalize(c.code) === normalize(source.code),
    );
    if (matches.length > 1)
      throw new Error(
        `Resolve duplicate ${source.code} courses before importing`,
      );
    let course = matches[0];
    if (!course) {
      course = {
        ...stamp(),
        semesterId: semester.id,
        code: source.code,
        title: source.title,
        credits: source.credits,
        priority: "normal",
        lectureTotal: source.units.length || undefined,
        notes: source.notes,
        folderUrl: source.folderUrl,
      };
      data.courses.push(course);
      counts.courses++;
    } else {
      if (!course.folderUrl) course.folderUrl = source.folderUrl;
      if (!course.notes) course.notes = source.notes;
      if (course.credits === undefined) course.credits = source.credits;
      if (
        course.lectureTotal === undefined &&
        source.units.length &&
        !data.lectures.some(
          (l) => l.courseId === course.id && l.number > source.units.length,
        )
      )
        course.lectureTotal = source.units.length;
    }
    for (const unit of source.units) {
      if (
        !data.lectures.some(
          (l) => l.courseId === course.id && l.number === unit.number,
        )
      ) {
        data.lectures.push({
          ...stamp(),
          courseId: course.id,
          number: unit.number,
          title: unit.title,
          status: "not started",
          excluded: false,
        });
        counts.lectures++;
      }
    }
    for (const resource of source.resources) {
      const providerFileId = driveFileId(resource.url);
      if (
        data.resources.some(
          (r) =>
            r.courseId === course.id &&
            (r.url === resource.url ||
              (providerFileId &&
                (r.providerFileId || driveFileId(r.url)) === providerFileId)),
        )
      )
        continue;
      const lectureId = resource.unitNumber
        ? data.lectures.find(
            (l) => l.courseId === course.id && l.number === resource.unitNumber,
          )?.id
        : undefined;
      data.resources.push({
        ...stamp(),
        courseId: course.id,
        lectureId,
        title: resource.title,
        url: resource.url,
        tags: resource.tags,
        provider: "google-drive",
        providerFileId,
      });
      counts.resources++;
    }
  }
  return { data: validateData(data), counts };
}
