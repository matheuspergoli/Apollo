# Apollo dashboard

Full React migration **in progress**, not yet a replacement release. All eight
host page entries have React implementations. The remaining gates—action-flow
tests, English/pt-BR localization, native integration and legacy removal—are
tracked in [MIGRATION.md](MIGRATION.md). No complete test ZIP is claimed yet.

## Stack

React/DOM 19.3.1, strict TypeScript 7.0.2, Vite 8.3.4/React plugin 6.1.2,
Tailwind/Vite plugin 4.3.3, Query 5.104.5, Router 1.170.45, official Router Vite
plugin 1.168.47/generator 1.167.45. Biome 2.5.15, Vitest 5.0.5, Playwright 1.64.1.
Versions are exact-pinned with package-lock.json and checked against actual peer
compatibility; TanStack packages do not all share identical release numbers.

Use official shadcn base-lyra/Base UI sources for primitives. Use the regular
Select, not NativeSelect. Own components compose Apollo behavior/screens rather
than recreating controls. Tailwind utilities and semantic tokens replace bespoke
visual classes; .dark is the standard theme selector. No Vue/Bootstrap runtime
exists in this package. Only English and Brazilian Portuguese are in UI scope.

The user's ~/monorepo was read for Biome, shadcn, theme, TS and Router/Query
conventions. No private auth, tRPC, infrastructure, DB or environment was copied.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source/license changes.

## Commands

```sh
npm ci --ignore-scripts
npm run routes:generate
npm run check
npm run typecheck
npm test
npm run check:dev
npm exec playwright install --with-deps chromium
npm run test:browser
npm run dev
```

`pnpm dev` also runs the script when dependencies are installed. The committed
installation lock is npm's; do not mix installers/lockfiles in one checkout.
Dev binds 127.0.0.1:5174 and does not proxy to the real host automatically. Without
the native API or test fixture, API-backed screens show an error, not fake data.
`test:browser` builds fresh assets first to prevent stale-dist test results.

## File-based routes

`src/routes/__root.tsx` owns typed QueryClient context and global boundaries.
`_host.tsx` is the pathless sidebar layout; its files map to the existing host
URLs. Login/welcome are outside that layout. Screen/domain logic stays in pages/,
features/ and lib/. router.tsx only creates the router from routeTree.gen.ts.

The official Vite plugin runs **before React**, generates the tree and splits
route components automatically. Generated files/.tanstack output are ignored by
Git and Biome. Pre-typecheck generation uses the official ESM Generator/getConfig
API, avoiding the current CLI CommonJS circular-export warning without hiding
warnings or manually generating a tree. No TanStack Start is required.

Intent preloading loads route code, never mutations. Query owns freshness and
cancellation. No automatic mutation retries or focus refetch. No DB was added
merely to duplicate Query's server-state cache. Start does support static SPA;
revisit it only for concrete deployment/SSR/server-function requirements.

## Organization and integrity

- main.tsx: mount/providers; router.tsx: router factory.
- routes/: small typed file routes/search/boundaries.
- pages/: screens and request/user-action orchestration.
- features/settings/: 104 baseline fields, defaults, validators and structured
  command/display editors; apps/devices: payload and protocol handling.
- lib/: HTTP/cache/download boundaries; components/: Apollo composition.
- components/ui/: official shadcn source, cva/cn variants and recorded adaptations.
- styles.css: semantic tokens, minimal base and local font imports.

Config POST rewrites the file. Preserve unknown fields/structures, strip response
metadata/defaults, validate first and compare a fresh snapshot before saving.
This is a best-effort conflict check, not atomic CAS: the backend has no revision
contract. Saving and restarting are separate. Destructive/session actions require
confirmation; connection loss is not evidence a restart/quit succeeded. Logs can
contain private data. Never invent metrics or claim device performance gains.

## Build/development regression checks

Fontsource 5.3.0 does not contain latin.css despite its wildcard export. Supported
package entry imports are used; unicode-range limits actual browser font downloads.
`check:dev` starts/closes its own ephemeral server and verifies CSS, generated
routes and both Latin font resources over HTTP, without stopping the user's dev.

`build` emits all eight HTML filenames read by C++ and absolute /assets URLs,
supporting direct URLs/trailing slashes. `build:host` also stages generated assets
under SUNSHINE_ASSETS_DIR/assets/web, not the user's installation. Source maps
are opt-in with APOLLO_UI_SOURCEMAP=true. The host fixture serves the actual HTML
files, not a catch-all that could conceal missing host entries.

The old hash-preview packager rejects this new full-migration output. Do not
deploy over the working host, remove rollback data or release a "complete" ZIP
until the migration matrix and native integration gates are satisfied.
