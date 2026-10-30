# Apollo repository

- Windows is the primary host platform. Preserve the existing Linux code; do not
  reintroduce other host backends or claim untested Linux packaging support.
- Use pnpm exclusively. package.json pins its version; pnpm-lock.yaml is the only
  JavaScript dependency lockfile. Run pnpm install --frozen-lockfile --ignore-scripts
  from the repository root. Do not upgrade dependencies as incidental cleanup.
- pnpm dev/build/check/typecheck/test/test:browser/verify delegate to dashboard.
  Read dashboard/AGENTS.md before changing the frontend.
- Keep C++ consistent with .clang-format and preserve native API/pairing contracts.
- Keep documentation about the software, not a developer's devices, paths or test
  sessions. Use generic fixtures. Development and test guidance belongs in
  docs/development.md; do not accumulate release checklists or personal handoffs.
- LICENSE defines Apollo's license. NOTICE preserves required third-party notices.
  The frontend build consolidates dependency notices automatically; do not remove
  legally required attribution or add per-component provenance documents.
- Never edit an active installation, credentials, pairing data, drivers, services or
  displays automatically. Tests that initialize a native host must remain isolated
  and guarded by the fork's CI environment.
- Publish only to matheuspergoli/Apollo. Do not move published release tags or replace
  release binaries during repository maintenance.
- Run relevant checks, not just formatting. Frontend: pnpm verify. Release tooling:
  python -m unittest discover -s tools/release -p 'test_*.py'. Native changes need
  native build/contract tests; API mocks do not prove device behavior or latency.

## Test and infrastructure boundaries

- Test Apollo-owned behavior and observable contracts: packaging, installation,
  updates, data preservation, authentication, API/UI behavior and error handling.
  Third-party internals and vendor installers are not our maintenance scope.
- Dependency integrity checks and Apollo integration tests are necessary; they do
  not mean reimplementing or certifying the dependency. Exercise the production
  integration boundary, not a parallel SDK client that only tests the vendor.
- Use suitable environments for device/OS integration. Do not patch vendor
  packages, extract/install drivers as CI workarounds, fetch replacement system
  components or change production behavior to make an unsuitable runner pass.
- Keep portable/package/service checks independent of hardware integration. An
  unavailable environment must be reported as untested, not as success or as an
  Apollo regression. Never silently skip a failed assertion or weaken security,
  data-preservation or update checks to obtain a green build.
- Before adding a test, helper, CI job or abstraction, identify the Apollo contract
  it protects and why existing coverage is insufficient. Prefer the smallest
  behavioral regression; avoid assertions tied only to source text or implementation
  details when an observable test is practical.
- Diagnose a failure before changing code. Bound waits and scope cleanup to test
  resources. Do not accumulate speculative fixes, temporary workflows, bespoke
  infrastructure or investigation logs in the repository.
- Document stable responsibilities and coverage limits in docs/development.md;
  keep release notes about user-visible changes. Do not claim full installation,
  streaming, security or hardware qualification based on mocks or partial CI.
- Review changes as a whole before release. Passing CI is necessary evidence, not
  a guarantee of zero defects; publish only artifacts tied to the reviewed commit
  and report any remaining release validation explicitly.
- Freeze release binaries before manual acceptance. Publish those exact hashes;
  documentation-only follow-ups must not silently replace or retag the tested build.
  Investigate warnings in context; do not suppress them merely to make logs look clean.
