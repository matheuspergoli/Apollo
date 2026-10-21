# Frontend migration matrix

"Implemented" means source code exists, not that native/device gates passed.

| Area | Source implementation | Remaining validation |
|---|---|---|
| Host pages | Eight React HTML entries, file routes, automatic chunks | Authenticated native HTTP/asset integration |
| Welcome/login | Existing contracts, validation, timeout/retry, password manager; fixed pt-BR | Native auth |
| Overview | Config, library/client counts, current app, quick links; no fake metrics | More error fixtures and real host data |
| Settings | 102 active keys/12 groups, OS filtering, search, command/display editors, review/save | More write/retry cases and malformed-data recovery |
| Config integrity | Unknown-key preservation, defaults, semantic conflict checks; mocked save/stale-save/unsaved-navigation cases pass | Native file roundtrip and concurrency limitations |
| Devices | PIN, OTP/QR/host override, 13 permissions, mode/hooks, disconnect/unpair/all; browser PIN validation/rejection, OTP expiry/phrase invalidation, rename/permission preservation, invalid display rejection and disconnect/revoke/cancel/failure verified | Full permission/hook editing, unpair-all and native pairing |
| Apps | All original fields, hooks, covers, order, launch/stop, .art/deep links; browser edit/unknown-field preservation/rejected save/order/launch/stop/delete verified | Creation/upload/search/export browser flows and native roundtrip |
| Account | Current/new credentials; browser mismatch/rejection/success/clearing/relogin flows verified | Native invalidation flow |
| Diagnostics | Bounded/deferred logs; browser text safety/filter/full download, recovery confirmation/cancel and connection-loss semantics verified | Clipboard/error flows and native checks |
| Layout | Official sidebar/sheet/Select, themes, local fonts | Complete mobile/keyboard/a11y/visual sweep |
| Language | Fixed pt-BR; i18n/providers/catalogs/selector/Crowdin/gettext and language API removed; locale writes rejected | Verify native build and scan runtime dependency graph |
| Build | HTML aliases, managed clean staging, native CMake now uses the single React package; legacy source/dependencies removed | Verify native packaging and preserved tray assets |
| Packaging | Old incompatible preview creation is blocked | Full package only after all gates; preserve private state |

## Current evidence

- The reviewed baseline had 104 entries. Locale was removed by request, and an
  inert old UI-only HDR toggle was retired in favor of the already supported HDR
  toggle-delay field. The schema now has 102 real native settings in 12 groups.
  The one-time multilingual extraction tool and its old sources are gone.
- 32 unit tests passed: single-language source/dependency guards, API/cache, settings preservation/defaults/validation/
  fingerprints, app payloads/exports, device permission/URL handling.
- 40 Chromium tests with simulated APIs passed: access cases, all eight actual
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
- Standalone native clock regression passed 19 assertions with UBSan. This is not
  a Windows host compilation or native web integration result.
- Strict TS and production build passed with generated route chunks.
- Dev HTTP regression passed for CSS, generated routes and Geist/Mono fonts.

These are not native authentication, live device action or streaming benchmarks.
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
