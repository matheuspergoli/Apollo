# Apollo frontend constraints

- This is Apollo. Do not introduce Golden branding, component prefixes or CSS classes.
- Use React/TypeScript, TanStack Router/Query, Tailwind utilities and semantic shadcn tokens.
- Use TanStack Router file-based routes and the official Vite plugin/code splitter.
  Do not maintain a manual createRoute/lazyRouteComponent tree or hand-edit generated routes.
- Use the regular shadcn Select, not NativeSelect. UI language scope is English and
  Brazilian Portuguese only; preserve old host locale values until explicitly changed.
- Before implementing a UI primitive, check the configured official shadcn registry.
  Use its source for controls, forms, dialogs, alerts, menus, tables and navigation
  wherever appropriate. Do not recreate an available primitive or wrap every primitive
  in an unnecessary project-specific component.
- Own components compose screens, domain behavior and providers. Ordinary semantic
  layout HTML remains appropriate; do not turn every layout into an abstraction.
- Keep official generated UI sources in components/ui and record any accessibility,
  correctness or lint adaptations in THIRD_PARTY_NOTICES.md. Do not disable lint
  broadly to accept generated code.
- Do not add Vue, Bootstrap, bespoke visual CSS classes or a second design system.
- Use the user's ~/monorepo as a read-only reference for conventions, not a source
  of private auth, infrastructure, environment or unrelated product dependencies.
- Do not add Start, DB, state libraries or generators without a concrete Apollo need.
- Keep exact compatible dependency versions and the package lock. Use npm ci in CI.
- Run Biome, strict TypeScript, unit tests, production build and relevant browser tests.
  Test labels, keyboard behavior, invalid/disabled/loading/error states, mobile and themes.
- Preserve backend contracts, existing settings and recovery. Do not deploy this partial
  migration over a working dashboard before parity/integration tests are complete.
- No invented live metrics or performance claims. Mocked API tests are not device tests.
- Never change the user's active host files, services, credentials or pairing during
  frontend development. Publish only to matheuspergoli/Apollo, never upstream.
