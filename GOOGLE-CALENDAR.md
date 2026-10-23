# Google Calendar and academic alerts

Study Desk remains the authoritative academic source: **VU/VULMS → Study Desk → Google Calendar**. No external Calendar edits are imported. Existing planner rules and the locked Today plan are unchanged. Tomorrow uses Study Desk assessments, never external events.

## First connection

1. Use Chrome or Edge, open Settings & Data, and choose **Connect Google Calendar**. Embedded browsers may not support Google's popup flow. Ordinary Supabase sign-in never requests Calendar access.
2. Grant the requested Calendar permissions. Select an owned calendar and choose **Use selected calendar**. A single exact match for the current semester's suggested name is preselected for review. Duplicate names are never silently resolved.
3. Alternatively, create a dedicated calendar. For the existing semester the suggested name is `VU – Fall 2026`; future names derive from the selected semester. Creation asks for an additional permission, checks for an existing same-name calendar, and never assumes a calendar already exists. Shared calendars owned by someone else are deliberately excluded to use a narrower event scope.
4. For each important assessment, expand its Google Calendar section, record the official date source, and explicitly confirm the current dates. Coverage verification is separate from date verification. Editing dates invalidates that confirmation until you verify again.
5. Use **Sync to Google Calendar**, **Update Google Calendar**, or **Sync confirmed deadlines** in Settings. The global action operates on the selected semester. Cancelled/completed/submitted assessments are not newly created by bulk sync; previously mirrored events can still be updated.

Default eligible types are Quiz, Assignment, GDB, Exam, Midterm, Final Exam, and Administrative Deadline. Eligibility is stored as data, not used to infer scheduling behavior. An assessment override enables a verified administrative deadline or a custom type. Study blocks, generated recommendations, catch-up work, and revision sessions are never exported.

## Reminders and dates

Default popup reminders are seven days and one day before the event **starts**. A multi-day all-day event starts on its opening date, so these reminders are not relative to its closing date. Optional opening-day reminders apply only to all-day ranges. Up to four advance reminders plus opening day are supported; custom values are 0–40320 minutes. Google controls actual delivery and all-day reminder timing. Check notifications in your Google Calendar account/device.

An inclusive November 3–5 date range is sent as start November 3, exclusive end November 6. Timed events preserve their actual instants and official source timezone. A point deadline without an official positive duration uses a one-minute Calendar marker, explicitly identified in its description; this does not change its Study Desk deadline. Unknown syllabus is described as awaiting an official VU announcement. Provisional coverage and private course/resource notes are not copied into the Calendar description.

Cancellation prefixes the existing event title with Cancelled and disables reminders. It does not delete the event. **Remove from Google Calendar** explicitly deletes only the matching app-created event and suppresses automatic recreation. A later manual Sync creates a new event identity because Google can retain deletion tombstones. Deleting an assessment leaves its external mapping available under Settings → Manage existing Google mirrors for explicit cleanup.

## Automatic sync and failures

Automatic sync is initially off and is turned off when changing or creating the selected calendar. When enabled, it runs while Study Desk is open, authorization is valid, and a calendar has been confirmed for this browser session. Save academic changes first; Calendar runs afterward. Failed changes are not continuously retried. Use a manual retry; reconnect for expired authorization. A reload or another device requires a fresh Google connection and calendar confirmation, even though mappings/settings arrive through normal Study Desk cloud reload.

Sync status shows disconnected, not synced, pending/syncing, synced, update available, or failed, plus last synced time. A synced label records the last successful write; it is not a live audit of Google. Explicit update overwrites the app-managed fields from Study Desk. Missing/deleted external events never delete academic records. If Google returns a tombstone error, explicitly Remove the mirror (already-missing events are treated as removed), then Sync again.

The application reserves a deterministic Google event ID in the repository before issuing any external write. Retries after a lost response or failed status save use that ID; conflicts verify the app/assessment marker before updating. External side effects and the database cannot form a single transaction. After a cloud revision conflict, reload and retry. Concurrent devices can briefly leave Google showing an older revision; the latest Study Desk record wins on the next explicit update. No external data is imported.

Disconnect clears in-memory authorization, requests revocation where possible, and turns automatic sync off. It preserves academic records, mappings, and existing Google events. Those events can continue delivering their existing reminders. Revoking OAuth consent may affect other sessions of this same Google OAuth app. Sign-out/unmount clears this browser's in-memory token without changing your study records.

## Google Cloud setup

The supplied public client ID is configured as a GitHub Actions fallback. Override it using repository variable `VITE_GOOGLE_CALENDAR_CLIENT_ID`. Locally, set the same variable in ignored `.env.local`. A client ID is public; **never put a client secret, refresh token, or service-account key in Vite variables or this repository**.

In the Google Cloud project belonging to that client:

1. Enable **Google Calendar API**.
2. Configure the OAuth consent screen/app audience. For testing, add the intended Google account as a test user. Complete verification when required for your distribution and selected scopes.
3. Use a **Web application** OAuth client. Add authorized JavaScript origins `https://imran-js.github.io`, `http://localhost`, and `http://localhost:5173`. Origins have no `/vu-study-tracker/` path. Add other development ports only if you use them.
4. The Google Identity Services popup token flow used here does not need an application redirect endpoint. Do not configure it as a server-side authorization-code flow or place a secret in the frontend.
5. Ensure browser popup restrictions and any custom security headers allow Google Identity Services. Verify the Google prompt in a normal browser before relying on reminders.

Requested scopes:

| Scope (prefix `https://www.googleapis.com/auth/`) | When                            | Purpose                                                      |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------ |
| `calendar.calendarlist.readonly`                  | Connect                         | Discover calendars and their access roles                    |
| `calendar.events.owned`                           | Connect                         | Create/update/remove events on calendars you own             |
| `calendar.app.created`                            | Explicit Create calendar action | Create dedicated secondary calendars and access their events |

The owned-events scope permits more than just this app's events; Google offers no per-event consent for arbitrary existing owned calendars. The adapter only writes a reserved event ID with a matching Study Desk marker. No Gmail, Drive, Contacts, broad full-Calendar, profile, or email scope is requested. An account email is not fetched for display. Tokens are short-lived, held only in the adapter instance, and absent from snapshots, exports, logs and source control. The browser must reconnect after expiration; no refresh-token/backend scheduler is added.

## In-app attention center

The bell shows unread active alerts for the selected semester. One assessment alert consolidates closing/opening urgency, changed dates, verified coverage and calculable readiness. Unknown coverage never produces a fake percentage. Critical means overdue or closing today; Important covers the three-day band, changed dates, or major incomplete verified coverage near an event; Informational covers the seven-day band and course/revision needs. Completed/submitted/cancelled assessments do not produce deadline alerts.

Read/dismiss receipts persist through the same repository and backups. A dismissed alert stays hidden through ordinary countdown/progress changes, but a materially changed date, coverage, priority band, or opening/closing phase can bring it back. Course alerts consolidate revision needs and behind/attention status with no study in the last seven days. Notifications never edit a daily plan.

## Official references

- [Calendar authorization scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Calendar creation scopes](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert)
- [Calendar list and access roles](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Event IDs, dates and reminders](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [OAuth Web client origins](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)

GitHub Pages continues serving static assets with hash routing. Calendar API requests run in the browser. Native push, email/SMS/WhatsApp delivery, background servers, two-way sync, LMS scraping, grading and new calendar providers are deliberately deferred.
