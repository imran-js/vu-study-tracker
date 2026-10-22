# Semester planner patch — 23 October 2026

## Implemented

- Today Main/Secondary plans with focus, planned minutes, notes, source/reasons and explicit confirmation/lock history. A separately saved manual unlock is required before editing a locked assignment. New assessments, status changes and recommendations do not rewrite it.
- Transparent Tomorrow ranking from assessment opening/deadline, verified incomplete coverage, course status, study recency/frequency, weak/revision flags, catch-up and scheduled workload. Manually saved future drafts remain available for review; recommendations stay separate until accepted.
- Conservative normal/light/maximum budgets (90/65/120 minutes), 70/30 split, existing-session budget deductions and gradual capped recovery. Later academic completion or recorded study reduces catch-up need without rewriting missed history.
- Active-course status cards, original-date plan history and calendar entries. VU001, inactive offerings and archived semesters do not enter recommendations. Unknown denominators stay unknown.
- Explicit plan outcome controls, existing-session timers and 30/60-minute actual logs, separate academic completion and revision flags. Overlap/future-time validation remains authoritative.
- Optional assessment coverage, verification, numbered mapping, reading dependency/range, marks, source/ref and manually sourced practice results. Unknown/provisional/mismatched scope produces no readiness percentage. Studied and unique revised counts are distinct from practice.

## Schema and preservation

Domain schema is **3**; physical IndexedDB version and Supabase table/RPC are unchanged. Migration `2 → 3` preserves existing IDs, semesters, course metadata, lecture statuses, revisions, assessments, sessions, timer, Drive URLs and settings, adding only planner defaults, empty plans and unknown coverage. The existing `1 → 2` migration chains into it. New exports include planner records; legacy v1/v2 exports migrate; newer unsupported formats still reject safely. Explicit full restore remains a confirmed replacement operation and is the deliberate exception to assignment/history edit protection.

The private five-course catalog was independently merged and migrated through the actual domain validators: **5 courses, 341 study units, 387 resources**. Existing lecture and resource collections were compared before/after with no changes. No personal catalog or URLs were added to application sources or build assets.

## Automated checks

The complete suite passes: **55 tests**, including the original suite and 20 added checks covering locked Today vs new assessment, adaptive Tomorrow, separately persisted unlock, immutable missed/partial history, capped and retired catch-up, manual/automatic workload limits, existing workload, unknown/provisional/unmapped readiness, studied vs unique revision vs practice, scope selection without borrowing another assessment's syllabus, export/restore, v2 preservation, malformed plan references, active-course exclusions, same-RPC cloud schema support, real IndexedDB upgrade and commit-boundary lock enforcement with explicit restore.

Production TypeScript compilation and Vite build pass. React and Supabase chunks are separated; no large-chunk warning remains.

## Browser checks

Performed on disposable browser-only records at a separate loopback origin; no test writes were made to the user's real cloud account.

- Restored synthetic five-course backup using the existing confirmed restore flow.
- Confirmed and locked Today at 90 minutes.
- Added an urgent assessment: the rendered Today panel remained exactly unchanged while Tomorrow's Main switched to the urgent course.
- Verified unknown coverage shows Awaiting official VU announcement / Cannot calculate yet.
- Entered synthetic official numbered scope with explicit mapping/reference: display showed Studied 0/4 and Revised 0/4 separately; practice remained Not recorded.
- Explicitly unlocked, replanned and re-locked Today; the changed assignment and lock survived reload.
- Toggled a light-day recommendation to 65 minutes and saved Tomorrow as an unlocked draft.
- Inspected desktop and 390px phone layouts and the mobile plan dialog. No horizontal document overflow in the phone check. Screenshots in ignored `qa-artifacts/` use synthetic records.

## Remaining manual checks / limitations

- The schema-3 Supabase adapter is exercised with authenticated SDK mocks, including owner/session changes and server conflict failures. The established owner-only policies and RPC are unchanged. An authenticated live planner save/reload on the user's account and a second-device conflict test still require the user's session; do not mistake mocks for live end-to-end proof.
- Before first real planner save, export a recovery backup. After updating/reloading, confirm all five courses and prior progress remain visible. Lock a real plan, reload, then check it on another signed-in device. Old tabs should be refreshed; stale saves will be rejected.
- Historical Missed/Partial labels are derived from the original dated plan and explicit outcomes/linked time; no autonomous job rewrites or reschedules old assignments. Deliberate corrections to underlying actual time can affect the displayed outcome.
- Manually entered flags, practice scores and source verification remain user assertions. No official assessment dates or syllabus were fabricated.
- Offline writes, live subscriptions, scraping, AI calls, Calendar OAuth, GPA, push notifications, gamification, social features and Drive crawling are deferred as requested.

## Files changed

| Area | Files |
|---|---|
| Domain | `src/domain/model.ts`, new `planner-model.ts`, new `planner.ts`, new `readiness.ts` |
| Application | `src/app/App.tsx`, `Editor.tsx`, `actions.ts`, `context.tsx`, new `planner-actions.ts` |
| Planner UI | new `src/features/planner/Planner.tsx`, `src/features/today/Today.tsx`, `src/features/settings/Settings.tsx` |
| Assessment/calendar UI | `src/features/assessments/Assessments.tsx`, new `Readiness.tsx`, `src/features/calendar/Calendar.tsx` |
| Migration/backup | `src/data/migrations.ts`, `src/features/backup/backup.ts` |
| Tests | new `src/domain/planner.test.ts`, `src/domain/study.test.ts`, `src/data/repository.test.ts`, `src/data/supabase.test.ts` |
| Build/style | `src/styles.css`, `vite.config.ts`, `package.json`, `package-lock.json` |
| Documentation | `README.md`, `ARCHITECTURE.md`, `VERIFICATION.md`, this report |
