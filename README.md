# Study Desk · Virtual University

A browser-first personal study tracker built with React, TypeScript, Vite, and IndexedDB. Starts with an empty **Semester 1 — Fall 2026**. No actual courses, lecture counts, or deadlines are preloaded.

## Appearance and readability

Use the header theme control or **Settings & Data → Appearance** to choose Light, Dark, or System (default). Choose Compact, Default, or Large text in Settings. These preferences stay in this browser and do not change or synchronize your study records. See [UI verification](UI-VERIFICATION.md) for the responsive and accessibility checks.

## Daily semester planner

Today is the operational screen: review Main and optional Secondary study items, their focus, minutes and reasons, then choose **Confirm & lock Today**. Once locked, no assessment, priority, course-status or progress change rewrites that assignment. Use **Unlock today's plan**, save the unlock, and deliberately edit/replan before locking again. Logging completion or time is allowed while locked; it does not unlock or change the assignment. Future days can be saved as editable drafts; only the active Today can be locked.

Tomorrow recommendations recalculate from current records. Ranking is deterministic and visible: assessment opening/deadline urgency, verified incomplete coverage, manually flagged behind/attention/high priority, days since recorded study, recent frequency, revision/weak flags, gradual catch-up and existing scheduled workload. Scores and reasons appear under the preview. No AI calls or LMS scraping. A saved manual draft is preserved; use the latest recommendation explicitly when reviewing it.

Default budgets are **90 minutes normal, 65 light, 120 maximum**, configurable in Settings (light ≤ normal ≤ maximum, at most 180). The usual split is 70% Main / 30% Secondary. Existing scheduled sessions consume the available recommendation budget. Several behind courses do not create a longer day: catch-up changes ranking, capped at 20 points per course, and is spread across following days. Lowering a setting never rewrites an already locked plan; its original limit is retained.

Previous plans stay on their original calendar date. History and Calendar display Completed, Partial or Missed from explicit item outcomes and linked actual time. Pending work becomes Missed after its date passes, without rescheduling or rewriting its stored assignment. Historical plans are read-only. Recovery influences tomorrow onward; all missed work is not stacked onto one day.

**Completed / Partial / Skipped** logs a plan outcome. **Start timer / Log 30 min / Log 60 min** reuse the existing study-session intervals (quick logs mean the last 30/60 actual minutes and reject overlaps). Neither action completes academic content. Use **Mark unit complete** or course lecture controls explicitly. **Needs revision** flags the unit; recording an actual revision clears that weak flag. Reading, revising and practice remain distinct.

Assessment coverage defaults to **Awaiting official VU announcement**, even when dates are known. Expand the assessment's coverage/source details to enter official text, numbered scope, reading dependencies, marks, source type/reference and verification. The app never infers a quiz syllabus. Readiness counts require verified official scope, a reference, explicit confirmation that numbering matches tracked units, and all covered units present and included. This matters for courses whose video topics and handout chapters use different numbers. Otherwise readiness says **Cannot calculate yet**. Studied counts completed covered units; revised counts uniquely revised completed units. Practice mastery is a separately entered result with its own source and timestamp, never a calculated completion score.

The semester-status cards show active offerings, their known/unknown progress, current and next unit, last study date, assessment and revision flags. Behind/attention status is manually set with an optional explanation; no relative pace or unannounced weekly syllabus is assumed. Completed/inactive courses and VU001 are excluded from recommendations.

### Data upgrade

The previous schema **3** added daily plans, planner settings, optional course planning / weak-unit fields, and optional assessment scope and practice records. Ordered migrations support schema 1 and 2 backups and browser/cloud snapshots, preserving IDs, existing academic records and Drive URLs. Earlier assessments receive unknown coverage; no plans, deadlines or progress are fabricated. Exports include all planner records. Keep a backup before upgrading; older clients cannot open schema 3 exports.

No Supabase SQL change or second database is required: the same owner-scoped JSON snapshot and revision-checked RPC store the upgraded data. Cloud saves still require connectivity, and stale saves fail rather than overwrite newer records. Full backup restore is the explicit, confirmed exception to normal locked/history edit protection.

## Supabase cloud storage

Optional private cloud storage and email/password sign-in are implemented. The local `.env.local` is configured for your project and ignored by Git. For a new installation, complete the database and authentication setup in [supabase/README.md](supabase/README.md). The existing project already has these tables/policies. Browser-only mode remains available. The planner uses the same storage contract; testing does not require changing actual user records.

