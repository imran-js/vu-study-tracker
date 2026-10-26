# CS101 official schedule update — 26 October 2026

Implemented in the existing GitHub Pages Study Desk checkout. The supplied official VU announcement is the source; no dates, times, individual quiz weights, or module mappings were inferred.

| Activity | Opening / exam date | Closing date | Topics |
| --- | --- | --- | --- |
| Semester Quiz 1 | 2026-11-02 | 2026-11-05 | 1–38 |
| Semester Quiz 2 | 2026-11-09 | 2026-11-12 | 38–51 |
| GDB | 2026-11-16 | 2026-11-18 | 51–65 |
| Semester Quiz 3 | 2026-12-01 | 2026-12-03 | 51–95 |
| Midterm Exam | 2026-12-07 | 2026-12-07 | 1–108 |
| Semester Quiz 4 | 2026-12-22 | 2026-12-24 | 95–108 |
| Semester Quiz 5 | 2026-12-29 | 2026-12-31 | 146–162 |
| Semester Quiz 6 | 2027-01-05 | 2027-01-07 | 162–193 |
| Final Exam | 2027-01-25 | 2027-01-25 | 108–230 |

Grading appears on Assessments and the CS101 course detail: coursework 40 = GDB 5 + Midterm 20 + Quizzes 15; Final 60. All three passing conditions are required: coursework >= 8/40, final >= 12/60, overall Net Score strictly > 40%.

## Data and planning behavior

- On load and save, existing Fall 2026 CS101 courses receive a one-time, persisted schedule update. No course is invented in an empty account. Other courses and semesters are untouched.
- Matches include Quiz 1 / Semester Quiz 1 / CS101 Quiz 1, GDB / Graded Discussion Board, Midterm / Mid-Term, and Final / Final Term. Matching record IDs, creation timestamps, titles, notes, URLs, status, completion, marks, and practice records remain intact. Missing activities are added. Existing duplicates retain their independent history; the update does not add another match or delete existing records.
- Existing study sessions, Calendar mappings, alerts, resources, lectures and plans remain intact. Official dates and coverage replace outdated schedule metadata. Calendar mappings retain event IDs so the existing Calendar integration can update those events according to the user's existing sync preferences.
- Dates are date-only; weekday labels are calculated from dates. Existing timed/end-time metadata for matching activities is replaced by the supplied date-only schedule.
- Verified topic numbers remain unconfirmed as a mapping to tracked modules. Readiness cannot fabricate progress from unrelated module numbering.
- The existing Monday–Sunday framework is retained: CS101, ENG101, MGT101, MGT211, ISL202, Practice, Catch-up. Today is frozen before the schedule update on load; existing assignments and future drafts are not rewritten. New recommendations from tomorrow use the new assessment information within the fixed framework.
- The optional course update marker survives validation, cloud saves, backup/restore and course editing. Later personal edits are not overwritten on subsequent loads or saves. The existing baseline progress marker also survives course editing.

## Files changed for this request

- `src/domain/cs101-schedule.ts` — official data and matching update.
- `src/domain/cs101-schedule.test.ts` — schedule, preservation, idempotence, backup, scope and planning regression checks.
- `src/domain/model.ts` — optional persisted schedule version.
- `src/app/App.tsx` — apply update on load after freezing Today.
- `src/app/actions.ts` — apply update on saves/imports after freezing Today.
- `src/app/Editor.tsx` — retain schedule and baseline markers on course edits.
- `src/features/assessments/Cs101Grading.tsx` — official grading and passing requirements.
- `src/features/assessments/Assessments.tsx` — show grading with course filtering.
- `src/features/courses/Courses.tsx` — show grading in course detail.
- `src/app/ui.test.tsx` — schedule/grading/save/course-edit integration checks; isolate generic synthetic-course fixtures from Fall 2026 weekday rules.
- `src/data/repository.test.ts`, `src/data/supabase.test.ts` — isolate generic storage fixtures from Fall 2026 weekday rules.
- `CS101-SCHEDULE-VERIFICATION.md` — this report.

Pre-existing uncommitted weekly framework work remains in place. This inventory describes changes made for the CS101 request, not every existing working-tree change.

## Validation and delivery

- Full Vitest suite: **9 test files, 109 tests passed**.
- Production TypeScript/Vite build: **passed**.
- Git whitespace check: **passed** (line-ending notices only).
- Production preview server started successfully. The direct loopback HTTP check was denied by environment socket permissions, so full browser visual verification is not claimed. Interface behavior was verified with React Testing Library.
- No deployment, Git push, cloud-account sign-in, or direct production-data changes were performed. After deployment, the update applies when the signed-in user reloads the application, through the existing revision-checked storage path.
