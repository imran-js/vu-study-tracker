import {
  stamp,
  validateData,
  type Dataset,
  type Lecture,
  type Interval,
} from "../domain/model";
import type { Snapshot, StudyRepository } from "../data/contracts";
import { assertPlanTransitions, freezeToday } from "../domain/planner";
import { applyWeeklyBaseline } from "../domain/weekly-framework";
import { applyCs101Schedule } from "../domain/cs101-schedule";

export async function commit(
  repository: StudyRepository,
  snapshot: Snapshot,
  mutate: (d: Dataset) => void,
  options?: {
    restore?: boolean;
    topicEditPlanId?: string;
    scheduleResetPlanId?: string;
  },
): Promise<Snapshot> {
  const next = structuredClone(snapshot.data);
  mutate(next);
  applyWeeklyBaseline(next);
  freezeToday(next, next.settings.activeSemesterId);
  applyCs101Schedule(next);
  if (!options?.restore)
    assertPlanTransitions(
      snapshot.data,
      next,
      options?.topicEditPlanId,
      options?.scheduleResetPlanId,
    );
  return repository.replace(validateData(next), snapshot.revision);
}
export function setLectureStatus(
  d: Dataset,
  id: string,
  status: Lecture["status"],
) {
  const l = d.lectures.find((l) => l.id === id)!;
  l.status = status;
  l.updatedAt = new Date().toISOString();
  l.completedAt =
    status === "completed" ? l.completedAt || l.updatedAt : undefined;
}
export function revise(d: Dataset, id: string, nextRevision?: string) {
  const l = d.lectures.find((l) => l.id === id)!;
  if (l.status !== "completed")
    throw new Error("Complete the lecture before recording a revision.");
  d.revisions.push({
    ...stamp(),
    lectureId: id,
    revisedAt: new Date().toISOString(),
  });
  l.nextRevision = nextRevision;
  l.needsRevision = false;
  l.updatedAt = new Date().toISOString();
}
export function generateLectures(d: Dataset, courseId: string) {
  const c = d.courses.find((c) => c.id === courseId)!;
  if (c.lectureTotal === undefined)
    throw new Error("Set a confirmed lecture total first.");
  for (let n = 1; n <= c.lectureTotal; n++)
    if (!d.lectures.some((l) => l.courseId === c.id && l.number === n))
      d.lectures.push({
        ...stamp(),
        courseId,
        number: n,
        title: `Lecture ${n}`,
        status: "not started",
        excluded: false,
      });
}
export function startTimer(
  d: Dataset,
  sessionId: string,
  now = new Date().toISOString(),
) {
  if (d.timer) throw new Error("Finish or discard the current timer first.");
  const s = d.sessions.find((s) => s.id === sessionId);
  if (!s || s.status === "cancelled")
    throw new Error("Choose an available session.");
  d.timer = { sessionId, startedAt: now, intervals: [], savedAt: now };
}
export function toggleTimer(d: Dataset, now = new Date().toISOString()) {
  if (!d.timer) return;
  if (d.timer.startedAt) {
    if (Date.parse(now) > Date.parse(d.timer.startedAt))
      d.timer.intervals.push({ start: d.timer.startedAt, end: now });
    d.timer.startedAt = undefined;
  } else d.timer.startedAt = now;
  d.timer.savedAt = now;
}
export function timerIntervals(
  d: Dataset,
  end = new Date().toISOString(),
): Interval[] {
  if (!d.timer) return [];
  const intervals = [...d.timer.intervals];
  if (d.timer.startedAt && Date.parse(end) > Date.parse(d.timer.startedAt))
    intervals.push({ start: d.timer.startedAt, end });
  return intervals;
}
export function finishTimer(d: Dataset, end: string) {
  if (!d.timer) return;
  if (d.timer.startedAt && Date.parse(end) <= Date.parse(d.timer.startedAt))
    throw new Error("Finish time must follow the current timer start.");
  const s = d.sessions.find((s) => s.id === d.timer!.sessionId)!;
  s.intervals.push(...timerIntervals(d, end));
  s.status = "completed";
  s.updatedAt = new Date().toISOString();
  d.timer = undefined;
}
