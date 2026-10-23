# Calendar patch verification — 23 October 2026

Baseline: `5e9be89` (planner-core). Application release: 1.2.0. Domain schema: **4**, migrated in order from 3; no Supabase SQL changes.

## Automated evidence

The complete suite passes: **84 tests across 6 files**, including **29 new Calendar/alert tests**. Existing planner, study rules, catalog import, IndexedDB and Supabase tests remain in the suite. Production TypeScript/Vite build is checked before commit.

New tests cover deterministic event identity and update rather than duplication; inclusive all-day ranges; timed source timezone and point markers; unverified/stale dates; unknown syllabus; academic saves surviving provider failures; failed reservation; lost-response retry; external edits not importing into study records; cancellation without deletion; explicit removal and suppression; reminder/mapping backup round trips; v3 migration preserving locked history; locked Today and urgent Tomorrow priority; IndexedDB persistence; existing Supabase owner-scoped RPC/reload; token-field stripping; alert consolidation/dismissal/severity/opening/closing/read receipts; adapter ownership checks and insert-conflict recovery; optional Calendar-only incremental scopes; OAuth cancellation/late callbacks; equivalent timestamp confirmation.

Google API responses and Supabase sessions in these tests are simulated. These checks do not establish live Google consent, notification delivery, live Supabase RLS, or second-device behavior.

## Browser checks performed

- Desktop 1440×1000: Settings, optional connection configuration, notification center, unread count, read/dismiss controls.
- Mobile 390×844: notification center, expanded assessment Calendar controls, official-date confirmation, Settings, Today, and internal Calendar while disconnected. A narrow assessment layout discovered during QA was corrected and rechecked.
- Dismissed alert survived another tab/reload of the isolated local dataset; show-dismissed displayed its saved state.
- Backup preview and replacement successfully loaded disposable synthetic records; the original empty isolated dataset was restored afterward.
- No browser console errors were observed in the checked mobile flow. No private cloud academic data was edited during QA.
- Relative production assets and existing hash-route deployment remain unchanged.

The supplied public Google client ID is configured for local builds and as the Actions fallback. An embedded-browser connection attempt did not complete consent. The user subsequently reported completing the normal Chrome/Edge sign-in step. That separate browser session is not exposed to the test tools, so live calendar selection, event operations and reminder delivery have not been independently inspected. No Google Calendar event is claimed to have been created during this verification.

## User-assisted live acceptance still required

1. Verify Google Cloud Calendar API, Web client origins, consent audience and test-user access as described in GOOGLE-CALENDAR.md.
2. In Chrome/Edge, connect, select or create the dedicated calendar, and sync a deliberately chosen confirmed assessment. Inspect its inclusive date range, description and reminder offsets in Google Calendar.
3. Edit the Study Desk title or confirmed date (reconfirm changed dates), update, and verify the same external event is updated. Edit the external event, then explicitly sync again and confirm Study Desk remains unchanged.
4. Disconnect/reconnect, confirm the calendar, and verify stored mappings remain. Test explicit removal only on a disposable event.
5. Sign into the existing Supabase account on another device and reload. Verify preferences/mappings arrive through normal cloud loading; connect Google separately there. Verify a downloaded export contains no OAuth authorization secrets.
6. Check actual Google reminder delivery according to your account/device notification settings. The app cannot guarantee that delivery.

Native push/background delivery, two-way sync, non-owned shared calendars, automatic retry loops, LMS scraping, grades/GPA, and additional calendar providers are deliberately deferred. Cross-device external writes are not a distributed transaction; a stale mirror is corrected from current Study Desk data on explicit update.
