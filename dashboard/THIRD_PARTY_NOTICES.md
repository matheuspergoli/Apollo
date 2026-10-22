# Component provenance

Files under src/components/ui and the mobile hook were generated from the official
shadcn/ui registry using `shadcn@4.22.1 add ...`, base-lyra/Base UI, on 19–20 October
2026. They include controls, Field/Card/Alert, Select, Sidebar/Sheet, dialogs,
Table/Tabs, loading, switches, tooltips and scrolling. NativeSelect was removed
in favor of the regular Select. These are source-owned components, not a runtime
shadcn library. See SHADCN_LICENSE.txt.

Local adaptations: Label explicitly forwards htmlFor/children for accessibility
linting. Field uses a native fieldset instead of div role=group, uses strict
equality, and keys deduplicated error messages by message rather than array
index. These are small source adaptations, not replacement implementations.
Biome also formats/import-sorts/class-sorts registry output. No lint rules were
disabled to accept generated components. Sidebar preferences use localStorage
instead of an unconsumed server cookie in this client-only app; redundant setter
dependencies were removed. Components use the registry's Tabler icon selection.
Dialog and Sheet close-button text is fixed to pt-BR ("Fechar"), including
screen-reader-only labels; no translation provider or catalog is used.
Sidebar mobile title/description and toggle labels also use fixed pt-BR text.
Tabs orientation variants use Base UI's `data-orientation` attributes and forward
the orientation prop; horizontal tab buttons have a bounded height to avoid stretch.
Section-template ZIPs use fflate 0.8.3 (MIT), loaded on demand for export. Archives
contain generated default configuration and documentation, not current host state.
The separate global saved-configuration export also uses fflate and includes only
known saved settings after explicit privacy confirmation; it is not an encrypted
backup of accounts, pairing or certificate contents.

Geist/Geist Mono variable font data are Fontsource 5.3.0 packages under OFL-1.1;
their supported CSS entry points and local font files are used, not a CDN. The
Apollo favicon/logo are copied from the original repository assets. The QR code
encoder is qrcode 1.5.4 (MIT); tw-animate-css 1.4.0 (MIT) supplies standard component
animations. Preserve dependency notices when producing the full package.

The user's MIT-licensed ~/monorepo was read as a design/organization reference:
packages/ui/components.json, button.tsx, libs/utils.ts, tooling/tailwind/index.css,
apps/website/src/router.tsx, libs/query.ts, libs/db.ts and vite.config.ts.
No private account, auth implementation, tRPC endpoint, database or environment
configuration was copied. Token names/palette follow the standard shadcn zinc
theme and the user's light/dark conventions. Application code is new.

This frontend is part of the GPL-3.0-only Apollo fork. Retain the upstream Apollo
LICENSE and NOTICE when distributing it with the host. npm dependencies retain
their respective licenses; this file does not replace their notices.
