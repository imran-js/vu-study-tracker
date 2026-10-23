# UI polish verification — 23 October 2026

This patch refines the existing Study Desk interface. Study-data schema remains 4.

## Appearance

- Light, Dark, and System (default). System subscribes to operating-system theme changes.
- Compact, Default, and Large text use 15, 16, and 18 px root sizing. Content uses rem units; icon dimensions remain stable. Small-copy floors are 12 px on desktop and 13 px on narrow screens.
- Preferences are browser/device-local, stored in `study-desk.appearance.v1`. They are separate from study records, Supabase, and study-data backups. Invalid values fall back safely; blocked preference storage produces a visible notice while retaining the preference for the current visit.
- Shared semantic CSS tokens cover surfaces, text, controls, borders, success, warning, danger, and focus. Reduced-motion behavior is preserved.

## Presentation changes

- Header groups the notification bell and theme control at the right; unread count is included in the link's accessible name. Mobile controls have 44 px targets.
- Today retains the saved plan and original actions. Urgent/upcoming assessments precede Tomorrow; course status and historical plans follow. The total planned time appears before the study cards, including on phones.
- Course status cards show the saved status, completed/total counts, next item, and upcoming assessment. Supporting status explanations are expandable; no pace/status is inferred by this UI patch.
- Notifications are grouped into Critical, Important, and Informational sections, with the existing read/dismiss and navigation actions. The empty state reads “You’re all caught up.”
- Assessments retain visible dates and readiness; source, practice, notes, and Calendar controls use expandable details. Calendar identifiers are replaced with calendar names or a descriptive fallback.
- Settings groups Appearance, Planner, Study preferences, Google Calendar, Backups, Semesters, Assessment types, and storage help. Restore and disconnect consequences remain visible.
- Mobile navigation closes after route changes or selecting the current route. Escape/close returns focus to the menu button. Route changes reset page scroll and focus the main content.

## Automated checks

`npm test`: **95 passing tests in 7 files**. All 84 pre-existing tests remain unchanged.

11 new UI tests cover default/System theme updates, explicit theme and text-size persistence, corrupt preferences, unavailable local storage, cross-tab preference updates, header bell/count/navigation, locked Today preservation, settings and Calendar actions with large text, assessment-specific Calendar actions, mobile navigation, and notification empty state.

`npm run build`: passed TypeScript and Vite production compilation.

The UI tests mock the Calendar service boundary; existing Calendar tests continue testing actual synchronization logic. No changes were made to the domain calculations, planner actions, Calendar service/provider, integrations, repositories, migrations, backup format, or timer behavior.

## Browser inspection

Used the Chromium-based in-app browser, isolated localhost port 5174, browser-only mode, and five explicitly synthetic courses. No real study records or Google events were created for this audit. Test fixtures and screenshots stay in ignored `qa-artifacts/`.

- Desktop screenshots inspected: Today, Courses, Assessments, Calendar, Progress, Notifications, Settings; both light/default and dark/large styles reviewed across the main screens.
- Mobile screenshots inspected: Today/header, sidebar, Notifications, Assessments, Settings, Calendar, and assessment dialog.
- All eight routes, including Notes & Resources, checked for horizontal overflow at **1440, 1024, 768, and 390 px**, with Large text: **32 checks passed**.
- Light/Dark/System each inspected with Default and Large text on mobile settings. System followed the browser's dark preference and persisted after reload; automated tests exercise both system directions.
- Dialog keyboard focus stayed inside the native modal. Drawer Escape returned focus to Open navigation. Header targets measured 44 px tall at 390 px.
- Semantic foreground/background token contrast pairs measured at least **5.07:1 in light** and **6.35:1 in dark** for the tested normal, muted, accent, success, warning, and danger text combinations. This is a token check, not a claim of a full independent WCAG audit.
- No browser runtime errors observed during the audit.

## Limits and deliberate deferrals

- Long semester labels truncate in the compact mobile header; the full option remains available in the semester selector. Date/timezone header copy hides on narrow screens to preserve usable controls.
- Narrow calendars stack days, so a full month requires vertical scrolling; the existing List view remains available.
- Appearance preferences do not synchronize across devices or travel in academic backups.
- No new academic features, schema migrations, push reminders, or integration behavior were added.
- Live Google sign-in/event delivery and cross-device Supabase saves were not repeated for this presentation-only patch. Existing automated Calendar and cloud/repository checks pass.
