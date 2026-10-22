import type { Assessment } from "../../domain/model";
import { useStudy } from "../../app/context";
import { assessmentReadiness } from "../../domain/readiness";
import { unknownCoverage } from "../../domain/planner-model";
export function Readiness({ assessment: a }: { assessment: Assessment }) {
  const { data: d } = useStudy();
  const r = assessmentReadiness(d, a),
    c = a.coverage || unknownCoverage();
  return (
    <div className="assessment-readiness">
      <p>
        {c.type === "unknown" || c.verification === "awaiting"
          ? "Topic coverage: Awaiting official VU announcement"
          : `Coverage: ${c.officialText || (c.type === "numbered" ? `Units/topics ${c.startUnit}–${c.endUnit}` : "Text scope entered")}`}
      </p>
      <p className="meta">
        {r.calculable
          ? `Studied: ${r.studied} / ${r.total} · Revised: ${r.revised} / ${r.total} · ${r.studied === r.total ? "Covered; review / practice separately" : "Preparing"}`
          : `Readiness: Cannot calculate yet · ${r.reason}`}
      </p>
      <p className="meta">
        Practice mastery:{" "}
        {r.practice
          ? `${r.practice.percent}% · recorded ${r.practice.recordedAt.slice(0, 10)} · ${r.practice.sourceNote}`
          : "Not recorded"}
      </p>
      <details>
        <summary>Coverage source and dependencies</summary>
        <p className="meta">
          {c.sourceType} · {c.verification} ·{" "}
          {c.sourceNote || "No reference entered"}
        </p>
        {c.type === "numbered" && (
          <p className="meta">
            Entered range: {c.startUnit}–{c.endUnit} · mapping {c.mapping}
          </p>
        )}
        {c.readingDependency && (
          <p className="prewrap">Reading: {c.readingDependency}</p>
        )}
        {(c.readingStart || c.readingEnd) && (
          <p>
            Reading range: {c.readingStart ?? "?"}–{c.readingEnd ?? "?"}
          </p>
        )}
        {a.marks !== undefined && <p>Marks: {a.marks}</p>}
      </details>
    </div>
  );
}
