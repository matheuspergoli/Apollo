# Component provenance

The button, input, label, card, native-select, alert, field and separator files
under src/components/ui were generated
from the official shadcn/ui registry using `shadcn@4.22.1 add ...`, base-lyra,
Base UI variant, on 19 October 2026. They are source-owned components, not a
runtime shadcn component library. See SHADCN_LICENSE.txt.

Local adaptations: Label explicitly forwards htmlFor/children for accessibility
linting. Field uses a native fieldset instead of div role=group, uses strict
equality, and keys deduplicated error messages by message rather than array
index. These are small source adaptations, not replacement implementations.
Biome also formats/import-sorts/class-sorts registry output. No lint rules were
disabled to accept generated components. NativeSelect uses Tabler icons, matching
the configured registry and the user's reference monorepo.

The user's MIT-licensed ~/monorepo was read as a design/organization reference:
packages/ui/components.json, button.tsx, libs/utils.ts, tooling/tailwind/index.css,
apps/website/src/router.tsx, libs/query.ts, libs/db.ts and vite.config.ts.
No private account, auth implementation, tRPC endpoint, database or environment
configuration was copied. Token names/palette follow the standard shadcn zinc
theme and the user's light/dark conventions. Application code is new.

This frontend is part of the GPL-3.0-only Apollo fork. Retain the upstream Apollo
LICENSE and NOTICE when distributing it with the host. npm dependencies retain
their respective licenses; this file does not replace their notices.
