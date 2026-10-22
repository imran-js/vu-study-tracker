# Architecture and expansion

## Boundaries

- `src/app`: application shell, React context, editor orchestration, and actions. `commit` clones a snapshot, applies an action, validates it, then awaits durable storage. UI state updates only after successful persistence.
- `src/features`: feature screens; backup parsing/serialization is an application-level module with no dependency on React or IndexedDB.
- `src/domain`: typed records, schema/relationship validation, pure study rules and date calculations. Uses the Temporal polyfill for timezone conversion and DST-safe day boundaries. No React, database, or Google calls.
- `src/data/contracts.ts`: asynchronous `StudyRepository` and revisioned snapshots.
- `src/data/indexeddb.ts`: the browser adapter. A single atomic snapshot is deliberately simple for a personal tracker. Transactions compare revisions to prevent stale browser tabs overwriting newer records. Reload a stale tab before retrying.
- `src/data/migrations.ts`: ordered domain schema upgrades, separate from IndexedDB's physical store version.
- `src/integrations/google-drive.ts`: provider file-ID extraction and a small selection contract. No authorization or API calls in v1.
- `src/shared`: reusable interface components.

The interface never opens IndexedDB or calls Drive APIs. Course offerings belong to semesters through stable IDs. Reused codes are independent records. Assessment types are editable data; date behavior uses discriminated deadline fields. Resources belong to a course and optionally a lecture within it. Resource IDs are independent of Google file IDs. Notes are rendered as escaped plain text. Original Drive URLs are preserved, including resource keys. Resource deletion changes only the saved tracker record.

For a later feature, add a feature module and the necessary domain records. Avoid generic extension registries, speculative grade fields, and multiple services until needed.

## Schema and migrations

Current domain schema: **3**. IndexedDB physical version: **1** (one `state` object store containing a revisioned dataset). Migration `2 → 3` adds empty daily plans, conservative planner preferences, active course planning defaults (VU001 inactive), and unknown assessment coverage. Existing records and stable IDs remain intact. Optional weak flags, course planning, assessment scope, marks and practice results need no database-table changes.

The documented predecessor v1 is the same study schema without resource records or course folder URLs. Migration `1 → 2` adds empty resources and empty folder URLs. This is exercised by tests; no real older release is assumed to exist. New migrations must clone their input, preserve IDs and timestamps, run sequentially, and validate before persistence. Database load migrates supported older snapshots using the same migration runner, then commits atomically. Unsupported future versions fail safely without initializing over existing records.

Backup envelope: `format`, `schemaVersion`, `exportedAt`, `applicationVersion`, `data`. The schema version controls compatibility; the application version is informational. `data` contains settings and all entity collections. Parsing strips fields outside the allowed schemas, so authorization tokens cannot become persisted resource fields. Backups should still be treated as private because they contain personal notes and links. Restore is a complete replacement with preview and explicit confirmation, using the same validated repository transaction. The application does not merge two datasets.

## Daily planner domain

`domain/planner-model.ts` holds planner and coverage schemas; `domain/planner.ts` holds pure rankings, recommendations, outcomes, plan-save/unlock rules and commit transition protection; `domain/readiness.ts` maps only verified, explicitly aligned numbered scope to existing included units. The UI is `features/planner/Planner.tsx`, embedded in Today and Settings; Calendar includes daily plans alongside sessions. No second planner store exists.

Daily plans store immutable assignment snapshots (course/unit associations, focus text, minutes, source/reason, notes, day/zone and saved maximum), mutable explicit outcome/session links, and lock/unlock audit history. Confirming Today persists the lock; merely displaying recommendations never writes a plan. Application commits compare before/after plans: locked assignments require a separately saved unlock, while past plans cannot be rewritten or moved. Full restore is an explicit exception only after existing restore confirmation. Raw schema validation also checks unique semester/date, Main/Secondary roles, distinct courses, workload caps and related semester/course/unit/session integrity.

Past Missed/Partial outcomes are computed from the unchanged dated record, explicit item states and linked actual time, rather than rewriting historical assignments on each load. No autonomous rollover job is required. Recommendation recovery considers prior unfinished work with capped priority influence, never accumulating extra daily minutes. New deadlines/flags update only the live recommendation and unrelated data; a locked plan's snapshot is untouched.

`app/planner-actions.ts` creates/reuses ordinary study sessions for timer and quick-minute logging. Existing interval/timezone/overlap validation remains authoritative. Plan outcome does not imply actual time, and neither implies academic completion. Revision events remain distinct from manually sourced practice results. Course status is explicit; no fabricated behind score based on incomparable course denominators.

The maximum is captured per saved plan so changing today's settings does not invalidate historical or locked assignments. New plans use the current limit, including already scheduled sessions. Recommendation split is 70/30 and capped by normal/light budget. All score factors and deductions are visible. Unknown dates or scope do not generate fake percentages.

## Private cloud storage

