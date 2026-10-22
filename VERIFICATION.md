# Release verification

Verified on 22 October 2026.

- Production build: passed TypeScript compilation and Vite asset generation.
- Automated checks: 27 tests passed across domain and repository suites. Coverage includes progress, timezone boundaries, timer pauses/recovery, overlapping intervals, semester isolation, resource relationships, backup round trips, migration, invalid replacement, and stale-tab protection.
- Deployment assets: generated entry-point URLs are relative; navigation uses hash routes for GitHub Pages repository paths. Live GitHub Pages deployment has not been verified.
- Browser inspection: desktop and mobile layouts, empty states, course/lecture entry, completion, resource search, date entry, calendar, timer reload recovery, progress, keyboard focus, and validation feedback were exercised with disposable records.
- Disposable browser records were removed by restoring the original empty dataset. No real academic data was added.

The app starts with an empty Semester 1 — Fall 2026. Personal records remain in the browser. Export them regularly to a private location outside this repository.

GitHub publication remains pending: a destination repository and authenticated publication access are required. Follow README.md for local use and deployment. Cross-device synchronization, authenticated Drive browsing, and closed-browser reminders are future features.
