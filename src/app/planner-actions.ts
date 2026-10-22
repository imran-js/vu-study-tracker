import { startTimer } from "./actions";
import { dayOf } from "../domain/dates";
import { stamp, type Dataset, type DailyPlan } from "../domain/model";

function itemFor(
  d: Dataset,
  planId: string,
  role: "Main" | "Secondary",
  now: string,
) {
  const plan = d.dailyPlans.find((p) => p.id === planId);
  if (!plan || plan.day !== dayOf(now, plan.zone))
    throw new Error("Quick logging is available only for today's plan");
  const item = plan.items.find((i) => i.role === role);
  if (!item) throw new Error("Plan item is missing");
  return { plan, item };
}
function ensureSession(
  d: Dataset,
  plan: DailyPlan,
  item: DailyPlan["items"][number],
) {
  let session = d.sessions.find((s) => s.id === item.sessionId);
  if (!session) {
    session = {
      ...stamp(),
      semesterId: plan.semesterId,
      courseId: item.courseId,
      lectureId: item.lectureId,
      title: `${plan.day} ${item.role}: ${item.focus}`.slice(0, 300),
      notes:
        "Daily plan study time; academic completion is recorded separately.",
      status: "planned",
      intervals: [],
    };
    d.sessions.push(session);
    item.sessionId = session.id;
  }
  return session;
}
export function logPlanStatus(
  d: Dataset,
  planId: string,
  role: "Main" | "Secondary",
  status: DailyPlan["items"][number]["status"],
  now = new Date().toISOString(),
) {
  const { plan, item } = itemFor(d, planId, role, now);
  item.status = status;
  plan.updatedAt = now;
}
export function startPlanTimer(
  d: Dataset,
  planId: string,
  role: "Main" | "Secondary",
  now = new Date().toISOString(),
) {
  const { plan, item } = itemFor(d, planId, role, now);
  if (d.timer) throw new Error("Finish the current timer first");
  const session = ensureSession(d, plan, item);
  startTimer(d, session.id, now);
}
export function logPlanMinutes(
  d: Dataset,
  planId: string,
  role: "Main" | "Secondary",
  minutes: number,
  now = new Date().toISOString(),
) {
  const { plan, item } = itemFor(d, planId, role, now);
  if (d.timer)
    throw new Error("Finish or discard your current timer before logging time");
  if (![30, 60].includes(minutes)) throw new Error("Choose 30 or 60 minutes");
  const session = ensureSession(d, plan, item);
  session.intervals.push({
    start: new Date(Date.parse(now) - minutes * 60000).toISOString(),
    end: now,
  });
  session.updatedAt = now;
  session.status = "completed";
  // Status and academic completion are explicit, separate user actions.
}
