# One experimental Apollo package

> Historical delivery record, not the current build or launch procedure. The
> preview and its packager were removed. Use `dashboard/MIGRATION.md` and
> `dashboard/TESTE-NO-HOST.md` for the full React candidate. Descriptions below
> apply only to the earlier package and do not authorize reusing its native binary.

The user requested a single test ZIP and removal of older agent-generated ZIPs
and executables. Never remove the official installation or unknown downloads.
Preserve the user's settings, private keys, paired clients and app configuration.

## Contents and integration boundary

tools/release/package-test.py takes the verified native candidate artifact from
CI 39317972369 and the tested dashboard/dist. There is only one sunshine.exe.
The native source is 2ab32807f04d7cfdb45d2a25c51644f222724456; the script rejects
reuse if src/cmake/CMakeLists/src_assets changed since that commit. Changes in
this round are frontend/package-only, so recompilation of identical native
code is unnecessary. The exact native and frontend sources and hashes are recorded.

The working full UI is preserved unchanged at its existing endpoints. React
is an explicit opt-in preview under /assets/apollo-preview/index.html#/. It uses
relative build assets and TanStack hash history, so existing C++ static asset
handling serves it without adding rewrite/server routes or another process.
API calls remain same-origin /api/* with the existing backend authorization.
Successful React login stays inside the preview; full-UI links are real document
navigations styled with the official shadcn buttonVariants (not button ARIA roles).

This does NOT replace the full working dashboard with a partial migration.
Advanced settings/apps/pairing/recovery remain compatibility UI until migrated.
It does NOT mean Vue/Bootstrap have been eliminated from the whole host yet;
they remain confined to compatibility pages, not the new React entry/bundle.
No PyroWave, new display driver or device performance gain is claimed.

## Tests and delivery gates

- Biome, strict TypeScript, Vitest, build and Chromium tests.
- Test the nested preview path, same-origin API requests, login, hash deep links,
  refresh and full navigation back to compatibility settings with a simulated host.
- Verify every archive file hash; only one EXE; no service helper or driver/
  firewall installer. Preserve Apollo/shadcn/dependency license notices.
- ZIP contains only a public default sunshine.conf, never private config/state.
- Extracted local test folder may receive a LOCAL copy of the previous test's
  config after the secret-free ZIP is finalized; never rebuild the ZIP from it.
- Run only --version for native smoke validation without full host initialization.
  Record original service/process state before/after. Do not stop services or
  launch streams on behalf of the user during this preparation.
- Delete only individually identified old generated ZIP/EXE files whose hashes
  match known artifacts, after new-package validation and a fresh process check.
  Unknown/modified files are not cleanup targets. Retain old data outside Downloads
  as a local recovery backup; never publish that backup.

The launcher is explicit/manual, does not install/stop/restart services, refuses
concurrent hosts/occupied test ports and explains shared NVIDIA/display side
effects. User performs the actual stream test with local recovery access.

Delivery paths and final checksums are recorded in the local audit ledger, not
hardcoded with the user's machine-specific paths in public source.