For GitHub deployment, the workflow supplies the public client configuration described below. Reload to retrieve saves from another device; stale saves are rejected. Export backups separately.

The deployment workflow now supplies this project's public Supabase URL and publishable key as defaults; repository Actions variables can override them. These client values are intentionally public. Owner-only database rules protect study records. Never substitute a secret or service-role key.

## Private course catalog

A generic additive course-catalog importer is available during local development. Its input is `private/course-catalog.json`, which is ignored by Git and excluded from the production build. When this file exists, the signed-in local cloud workspace imports it once per account/catalog ID on load. Existing course titles, completion, assessments, timers, notes and schedules are preserved. Missing course metadata, numbered units and resource links are added, with duplicate resources matched by Drive ID. A local marker prevents repeating the same import on later reloads. Browser-only mode never automatically imports it. A failed cloud save reports an error and can be retried by reloading.

The endpoint is loopback-only, same-origin, development-only and uncached. Never expose the development server to the internet. Private data must remain outside `public/`, source imports and deployment assets. On the published website, the imported records load from the signed-in Supabase account; the catalog is not hosted there.

## Google Calendar and notifications (1.2)

Optional one-way Google Calendar mirroring and an in-app attention center are now available. Study Desk remains authoritative; neither Calendar results nor alerts rewrite locked Today plans. See [GOOGLE-CALENDAR.md](GOOGLE-CALENDAR.md) for connection, official-date confirmation, reminders, OAuth configuration, disconnect behavior and limitations.

Schema **4** adds Calendar preferences/mappings, date confirmations, type eligibility and notification receipts. Schema 3 snapshots migrate conservatively: no dates become verified and automatic sync starts off. Browser and Supabase storage use the same validation and existing repository; no SQL change is required. Exports include mappings/preferences/receipts but never Google authorization tokens. Older clients cannot open v4 backups; reload old tabs after deployment.

## Run on Windows

