# Frontend migration matrix

"Implemented" means source code exists, not that native/device gates passed.

| Area | Source implementation | Remaining validation |
|---|---|---|
| Host pages | Eight React HTML entries, file routes, automatic chunks; authenticated native HTTPS/assets passed on Windows runner | Final-source rerun and real host verification |
| Welcome/login | Existing contracts, validation, timeout/retry, password manager; fixed pt-BR; native setup/login passed | Real host verification |
| Overview | Config, library/client counts, current app, quick links; no fake metrics | More error fixtures and real host data |
| Settings | 102 active keys/12 groups, OS filtering, search, command/display editors, review/save | More write/retry cases and malformed-data recovery |
| Config integrity | Unknown-key preservation, defaults, semantic conflict checks; mocked save/stale-save/unsaved-navigation and native Windows UTF-8 file roundtrip pass | Final-source rerun; best-effort conflict detection remains non-atomic |
| Devices | PIN, OTP/QR/host override, 13 permissions, mode/hooks, disconnect/unpair/all; browser PIN validation/rejection, OTP expiry/phrase invalidation, permission toggle/save, rename/permission preservation, invalid display rejection and disconnect/revoke/unpair-all/cancel/failure verified | Full hook editing and native pairing |
| Apps | All original fields, hooks, covers, order, launch/stop, .art/deep links; browser create/filter/edit/unknown-field preservation/rejected save/order/launch/stop/delete, PNG validation/upload, online cover success/failure and export verified; native Windows create/edit/delete and unknown-field roundtrip passed | Real host execution/streaming |
| Account | Current/new credentials; browser mismatch/rejection/success/clearing/relogin and native session invalidation verified | Final-source rerun and real host verification |
| Diagnostics | Bounded/deferred logs; browser text safety/filter/full download, recovery confirmation/cancel and connection-loss semantics verified | Clipboard/error flows and native checks |
| Layout | Official sidebar/sheet/Select, themes, local fonts; six authenticated pages and app/device editors fit 390/1280px without runtime errors | Complete keyboard/a11y/visual sweep |
| Language | Fixed pt-BR; i18n/providers/catalogs/selector/Crowdin/gettext and language API removed; locale writes rejected; Windows native build and package legacy-path scan passed | Final accessible-copy sweep |
| Build | HTML aliases, managed clean staging, native CMake now uses the single React package; Windows packaging and web entry/tray paths verified | Final-source rerun |
| Packaging | Old incompatible preview creation is blocked | Full package only after all gates; preserve private state |

## Current evidence

- The reviewed baseline had 104 entries. Locale was removed by request, and an
  inert old UI-only HDR toggle was retired in favor of the already supported HDR
  toggle-delay field. The schema now has 102 real native settings in 12 groups.
  The one-time multilingual extraction tool and its old sources are gone.
- 34 unit tests passed: single-language source/dependency guards, API/cache, settings preservation/defaults/validation/
  fingerprints, app payloads/exports, device permission/URL handling.
- 56 Chromium tests with simulated APIs passed: access cases, all eight actual
  emitted HTML entries/reload, sidebar/search parameters, config saves preserving
  unknown structures, repeat saves, stale-save rejection, unsaved-navigation
  confirmation, regular NVENC Select and fixed pt-BR. Additional account/device/
  diagnostics cases verify rejected writes, credentials cleared only on success,
  cancellation without writes, disconnect without unpair, no automatic retry after
  a lost restart response, inert HTML log content and complete log downloads.
- Five additional application browser tests passed: staged ordering until save,
  confirmed library-only deletion, unknown-field preservation on edit, separate
  launch/stop confirmations and retention of drafts after rejected saves.
- Pairing action tests found and fixed a missing explicit submit type on the PIN
  button. Valid/rejected PIN flows and OTP phrase/QR invalidation now pass against
  simulated APIs. Dialog/Sheet close controls also use fixed pt-BR accessible text.
- Explicit editor cancellation now asks before discarding changed app/device drafts;
  pending writes also activate navigation protection. Browser regression tests
  verify both cancel paths, unchanged permissions after rename, display validation,
  and expired OTP code/QR/link removal without automatic regeneration.
