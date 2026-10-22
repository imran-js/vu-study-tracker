# Study Desk · Virtual University

A browser-first personal study tracker built with React, TypeScript, Vite, and IndexedDB. Starts with an empty **Semester 1 — Fall 2026**. No actual courses, lecture counts, or deadlines are preloaded.

## Supabase cloud storage

Optional private cloud storage and email/password sign-in are now implemented. The local `.env.local` is configured for your project and ignored by Git. **Complete the database and authentication setup in [supabase/README.md](supabase/README.md) before using cloud mode.** Run `supabase/setup.sql` in the project's SQL Editor. Cloud operation has not been verified against a signed-in live account yet. Browser-only mode remains available and existing browser records are preserved.

For GitHub deployment, the workflow supplies the public client configuration described below. Reload to retrieve saves from another device; stale saves are rejected. Export backups separately.

The deployment workflow now supplies this project's public Supabase URL and publishable key as defaults; repository Actions variables can override them. These client values are intentionally public. Owner-only database rules protect study records. Never substitute a secret or service-role key.

## Private course catalog

A generic additive course-catalog importer is available during local development. Its input is `private/course-catalog.json`, which is ignored by Git and excluded from the production build. When this file exists, the signed-in local cloud workspace imports it once per account/catalog ID on load. Existing course titles, completion, assessments, timers, notes and schedules are preserved. Missing course metadata, numbered units and resource links are added, with duplicate resources matched by Drive ID. A local marker prevents repeating the same import on later reloads. Browser-only mode never automatically imports it. A failed cloud save reports an error and can be retried by reloading.

The endpoint is loopback-only, same-origin, development-only and uncached. Never expose the development server to the internet. Private data must remain outside `public/`, source imports and deployment assets. On the published website, the imported records load from the signed-in Supabase account; the catalog is not hosted there.

## Run on Windows

Install Node.js 22 LTS or a newer supported LTS release, and Git. Open PowerShell in this project folder:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173/**. Keep using that exact address: `localhost` and `127.0.0.1`, other ports, other browser profiles, other devices, and the deployed website have separate storage. Stop the server with Ctrl+C. Use `npm.cmd` if PowerShell blocks the npm script shim.

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
