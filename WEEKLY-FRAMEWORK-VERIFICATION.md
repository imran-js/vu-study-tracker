# Fixed weekly planning — 26 October 2026

The Fall 2026 planner now uses Monday–Sunday weeks: CS101, ENG101,
MGT101, MGT211, ISL202, Practice, Catch-up. Before 26 October the previous
planner remains available; other semesters retain their existing behavior.

The first week targets existing syllabus unit 3, the following week unit 4,
and so on. Missing syllabus records are identified rather than invented.
Unfinished units remain in progress and are eligible for weekend catch-up.
Verified upcoming assessment coverage can override content order within an
assigned subject's slot. Deadline ranking also guides weekend preparation.

On opening the app and saving changes, the first two existing syllabus units
of each of the five subjects are marked complete once. A backward-compatible
optional list of baseline unit IDs prevents future loads from re-completing
units the user explicitly reopens. Existing completion timestamps, revision
flags/dates, exclusions, resource links, sessions and assessment data survive.
The baseline creates no study-time or revision records. Newly imported
syllabus records receive the same baseline; missing units are never fabricated.

Today is saved and locked automatically from 26 October, including when a
future draft becomes Today. Existing assignments and notes are preserved.
Today cannot be unlocked or reassigned; logging outcomes, actual time and
academic completion remains available. Future days can be edited using the
weekly overview. Existing saved history and future drafts are retained.

Completion, actual time, practice and revision remain separate records.
The Courses view now provides a visible Needs Revision toggle without
reopening completed units. The weekly overview shows all seven slots,
dates, unit titles, statuses and future-day editing.

Validation:

- Full Vitest suite, including eight new domain regression cases and one
  interface integration case for all seven slots, baseline progress, locked
  Today and saving a future draft.
- Production TypeScript/Vite build.
- Git whitespace check.
- Local preview reached the sign-in page in Chrome. Further browser
  interaction stopped when the browser reported user activity; full visual
  and narrow-screen verification has not been completed.

No production deployment or cloud-account sign-in was performed.
