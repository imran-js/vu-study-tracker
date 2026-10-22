# Release verification

## Cloud and course import update — 23 October 2026

- 35 automated tests pass; production build passes. GitHub Actions also passed dependency installation, tests, build and artifact upload for commit `dcb063c`.
- Added email/password sign-in and a Supabase repository with owner checks and transactional revision conflicts. Account creation and successful sign-in were confirmed by the user.
- Prepared a private five-course catalog from the user's Drive folders and handout outlines. Validated 341 numbered units and 387 resource links against the domain model; repeated merge added zero records. The user confirmed all five courses appeared after reloading the signed-in local app.
- The live database rejected an anonymous read with HTTP 401 and no returned records. This is not a substitute for remaining authenticated second-account isolation and two-device conflict tests.
- Scanned all tracked application files and production assets for private Drive IDs from the catalog: no matches. The private catalog and `.env.local` are Git-ignored. The published workflow includes only the intended public Supabase client configuration, not privileged credentials.
- Code is published to the GitHub repository. Initial Pages deployment failed because Pages was not enabled; selecting GitHub Actions in repository Pages settings is required before retrying.
- Cloud writes require connectivity; other-device changes appear on reload. No offline write queue or live subscription is implemented. Export backups remain necessary.

The following section records the original browser-only release checks, not the current cloud-storage status.

## Original local release

Verified on 22 October 2026.

- Production build: passed TypeScript compilation and Vite asset generation.
- Automated checks: 27 tests passed across domain and repository suites. Coverage includes progress, timezone boundaries, timer pauses/recovery, overlapping intervals, semester isolation, resource relationships, backup round trips, migration, invalid replacement, and stale-tab protection.
- Deployment assets: generated entry-point URLs are relative; navigation uses hash routes for GitHub Pages repository paths. Live GitHub Pages deployment has not been verified.
- Browser inspection: desktop and mobile layouts, empty states, course/lecture entry, completion, resource search, date entry, calendar, timer reload recovery, progress, keyboard focus, and validation feedback were exercised with disposable records.
- Disposable browser records were removed by restoring the original empty dataset. No real academic data was added.

The app starts with an empty Semester 1 — Fall 2026. Personal records remain in the browser. Export them regularly to a private location outside this repository.

GitHub publication remains pending: a destination repository and authenticated publication access are required. Follow README.md for local use and deployment. Cross-device synchronization, authenticated Drive browsing, and closed-browser reminders are future features.
