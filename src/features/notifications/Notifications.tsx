import { useState } from "react";
import { useStudy } from "../../app/context";
import { studyAlerts, acknowledgeAlert } from "../../domain/alerts";
import { PageHeading, Empty, Pill } from "../../shared/ui";
export function Notifications() {
  const { data: d, semesterId, run, edit } = useStudy();
  const [showDismissed, setShowDismissed] = useState(false);
  const alerts = studyAlerts(d, semesterId).filter(
    (a) => showDismissed || a.state !== "dismissed",
  );
  return (
    <>
      <PageHeading eyebrow="ACADEMIC ATTENTION" title="Notifications">
        Deadline and revision alerts do not change your locked Today plan.
        Alerts update while Study Desk is open; these are not browser push
        notifications.
      </PageHeading>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={showDismissed}
          onChange={(e) => setShowDismissed(e.target.checked)}
        />
        Show dismissed alerts
      </label>
      {!alerts.length && (
        <Empty title="You’re all caught up.">
          Upcoming deadlines and revision needs will appear here.
        </Empty>
      )}
      <div className="notification-list">
        {(["Critical", "Important", "Informational"] as const).map((level) => {
          const group = alerts.filter((a) => a.level === level);
          return group.length ? (
            <section key={level} aria-label={`${level} notifications`}>
              <h2 className="notification-group-title">
                {level} <span className="muted">({group.length})</span>
              </h2>
              {group.map((a) => (
                <article
                  key={a.key}
                  className="panel notification-card"
                  data-level={a.level}
                  data-state={a.state || "unread"}
                >
                  <div className="button-row">
                    <Pill tone={a.level === "Critical" ? "danger" : ""}>
                      {d.courses.find((c) => c.id === a.courseId)?.code ||
                        "Course"}
                    </Pill>
                    <span>
                      {a.state || "Unread"} · Relevant {a.relevance}
                    </span>
                  </div>
                  <h3>{a.title}</h3>
                  <p className="prewrap">{a.reason}</p>
                  <div className="button-row">
                    {a.assessmentId && (
                      <button
                        onClick={() =>
                          edit({ kind: "assessment", id: a.assessmentId })
                        }
                      >
                        View assessment
                      </button>
                    )}
                    <button
                      onClick={() => edit({ kind: "course", id: a.courseId })}
                    >
                      View course
                    </button>
                    <button
                      disabled={a.state === "read"}
                      onClick={() =>
                        void run(
                          (d) => acknowledgeAlert(d, a, "read"),
                          "Alert marked read",
                        )
                      }
                    >
                      Mark read
                    </button>
                    <button
                      disabled={a.state === "dismissed"}
                      onClick={() =>
                        void run(
                          (d) => acknowledgeAlert(d, a, "dismissed"),
                          "Alert dismissed until the situation materially changes",
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null;
        })}
      </div>
    </>
  );
}
