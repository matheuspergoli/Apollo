# Golden dashboard — first functional slice

Branch golden/dashboard includes the isolated clock correction commit.
This is a first implementation, not the completed UI redesign.

The home page now includes GoldenOverview.vue, a responsive Portuguese panel
for the personal RTX 4060 → S25+ target. Existing pairing, resources, version
information and configuration pages remain available. No extra runtime UI
dependency was added.

The panel reads the authenticated existing GET /api/config endpoint; it never
writes settings, launches applications, restarts the host or manipulates a
driver. Fetch has an eight-second timeout, explicit HTTP/authentication errors,
unmount cancellation and manual refresh. No background polling loop is added.

Important data contract: confighttp.cpp getConfig parses the configuration FILE,
not the effective stream settings. The panel labels that distinction and treats
missing keys as unspecified/default. Driver status is the last value supplied
by the host, not proof of HDR/refresh or active output. Device specifications
shown in the heading are project targets, not automatic detection.

No codec/FPS/latency gauges are invented. PyroWave and the new display backend
are explicitly marked unintegrated. No preset selector pretends to apply
unimplemented profiles. Values are interpolated as text, not inserted as HTML.

## Tests run

- node --test tools/golden/test_overview.mjs: five tests passed, covering rejected
  responses, omitted defaults, configured values, all known driver failures,
  unknown values and prototype-property names.
- npm run build: all eight existing Vite page entries built successfully;
  reported transform/build duration 2.28 seconds (frontend only, NOT host EXE).
- Upstream warning: assets/css/apollo.css absent at build time, left for runtime
  resolution. Not silently treated as a fully styled installed-page validation.
- Dependencies installed with npm install --ignore-scripts --package-lock=false;
  no manifest/dependency upgrades were made. This does not make dependency
  resolution reproducible; lockfile/toolchain policy remains a separate task.

Not yet tested: browser rendering, screen reader, keyboard navigation, light/dark
contrast, real authentication/session expiration and live Windows host endpoint.
Those are acceptance gates before distributing this as a validated dashboard.

## Next UI slices

1. A versioned read-only effective-session endpoint with validity timestamps,
   explicit source, metric scope and missing-data semantics.
2. Session/display identity, capture backend and negotiated codec/HDR/FPS.
3. Stage timings as separate distributions with sample windows; never represent
   their sum as physical input-to-photon latency.
4. Profile preview/diff with validation and reversible apply, without silently
   changing driver, topology or an active session.
5. Guided recovery with impact/confirmation; preserve existing advanced pages.
6. Sanitized local export: no private keys, tokens or full pairing state.
