# Luxe & Little Treasures Business Manager Audit

Date: 2026-05-21

## Debugging Audit

### Browser Launch Gate

Root cause: the prototype included a browser-only `Preview Installed App` button and a `localStorage` bypass. That allowed the full app to continue inside Safari/desktop browser, which defeated the intended installed-app experience.

Fix: browser mode now renders only the install instructions. The operational app activates only when launched in standalone/Home Screen mode using `display-mode: standalone` or iOS `navigator.standalone`.

Verification: browser screenshot confirmed the page remains an install gate and no longer exposes a continue button.

### Reports Tab

Root cause: the Reports segmented control rendered two buttons, but there was no React state or click handler attached to the `Reports` button. The UI looked clickable, but both segments always rendered the same expenses content.

Fix: `Reports` now owns a `view` state with `expenses` and `reports` modes. The segmented buttons update that state, and each mode renders distinct content.

Verification: browser verification confirmed the Reports segment becomes active and report metrics render.

### Mobile Onboarding Cutoff

Root cause: the original onboarding used a long scrolling setup surface inside a phone shell. On smaller iPhones this could feel clipped at the bottom.

Fix: onboarding is now a three-step wizard:

1. Stock categories
2. Size types, expense categories, and low-stock threshold
3. Mandatory PIN setup

Each step is designed to fit the visible mobile viewport with Back/Continue controls.

### Fresh Production Data

Root cause: early prototype seed data was being inserted into IndexedDB, so the app appeared pre-filled on first use.

Fix: new installs no longer seed products, customers, expenses, or sales. Only setup defaults are shown during onboarding. Business records start empty.

Residual note: existing development browsers may still show old IndexedDB data until `Clear Data` is used.

## Security Audit

### Local Data Storage

The app stores records locally in IndexedDB on the phone. This matches the offline/local-first requirement, but data security depends on the device remaining protected.

Mitigations:
- App supports a PIN lock.
- PIN setup is mandatory before the dashboard opens.
- PIN is stored as a salted SHA-256 hash, not plain text.
- App re-locks after idle/return behavior and re-enters through splash before PIN unlock.
- Export/import backup is explicit and user-controlled.

Residual risks:
- A web app cannot provide the same hardware-backed keychain protection as a native iOS app.
- Anyone with the unlocked phone and app PIN can view business data.
- Backups are JSON files and should be stored carefully.
- Client-side PIN hashing protects against casual inspection, but not against a fully compromised device/browser profile.

### Backup/Restore

Export creates a JSON backup containing products, customers, sales, expenses, and settings.

Mitigations:
- Import validates that the file is an app backup before replacing local data.
- Clear Data asks for confirmation before deleting business records.

Residual risks:
- Backups are not encrypted yet.
- Import replaces local data, so a wrong backup can overwrite current records.

Recommended next hardening:
- Add encrypted backups with a passphrase.
- Add a pre-import summary screen showing record counts.
- Add optional iCloud/Supabase sync if multi-device or stronger recovery becomes important.

### PWA/Service Worker

The app registers a service worker only in production builds. This avoids stale cached files during development.

Risk:
- Users can run an older cached app shell until the service worker updates.

Mitigation:
- Future versioning should increment the cache name during releases.

## Product Risk Audit

### Data Loss

Highest operational risk: phone-local storage can be lost if Safari/PWA data is cleared or the phone is replaced.

Mitigation now:
- Export Backup.
- Import Backup.

Recommended operating procedure:
- Export backup weekly.
- Export before changing phones.
- Store backup in iCloud Drive, Google Drive, or WhatsApp to self.

### Business Accuracy

Inventory reduces automatically after sales, but the current app assumes the saved sale is valid.

Recommended next hardening:
- Add payment status and delivery status as editable controls.
- Prevent sale quantity above available stock.
- Add sales edit/cancel flow that restores stock.

### Production Readiness

Ready for first real-world testing once deployed to Vercel and installed on the iPhone Home Screen.

Recommended before daily dependence:
- Test on the actual iPhone in Safari and Home Screen mode.
- Confirm browser mode does not expose app records.
- Confirm Home Screen launch shows splash, onboarding, PIN setup, then dashboard.
- Add three real products, one customer, one sale, one expense.
- Export and import a backup once.
- Confirm receipt sharing opens WhatsApp correctly.

## Deployment Notes

Vercel should detect this as a Vite app:

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

## Current Checks

- `npm run build`
- Browser verification of Reports tab switching
