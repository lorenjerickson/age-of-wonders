# Agent instructions

## Project continuity

Read the root `BACKLOG.md` at task start and update current status, verification,
and next steps before handoff. Preserve deferred work without expanding task scope.

## UX/UI design requirements

Always accommodate desktop and mobile in UI design work, with both sizes represented in Figma
deliverables. Prefer a shared responsive layout and reusable components over separate desktop and
mobile implementations. Use the Setup page in the Wanderlust Figma document as the reference for
information architecture and navigation; do not use the existing application UI or code as a UI
design model. Use strict wireframes with placeholder data: no branding or decorative styling;
color may distinguish states only. The domain model remains valid unless UX work reveals a gap.

Use compact navigation with progressive disclosure as a guiding principle for mobile design.
Prioritize space for the primary content or task. Prefer a single navigation row with the current
destination and frequent actions visible; reveal global navigation, secondary destinations,
filters, options, and supporting context through menus or drawers as needed. Avoid stacking
persistent navigation bars, toolbars, and context strips. During focused tasks such as map
placement, replace the navigation row with task status and Cancel rather than adding another row,
then restore navigation when the task completes or is cancelled. Preserve context and state when
panels close, and keep controls discoverable with touch targets of at least 44 px. Compactness
should come from showing fewer controls at once, not shrinking text or touch targets.

Arrange each new Figma feature on its own canvas row, horizontally offset to the right of its
entry point, following Setup's layout. Keep desktop/mobile views together. Place components and
guidance at the far right of the row where they are used.

For the current Worlds design effort, keep all Figma work on the Worlds page of
`https://www.figma.com/design/S7tO3QWu6FD5D4P9xSq38f/Wanderlust?node-id=2003-2`.

## Documentation authority

Read `docs/README.md` before using repository documentation for product, architecture, domain,
planning, or generation work. It identifies the canonical architecture, active supporting
documents, historical implementation records, and an explicit exclusion registry.

Documents marked `status: deprecated` or listed in the exclusion registry must not be used as
requirements, architectural evidence, planning input, retrieval context, or AI-generation context.
Read them only when the user explicitly requests historical analysis or migration archaeology, and
then treat them solely as superseded history. Never use a deprecated document to override current
code, canonical architecture, active requirements, or the TypeScript domain source of truth.

## Domain model documentation

`packages/common/src/types` is the source of truth for the Age of Wonders domain model.

Whenever a change adds, removes, renames, or changes the semantics of a domain type, field,
discriminant, relationship, identifier, extension convention, or persisted resource mapping, update
`apps/api/src/ai/prompts/domain-model.md` in the same change. Keep its AI generation contracts,
examples, resource table, and subsystem summaries synchronized with the implemented TypeScript
types and `apps/api/src/domain/domain-resource.ts`.

Before completing a domain-model change, actively compare the affected source types with the
documentation and state in the verification summary whether the AI-facing domain model guide was
updated or remained accurate. Do not treat generated declarations, API docs, or the Markdown guide
as more authoritative than `packages/common/src/types`.

## GM-facing identifiers

Never display a GUID, UUID, database ID, definition ID, entity ID, item ID, media asset ID, or other
opaque internal identifier to the GM in application content. Internal IDs may appear in URLs. For
all visible labels, tables, cards, forms, references, and error-free empty states, resolve the ID to
human-readable information such as a name, image, type, or short description. If resolution fails,
show a neutral human-readable fallback without exposing the identifier.
