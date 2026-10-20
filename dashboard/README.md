# Apollo dashboard

React frontend migration. This is **not yet a replacement** for the currently
installed dashboard: settings, pairing, applications and recovery flows still
need functional parity. No host binary, driver, configuration or pairing data
is modified by developing/building this package.

## Stack

Stable registry versions checked on 19 October 2026:

- React/React DOM 19.3.1; TypeScript 7.0.2, strict mode.
- Vite 8.3.4 and official React plugin 6.1.2.
- Tailwind CSS and Vite plugin 4.3.3, standard utilities and semantic tokens.
- shadcn CLI 4.22.1, base-lyra/Base UI 1.9.0; component source checked in.
- TanStack Router 1.170.45 and Query 5.104.5.
- Biome 2.5.15, Vitest 5.0.5, Playwright 1.64.1.

Production and development dependencies are exact-pinned. This standalone
package commits package-lock.json; use npm ci. Existing host tooling and the
legacy Vue frontend have separate dependencies during migration.

The frontend workflow uses an explicit Ubuntu 24.04 runner and Node 24,
read-only permissions, no persisted Git credentials, a ten-minute timeout and
per-branch cancellation of superseded runs. Official checkout/setup-node/artifact
actions are pinned by commit (release versions annotated); preview retention is
seven days. This workflow does not install or operate the user's host.

## Commands

```sh
npm ci --ignore-scripts
npm run check
npm run typecheck
npm test
npm run build
npm exec playwright install --with-deps chromium
npm run test:browser
```

`npm run dev` serves only on 127.0.0.1:5174. No proxy to your real Apollo is
configured: deliberately avoid accidental credential/config writes during
development. Browser tests intercept the API and test a simulated host. Build
output is static under dist; it is not copied into the live host automatically.

## Organization

- main.tsx: provider composition and browser mount only.
- router.tsx: typed route tree and router factory; QueryClient in router context.
- pages/: page-specific orchestration; no artificial domain/repository layers.
- lib/api.ts: HTTP boundary, cancellation/timeout and allow-listed config cache.
- lib/query.ts: QueryClient lifecycle/defaults. No persisted auth cache.
- components/ui/: official shadcn sources; component variants use cva/cn.
- Form structure/errors, alerts and the theme select also use official shadcn
  Field/FieldGroup/FieldLabel/FieldError, Alert and NativeSelect components.
  Do not build bespoke controls when the configured registry already provides one.
- components/theme-provider.tsx: light/dark/system preference with cleanup.
- styles.css: semantic shadcn tokens and minimal global base, not handmade
  component selectors. No Bootstrap, Vue, Font Awesome or .golden-* classes.

## Reference to the user's monorepo

Read-only reference: biome.json; packages/ui/components.json, button.tsx and
libs/utils.ts; tooling/tailwind/index.css; apps/website/{vite.config.ts,
tsconfig.json,src/router.tsx,src/libs/query.ts,src/libs/db.ts}.

Adopted tabs, double quotes, no semicolons/trailing commas, 95-column formatting,
organized imports, exhaustive-dependency checks, no floating promises,
exhaustive switches and safe Tailwind class sorting (cva/cn/cx). Lint currently
has no suppressions/exclusions for application code. The Label source explicitly
forwards htmlFor/children so the association is visible to accessibility tooling.

Adapted rather than copied:

- Query uses a short stale window for host configuration, not infinite freshness.
  No automatic mutation retries or focus refetch. Mutations invalidate only the
  relevant data as flows are migrated; auth clears query snapshots.
- No SSR serializer or process-global SSR cache: the host serves static assets.
- Routes are code-based for three current screens; file-based generation is
  unnecessary yet. The tree remains typed and can grow without introducing a
  generator solely for convention.
- No tRPC/auth/database infrastructure from the monorepo was copied.

## TanStack Start and DB

Start **does support static SPA mode**; it is not rejected as incompatible.
It currently adds a build/shell convention without server functions or SSR that
Apollo needs. Router + the existing C++ API suffice for the first migration.
Reconsider Start if routing/prerender/deployment needs justify it.

TanStack DB is not installed just to duplicate Query's server-state cache.
Reconsider for collection-heavy application editing, local drafts/live queries
and synchronization when actual endpoint semantics and conflict handling exist.
Do not invent local persistence of security or driver settings.

## Current implementation and gates

Implemented: /welcome, /login and a factual read-only overview, light/dark/system,
API-backed auth mutations (not tested against a live host), safe config reads,
explicit missing-data and migration notices. Passwords stay in component state,
never localStorage or mutation variables. Native browser password-manager
autocomplete remains supported; this does not clear legacy saved credentials.

Before production replacement, migrate all existing routes: pairing/client
permissions, apps launch/edit/reorder, access/password management, full settings
(General, Files, Inputs, Network, AudioVideo, encoder-specific and Advanced),
logs, recovery and confirmations. Preserve current fields/unknown configuration
keys, validation and error behavior. Test direct URLs, refresh, authentication
expiry and C++ routes/static assets before changing the host packaging.

No settings editing, stream measurement or performance claim is made by this
package. Never deploy a partial React shell over a user's functioning dashboard.
Keep the existing installation and package as rollback until those gates pass.

An opt-in packaged preview may be served at
`/assets/apollo-preview/index.html#/` beside the unchanged full UI. That entry
uses hash history and relative assets, avoiding backend rewrite changes. All API
calls still use the existing same-origin authorization. Compatibility links force
document navigation to the complete existing pages; no incomplete React settings
screen replaces them. The packaged-host browser fixture tests this boundary but
does not substitute for native host/stream validation. See
`../docs/apollo-single-test-package.md` for packaging and cleanup gates.