The first cloud adapter is now implemented in `src/data/supabase.ts`, with email/password account UI in `src/app/CloudApp.tsx`. It uses one JSON snapshot per owner, owner-only row policies, and a security-invoker save function that checks expected revisions atomically. See `supabase/setup.sql`. The public client key is never a privileged credential. Account data is not cached in IndexedDB; signing out unmounts cloud screens. Online writes and reload-based reads are the initial synchronization model. Live subscriptions and offline writes remain deferred.

`src/features/backup/catalog.ts` provides validated additive imports. `src/data/local-catalog.ts` can apply a private local catalog once per account/catalog marker during development. Vite serves the ignored catalog only through a loopback, same-origin, uncached development endpoint; production builds do not include it. Existing progress and course edits are preserved, and Drive file IDs prevent duplicate resource entries. Failed cloud commits are reported without falling back to a second writable database.

### Expansion guidance

Implement another `StudyRepository`, inject it into the application shell, and keep existing screens and calculations. Add account UI, database ownership/access policies, account-specific local cache boundaries, revision conflict detection, and clear save/sync status. Start with online writes and explicit conflict resolution. Do not silently replace browser records during sign-in: preview and confirm uploading local records first.

The snapshot contract supports a simple database row per owner with a server-enforced revision check and transaction. If data volume later warrants normalized tables, keep that mapping within the adapter. Server authorization must enforce the signed-in owner's access; client filters are not security. Test anonymous and second-account denial, failed writes, two-device round trips, sign-out cache removal, and conflicting updates. Offline writable caches and deletion reconciliation are separate future work. Synchronization is not a backup.

## Future features

| Feature              | Fits through                                                | Deferred decisions                                                 |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Grades               | Assessment results and course-offering grading policies     | Weighting, missing work, rounding, GPA rules                       |
| Spaced revision      | Existing individual revision events + a scheduling function | Algorithm, ratings, overrides, schedule changes                    |
| Reminders            | Read assessments, sessions, and next revision dates         | Delivery provider, scheduler, permission flow, retries             |
| Calendar integration | Adapter mapping explicit dates to external events           | Export versus sync, provider auth, external IDs, conflict handling |
| LMS integration      | Adapter producing validated application actions             | Supported VU access methods, source mapping, reconciliation        |

Calendar and LMS imports must call the same validation/actions as manual input. Never let external data overwrite confirmed values without a review flow. A static site cannot promise closed-browser timed reminders; a service worker is not a continuously running scheduler. No LMS capability is assumed.

## Future authenticated Google Drive access

This is independent of progress storage and optional for all study features. The first authenticated extension should use **Google Picker** to browse/search and explicitly select files, then map selected metadata to existing resource actions. Fetch only the metadata fields required by the UI. Keep locally edited titles distinct from provider metadata if refresh is added through a future schema migration.

Prefer Google's recommended **`drive.file`** scope for chosen-file access. It is per-file but is not read-only: it can allow editing/managing selected files, so consent copy must accurately describe that scope even if our adapter only reads metadata. Do not request full-Drive access, Docs editing, Calendar, or Drive app-data permissions for a file-selection feature. App-side searches under per-file access cannot be described as full-Drive search. A custom full-Drive metadata search would need a separate decision: `drive.metadata.readonly` is classified as restricted. Folder selection must not be treated as blanket authorization for every descendant file.

Google Cloud setup would enable Drive and Picker APIs, configure OAuth consent/audience, and create a Web client. Register the deployed JavaScript origin (`https://USERNAME.github.io`, without a repository path) and localhost origins/ports used for development. Use the same Cloud project for the Picker app ID and OAuth client. Restrict the browser API key to the required APIs and website referrers, following the current Picker guide, including its documented `docs.google.com` iframe requirement.

For interactive static hosting, Google's browser token model can call APIs over CORS without a client secret or a refresh-token backend. Request access only after the user chooses to connect/select files. Keep short-lived tokens in memory; reacquire through user interaction on expiration, provide disconnect/revoke, and keep tokens out of logs, exports, storage adapters, and source control. A later server-side code flow or unattended access needs a separate backend. GitHub Pages cannot run that backend.

Start previews with those supported by Picker. Do not promise that arbitrary private Docs/PDFs can be embedded in an iframe: format support, authorization, and browser restrictions vary. Keep opening the original file in Drive as the reliable fallback. No permissions are changed and public sharing is never required. On authorization/access failure, retain saved resource metadata and leave study tracking operational.

Before shipping this extension, reassess Google consent/audience, app verification, user-data policies, and any verified-domain requirements for the chosen configuration. Personal-use exemptions may apply; broader distribution and restricted scopes change the review requirements. A custom domain on Pages may be appropriate if domain ownership verification is required.

Official references checked while planning:

- [Drive scopes and per-file authorization](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Picker overview](https://developers.google.com/workspace/drive/picker/guides/overview)
- [Picker web setup and key restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)
- [OAuth client origins and server-only client secret](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
- [Browser token model and expiry](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive permissions](https://developers.google.com/workspace/drive/api/guides/manage-sharing)
- [Verification and personal-use exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