- Malformed command rows now enter a JSON recovery editor instead of throwing
  during render; incomplete JSON edits remain editable without replacing original
  data. Browser coverage verifies save blocking until correction, followed by a
  successful explicit save. Application creation/filtering, PNG signature/upload,
  and .art/deep-link IDs also passed without contacting live services.
- Windows native build/integration passed for commit `28b8ce3`:
  https://github.com/matheuspergoli/Apollo/actions/runs/39580734931.
  Native compilation, config/schema contracts, clean packaging, authenticated React
  pages/assets, UTF-8 config roundtrip, locale rejection and session invalidation
  passed. Subsequent recovery edits still require a final-source rerun.
- Display remapping now has explicit JSON recovery for malformed objects/rows;
  command-row validation blocks null/primitive rows before config writes. Online
  cover search success/failure, unpair-all, individual permission saves and mobile/
  desktop overflow checks passed with simulated APIs. The Windows integration
  script now also exercises real application create/edit/delete and unknown-field
  preservation; this extension is pending its first runner execution.
- Run 39625317398 compiled and packaged commit `424302b`, but failed at the first
  authenticated browser page. The harness copied native cookies with split('='),
  truncating tokens that contain '=' (a character in the native token alphabet).
  The harness now splits at the first delimiter, verifies authenticated access
  through the browser context, and retains failure screenshots/HTML/request errors.
  Application native roundtrips remain unverified until the corrected rerun passes.
- Run 39627489597 passed authenticated pages and config writes after the cookie
  fix, then timed out during native application creation. Browser evidence shows
  the 10-second API timeout, not a confirmed rejection. Debug-level native runner
  logs and save-stage markers were added to locate the blocked/slow phase. The UI
  now warns that a timed-out write may have applied and must be checked before
  repetition; a unit regression verifies it is sent only once. No timeout increase
  or automatic write retry was introduced.
- Run 39630452346 located the application timeout: the file was written at
  16:11:44.442 and the runtime refresh returned at 16:11:55.884, after five failed
  driver-open attempts on the driverless runner. Application create/update/order/
  delete writes now have a bounded 30s request budget; reads and other operations
  retain 10s. The native harness uses the same library-write budget. This change
  is based on measured server completion, not a blanket timeout increase, and no
  mutation retries were added. The complete native rerun remains pending.
- Run 39633089724 passed the complete native test on source `86bc895`: host build,
  config contracts, packaging, authenticated pages/assets, config UTF-8 roundtrip,
  native application create/edit/delete, unknown-field preservation and account
  session invalidation. This supersedes the earlier pending/failure entries above.
- The downloaded CI ZIP checksum matched its SHA256SUMS:
  `65b2915755a881e824d71de5fc4a159b03e2924e4d4554bd97615e41cc69e87c`.
  Its 146 entries include all eight React HTML pages and tray assets. No old UI,
  translation catalog paths, credentials, private keys or host-state files were
  found by the package-path audit. `releaseReady` remains false; the artifact has
  not been deployed over the user's installation.
- Additional browser checks verify device connection hooks/elevation, explicit
  recovery from log read errors, denied clipboard feedback, keyboard dialog close/
  focus restoration and Portuguese mobile navigation labels. These do not replace
  a comprehensive assistive-technology audit or actual device testing.
- Standalone native clock regression passed 19 assertions with UBSan. This is not
  a Windows host compilation or native web integration result.
- Strict TS and production build passed with generated route chunks.
- Dev HTTP regression passed for CSS, generated routes and Geist/Mono fonts.

Browser mock tests are not native authentication, live device action or streaming
benchmarks; only the separately identified Windows runner tests exercise the host.
No user's working host files/services/credentials/pairing were changed in this work.

## Visual reference

Geist/Vercel documentation informed contrast, density, typography and hierarchy:
https://vercel.com/geist/introduction. No Vercel branding or second component
library was added. Components come from the shadcn base-lyra/Base UI registry.

## Completion definition

Every identified flow must be reachable and exercised without a compatibility
page/dead control substituting for it. Verify contracts, unknown data, safe saves,
confirmations, fixed pt-BR, direct URL/reload, keyboard/mobile/theme behavior,
emitted assets, native integration and rollback/private-data handling. Until then,
this is migration work—not "100% complete" or device-validated.
