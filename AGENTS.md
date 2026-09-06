# Agent instructions

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
