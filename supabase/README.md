# Enable private cloud storage

1. Open your Supabase project **SQL Editor → New query**. Paste the contents of `setup.sql` and Run. This creates the snapshot table, owner-only access policies, and a transactional revision-checking save function. The publishable key cannot perform this administrative setup.
2. Under **Authentication → URL Configuration**, set Site URL to `http://localhost:5173/` while developing. When publishing, set the actual GitHub Pages URL and allow both exact development and published URLs as redirect destinations as needed for email confirmation.
3. Restart the local development server. `.env.local` already contains your supplied project URL and publishable key. It is ignored by Git. Do not add secret/service-role keys.
4. Create your study account in the website yourself, confirm its email, then sign in. A Supabase dashboard login is separate from an application user account.
5. On first sign-in, download a browser backup and explicitly choose to import browser records or start empty. Existing local data stays intact. For an existing cloud dataset, use Settings backup restore if you intend to replace it.
6. For GitHub Pages, the workflow defaults to this project's public client configuration. Optional repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` override these defaults. Never use privileged keys. Select GitHub Actions as the Pages source in the repository's Pages settings, then deploy.

Cloud records are loaded at sign-in/reload; this release does not use live updates or offline write queues. Saves are acknowledged by the server before updating the displayed snapshot. Stale-device saves are rejected. Export the currently displayed records before reloading if you need a recovery copy. Sign-out unmounts cloud screens; no cloud dataset is persisted to IndexedDB. The authentication session is stored by the official SDK to preserve sign-in. Local browser records and downloaded backups stay on the device.

## Required live verification

Local adapter tests do not verify deployed SQL policies. Before trusting the integration:
- With two test accounts, confirm each sees only its own records. Attempt to read/update the other owner's row using the first account's authenticated API session and verify denial.
- Confirm anonymous reads/writes fail.
- Sign in with one account on two devices. Save on one; verify a stale save on the other is rejected, then reload to retrieve the latest data.
- Disconnect the network and confirm save failures are visible without claiming success.
- Sign out and verify cloud records disappear. Sign in as another account and verify no previous-account data appears.
- Exercise export/restore with a disposable dataset before importing real records.

Keep export backups. Synchronization also propagates unintended edits; it is not a backup.
