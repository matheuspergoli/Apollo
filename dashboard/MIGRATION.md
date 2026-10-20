# Frontend migration matrix

"Implemented" means source code exists, not that native/device gates passed.

| Area | Source implementation | Remaining validation |
|---|---|---|
| Host pages | Eight React HTML entries, file routes, automatic chunks | Authenticated native HTTP/asset integration |
| Welcome/login | Existing contracts, validation, timeout/retry, password manager | English localization; native auth |
| Overview | Config, library/client counts, current app, quick links; no fake metrics | More error fixtures and real host data |
| Settings | 104 keys/12 groups, OS filtering, search, command/display editors, review/save | More write/retry cases and malformed-data recovery |
| Config integrity | Unknown-key preservation, defaults, semantic conflict checks; mocked save/stale-save/unsaved-navigation cases pass | Native file roundtrip and concurrency limitations |
| Devices | PIN, OTP/QR/host override, 13 permissions, mode/hooks, disconnect/unpair/all | Browser actions/expiry and native pairing |
| Apps | All original fields, hooks, covers, order, launch/stop, .art/deep links | Browser actions/upload/search and native roundtrip |
| Account | Current/new credentials and invalidation feedback | Browser/native invalidation flow |
| Diagnostics | Bounded/deferred logs, filter/copy/download, recovery confirmations | Action/connection-loss browser and native checks |
| Layout | Official sidebar/sheet/Select, themes, local fonts | Complete mobile/keyboard/a11y/visual sweep |
| Languages | Scope is English + pt-BR; old host values are not silently reset | Both complete catalogs and switching |
| Build | HTML aliases and optional host staging implemented | Migrate CMake/root commands, remove legacy safely |
| Packaging | Old incompatible preview creation is blocked | Full package only after all gates; preserve private state |

## Current evidence

- The reviewed baseline contains 104 unique settings in 12 sections. One-time
  extraction produced checked-in metadata; it is not a Vue runtime dependency.
- 29 unit tests passed: API/cache, settings preservation/defaults/validation/
  fingerprints, app payloads/exports, device permission/URL handling.
- 19 Chromium tests with simulated APIs passed: access cases, all eight actual
  emitted HTML entries/reload, sidebar/search parameters, config saves preserving
  unknown structures, repeat saves, stale-save rejection, unsaved-navigation
  confirmation, regular NVENC Select and the two supported locale choices.
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
confirmations, both languages, direct URL/reload, keyboard/mobile/theme behavior,
emitted assets, native integration and rollback/private-data handling. Until then,
this is migration work—not "100% complete" or device-validated.
