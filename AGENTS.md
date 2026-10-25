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