Install Node.js 22 LTS or a newer supported LTS release, and Git. Open PowerShell in this project folder:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173/**. Browser-only records are separate across origins, ports, profiles and devices; cloud records are shared when you sign in with the same study account. Stop the server with Ctrl+C. Use `npm.cmd` if PowerShell blocks the npm script shim.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --port 4173 --strictPort
```

Preview opens at http://localhost:4173/ and has its own records. Do not open `dist/index.html` directly through the filesystem. A web server is required. This version does not install an offline service worker or promise offline reopening.

## First steps

1. Read the storage explanation during onboarding.
2. Add a course with its real code and title. Leave its lecture total blank if unknown. A confirmed total may generate numbered lectures; generation preserves existing records.
3. Record lecture completion and individual revision events. Set an optional next revision date yourself.
4. Add assessments and verified dates. Types are editable in Settings. Date-only entries remain calendar dates; timed entries have a source timezone.
5. Plan sessions in Calendar, start a timer, or log actual start/end times. Completing a session does not automatically complete a lecture or assessment.
6. Save course folder URLs and original Google Drive resource links. Resource title/tag search works locally. Open in Google Drive to read/edit under the file's existing permissions.

Today orders open assessments by overdue, due today, and upcoming within seven days, then deadline within each group. Scheduled sessions and revision dates are displayed separately. Unknown deadlines are visible in Assessments but cannot appear in a dated calendar slot. Alerts are in-app only; closed-site scheduled notifications are not provided.

## Personal records and backups

These are three different things:

- **Hosting:** GitHub Pages serves the application files.
- **Code backup:** GitHub preserves code committed and pushed to the repository.
- **Personal records:** IndexedDB saves study records in this browser and origin. Neither publishing nor pushing code backs them up or synchronizes them.

Browser data may be cleared, evicted, or lost. Requesting persistent storage is helpful but not a backup guarantee. Other apps hosted on the same web origin share its security boundary; use a trusted GitHub Pages account. There is no application-level encryption or sign-in in this release.

### Export

In **Settings & Data → Export all records**, save the downloaded JSON somewhere private **outside the code repository**, for example a separate personal backup folder. Verify that the download completed. The displayed last-export time records a requested download, not proof that a file remains available.

Exports contain every semester, archived history, settings, types, notes, study intervals, an unfinished timer if present, and resource metadata/links. **They do not contain the actual Google Drive files, file revisions, permissions, credentials, or tokens.** Back up Drive documents separately when needed. Never commit a real export or private resource link to GitHub.

### Restore

1. Choose **Restore from file** and select the JSON backup (up to 25 MB).
2. The application validates the version, records, dates, IDs, relationships, and actual study intervals before displaying a preview.
3. Review the semester names and record counts. Download and verify a recovery backup of your current records.
4. Check the explicit replacement confirmation and choose **Replace & restore**.

Restore replaces the complete dataset in one IndexedDB transaction. Invalid input and failed transactions preserve existing data. Merge and partial import are intentionally deferred. Newer unsupported schemas are rejected; supported older schemas migrate in order. Restoring links does not restore or grant access to Drive files.

### Timer and time corrections

Only one timer can be active. Start/pause/resume state is persisted. After reload, review the unfinished timer and confirm its actual finish time, or discard it. This avoids assuming you studied while the computer was unattended. Discarding a timer preserves time saved previously to the session.

Actual intervals cannot overlap each other, including across semesters, and cannot extend into the future. Adjacent intervals are allowed. Planned sessions may overlap because they do not count as actual time. To correct actual time, expand **Recorded intervals** in the Calendar session register, remove the incorrect interval, and log the corrected interval. A session with actual time cannot be cancelled until that time is removed. Invalid or ambiguous daylight-saving local times are rejected rather than guessed.

## Progress definitions

- **Lecture completion:** completed included lectures / confirmed included lecture total. The confirmed course total is the full lecture total; explicitly excluded entered lectures are subtracted from its denominator. Unknown totals show counts and “total unknown.” Semester totals sum course counts; they do not average percentages.
- **Revision coverage:** completed included lectures with at least one revision / completed included lectures. Multiple revisions of one lecture count once for coverage.
- **Revision due:** completed included lectures with a next revision date on or before today.
- **Actual study time:** saved study intervals only, excluding timer pauses. Time crossing midnight is split using the display timezone.
- **Weekly target:** the selected week's actual minutes / optional target minutes. Use “Week containing” to inspect historical weeks. The target is a personal preference and applies to the selected summary, including when filtering by course.
- **Assessment completion:** submitted/completed / non-cancelled tracked assessments. This does not imply a passing grade.
- **Scheduled-session completion:** completed / non-cancelled sessions scheduled in the selected week, including future sessions in that week. Unscheduled sessions are excluded from this ratio.

Zero denominators display an empty state instead of a percentage. Asia/Riyadh and Monday are defaults. Changing the display timezone preserves timed instants and date-only values while changing reporting boundaries. A date-only assessment becomes overdue after its selected-zone calendar day ends; a timed assessment becomes overdue after its stated instant. Archived semesters remain accessible through the selector. Archive hides nothing permanently and does not prevent corrections; reopen it when resuming study.

## GitHub and GitHub Pages deployment

This checkout is prepared for repository-based GitHub Pages hosting. It uses hash routes (`/#/courses`) and relative build asset URLs, so both root and repository subpaths work without rewrite rules.

1. Create a new empty GitHub repository, for example `vu-study-desk`. Use a public repository for GitHub Free Pages, or a private repository with a plan that supports Pages. Do not initialize it with another README if pushing this existing project.
2. In this folder, initialize Git if needed and push application source only:

```powershell
git init -b main
git add .
git diff --cached --stat
git diff --cached
git commit -m "Build expandable browser-first study tracker"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Review the staged diff before committing: no personal backups, private links, passwords, or credentials. `.gitignore` excludes dependencies, builds, local environment files, `private/`, `backups/`, QA artifacts, and standard Study Desk export names. It cannot recognize arbitrary sensitive files; keep them outside the checkout.

3. In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions**.
4. Run **Verify and deploy Study Desk** from Actions if the initial push happened before Pages was configured. The workflow tests, builds, uploads `dist/`, and deploys main. Pull requests run verification without publishing.
5. Open the URL shown by the deployment. Check Today and `/#/courses`, refresh a hash route, and add/export a temporary record before relying on the published origin.
6. If moving records from localhost, export them locally and restore on the published site. No data is transferred through Git.

No deployment credentials are needed in application code. The workflow uses GitHub's scoped Pages/OIDC permissions. A remote repository and Pages settings must exist before publication can finish.

## Maintain and expand

See [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries, migrations, future synchronization, and authenticated Drive integration. Use `npm.cmd exec prettier -- --write src README.md ARCHITECTURE.md` to format changes. Test fixtures are explicitly synthetic and are never loaded by the application.

Source references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Vite deployment](https://vite.dev/guide/static-deploy.html), [browser storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
