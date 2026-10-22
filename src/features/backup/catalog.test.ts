import { describe, expect, it } from "vitest";
import { initialData, stamp, validateData } from "../../domain/model";
import { mergeCatalog, type CourseCatalog } from "./catalog";

const catalog: CourseCatalog = {
  format: "vu-study-catalog",
  id: "test",
  semesterName: "Semester 1 — Fall 2026",
  courses: [
    {
      code: "TEST101",
      title: "Synthetic course",
      credits: 3,
      folderUrl: "https://drive.google.com/drive/folders/synthetic",
      notes: "Synthetic source",
      units: [
        { number: 1, title: "Module 1: Example" },
        { number: 2, title: "Module 2: Example" },
      ],
      resources: [
        {
          title: "Synthetic slide",
          url: "https://drive.google.com/file/d/synthetic-slide/view?resourcekey=keep",
          tags: ["Slides"],
          unitNumber: 1,
        },
      ],
    },
  ],
};
describe("additive course catalog import", () => {
  it("creates courses and units, associates resources, and preserves original URLs", () => {
    const source = initialData();
    const { data, counts } = mergeCatalog(source, catalog);
    expect(counts).toEqual({ courses: 1, lectures: 2, resources: 1 });
    expect(source.courses).toHaveLength(0);
    expect(data.resources[0].lectureId).toBe(data.lectures[0].id);
    expect(data.resources[0].url).toContain("resourcekey=keep");
    expect(data.lectures.every((l) => l.status === "not started")).toBe(true);
    expect(data.assessments).toHaveLength(0);
  });
  it("is idempotent and retains edited titles, notes and completion", () => {
    const first = mergeCatalog(initialData(), catalog).data;
    first.courses[0].title = "My title";
    first.courses[0].notes = "My notes";
    first.lectures[0].title = "My lecture";
    first.lectures[0].status = "completed";
    first.lectures[0].completedAt = new Date().toISOString();
    const second = mergeCatalog(first, catalog);
    expect(second.counts).toEqual({ courses: 0, lectures: 0, resources: 0 });
    expect(second.data).toEqual(first);
  });
  it("keeps another semester's course with the same code independent", () => {
    const original = mergeCatalog(initialData(), catalog).data;
    const semester = { ...stamp(), name: "Another semester", archived: true };
    original.semesters.push(semester);
    original.courses[0].semesterId = semester.id;
    const next = mergeCatalog(original, catalog).data;
    expect(next.courses).toHaveLength(2);
    expect(next.courses[0].semesterId).toBe(semester.id);
    validateData(next);
  });
  it("rejects duplicate unit numbers and invalid lecture links without changing data", () => {
    const original = initialData();
    const before = structuredClone(original);
    const bad = structuredClone(catalog);
    bad.courses[0].units[1].number = 1;
    expect(() => mergeCatalog(original, bad)).toThrow("consecutive");
    const badLink = structuredClone(catalog);
    badLink.courses[0].resources[0].unitNumber = 99;
    expect(() => mergeCatalog(original, badLink)).toThrow(
      "unknown catalog unit",
    );
    expect(original).toEqual(before);
  });
});
