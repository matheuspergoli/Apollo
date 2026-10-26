# Apollo frontend constraints

- Preserve the approved dashboard design during refinement. Design skills are
  review guidance, not permission to change layout, typography, colors, copy or
  interaction. Visible changes require an explicit user request.
- Apply skill recommendations to this React/Vite/TanStack stack. Do not introduce
  Next.js, SWR, speculative memoization or new infrastructure to satisfy a generic
  guideline; require an observed Apollo problem and a relevant regression.
- Use Apollo branding only; do not add project-specific prefixes to primitives.
- Use React/TypeScript, TanStack Router/Query, Tailwind utilities and semantic shadcn tokens.
- Use TanStack Router file-based routes and the official Vite plugin/code splitter.
  Do not maintain a manual createRoute/lazyRouteComponent tree or hand-edit generated routes.
- Use the regular shadcn Select, not NativeSelect. The interface is fixed pt-BR.
  Do not add i18n libraries, providers, catalogs, language selectors, legacy language
  endpoints or opaque locale compatibility. The removed locale option must not be
  returned to the UI or persisted by a new config save. Never edit the active host autonomously.
- Before implementing a UI primitive, check the configured official shadcn registry.
  Use its source for controls, forms, dialogs, alerts, menus, tables and navigation
  wherever appropriate. Do not recreate an available primitive or wrap every primitive
  in an unnecessary project-specific component.
- Own components compose screens, domain behavior and providers. Ordinary semantic
  layout HTML remains appropriate; do not turn every layout into an abstraction.
- Keep official generated UI sources in components/ui and record significant accessibility,
  correctness or lint adaptations in docs/development.md. Do not disable lint
  broadly to accept generated code.
- Do not add Vue, Bootstrap, bespoke visual CSS classes or a second design system.
- Do not copy private authentication, infrastructure, environment files or unrelated
  product dependencies from external projects.
- Do not add Start, DB, state libraries or generators without a concrete Apollo need.
- Use pnpm exclusively, at the version pinned in package.json. The workspace and
  pnpm-lock.yaml live at the repository root. Install with
  pnpm install --frozen-lockfile --ignore-scripts. Do not create other lockfiles.
- Run Biome, strict TypeScript, unit tests, production build and relevant browser tests.
  Test labels, keyboard behavior, invalid/disabled/loading/error states, mobile and themes.
- Preserve backend contracts, existing settings and recovery. Run native integration
  checks before distributing changes to the packaged dashboard.
- No invented live metrics or performance claims. Mocked API tests are not device tests.
- Never change the user's active host files, services, credentials or pairing during
  frontend development. Publish only to matheuspergoli/Apollo, never upstream.
