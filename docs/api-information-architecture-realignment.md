---
name: api-information-architecture-realignment
description: Product-wide API ownership inventory, target route policy, and staged compatibility plan
status: active-implementation-plan-session-wave-complete
date: 2026-09-06
architecture: docs/information-architecture-domain-model-realignment.md
---

# API information architecture realignment

## Purpose

Align the HTTP API with the adopted product ownership model. A route should make the resource being
addressed and its immediate authoritative parent unambiguous wherever that relationship constrains
identity, authorization, lifecycle, or mutation. URL nesting is explanatory context, not the
integrity mechanism: every nested operation must scope parent and child together in its query and
must preserve the relationship through database constraints where practical.

This is a product-wide policy. The Campaign Session hierarchy is the first implementation wave, not
an isolated naming cleanup.

## Delivery status

The Session hierarchy wave is implemented. Canonical GM routes now enforce the Campaign Definition
and Campaign Instance ancestry, public invitation entry points live beneath `/api/invitations`, and
authenticated participant operations live beneath `/api/me`. First-party web callers use these
routes. The former Session and participation routes remain temporary compatibility aliases and emit
`Deprecation: true`; no sunset date has been announced.

The remaining route families in this document are target architecture, not claims of completed
implementation. The next planned wave is the Campaign Instance hierarchy.

## Binding route principles

1. Use plural, lowercase, kebab-case resource nouns.
2. Nest a resource under its immediate authoritative parent when the child cannot exist or be
   addressed meaningfully without that parent.
3. Do not repeat the complete ancestry when an intermediate aggregate already provides a stable,
   enforceable ownership boundary.
4. Keep peer aggregates top-level even when one captures or references another. In particular,
   Campaign Definitions remain a peer library to Worlds; their captured World revision is
   provenance, not World-owned mutable content.
5. A Campaign Instance is permanently associated with one Campaign Definition lineage even as it
   adopts later compatible revisions. Instance routes therefore nest beneath that stable Definition
   identity.
6. Sessions, memberships, invitations, Characters, Agent participations, runtime, Plot progress,
   and realized placements are Campaign Instance children.
7. Definition drafts, revisions, Plots, authored placements, and migrations are Campaign Definition
   children. World revisions and World-authored content are World children.
8. Remove a parent identifier from a request body when the route supplies it. A body may still name
   a referenced resource or selected revision when that is the substance of the command.
9. Every child lookup and mutation uses all available parent identities, authenticated ownership,
   and lifecycle predicates. A lookup by child ID followed by an unchecked comparison is not the
   preferred authorization boundary.
10. Public token resolution, authentication, health, and a person's `/me` projection remain
    deliberately un-nested because the caller does not yet possess authoring provenance.
11. Internal identifiers may occur in paths and command values but never become visible labels or
    error-message fallbacks.
12. Lifecycle transitions and other domain commands use explicit `POST` action resources when CRUD
    semantics would permit invalid whole-state replacement.
13. Collections must have a deterministic order and bounded pagination. Cursor pagination is the
    default for event/history streams; small administrative lists may use bounded page/limit
    pagination.
14. Existing APIs remain unversioned during this internal transition. Canonical aliases,
    deprecation headers, client migration, and measured removal are preferable to introducing a
    misleading `/v1` boundary around already-changing contracts.

## Canonical route families

```text
/api/worlds
/api/worlds/:worldId
/api/worlds/:worldId/draft
/api/worlds/:worldId/revisions
/api/worlds/:worldId/atlas/locations/:locationId
/api/worlds/:worldId/bestiary/creatures/:creatureId
/api/worlds/:worldId/item-compendium/items/:itemId
/api/worlds/:worldId/character-model/:definitionKind/:definitionId
/api/worlds/:worldId/model-adoptions

/api/campaigns
/api/campaigns/:campaignDefinitionId
/api/campaigns/:campaignDefinitionId/draft
/api/campaigns/:campaignDefinitionId/revisions
/api/campaigns/:campaignDefinitionId/plots/:plotDefinitionId
/api/campaigns/:campaignDefinitionId/placements/:placementId
/api/campaigns/:campaignDefinitionId/world-migrations

/api/campaigns/:campaignDefinitionId/instances
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/runtime
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/plots/:plotDefinitionId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/placements/:realizationId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/memberships/:membershipId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/invitations/:invitationId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters/:characterId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/agents/:agentParticipationId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/snapshots/:snapshotId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/migrations
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/restores

/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/participants/:participationId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/invitations/:invitationId
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/events
/api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/summary

/api/players
/api/players/:playerId
/api/model-registries/:registryId
/api/media/:mediaAssetId
/api/ai/generations
/api/settings/system/:systemArea

/api/invitations/instance/resolve
/api/invitations/instance/accept
/api/invitations/session/resolve
/api/invitations/session/respond
/api/me/resumable-session
/api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId
/api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence
/api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/events
/api/auth/session
/api/auth/me
/api/auth/logout
/api/health
```

The route family describes ownership; it does not require one controller or table per path segment.
Visible web routes may use shorter task-oriented paths while the API retains the parent needed for
integrity.

## Current API inventory and disposition

| Current controller/root                       | Current responsibility                                                 | Finding                                                                                                | Target disposition                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/world-definitions`                      | World lineage, draft, publication, archive, fork                       | Correct aggregate but vocabulary differs from product IA; content remains split into generic resources | Move to `/api/worlds`; nest World-authored libraries and revisions as they leave generic persistence                                          |
| `/api/worlds/:id`                             | Destructive legacy root-Location World operation                       | Collides conceptually with the target first-class World resource                                       | Retire after archive/retention replacement; never let it define target `/worlds` semantics                                                    |
| `/api/campaign-definitions`                   | Definition draft/revision lifecycle and World migration                | Correct aggregate boundary but product route uses Campaigns                                            | Move to `/api/campaigns`; keep captured World revision as an explicit reference/command input                                                 |
| `/api/campaign-instances`                     | Instance creation, runtime, roster, migrations, restores, Sessions     | Definition→Instance parent is absent; one broad controller mixes several child aggregates              | Move beneath `/api/campaigns/:campaignDefinitionId/instances`; split controllers by child resource without splitting domain transactions      |
| `/api/campaign-instance-invitations`          | Public Instance/Session token workflows and participant Session access | Mixes public tokens and authenticated `/me` operations under an implementation name                    | Move tokens to `/api/invitations/...`; move authenticated projections/presence to `/api/me/...`                                               |
| `/api/campaigns/:campaignId/invitations`      | Legacy Campaign membership/invitation                                  | `campaignId` is definition/instance ambiguous                                                          | Quarantine and retire after Instance membership migration; do not alias into the canonical Campaign Definition route                          |
| `/api/campaigns/:campaignId/character-drafts` | Legacy Campaign-scoped Character creation                              | Character ownership is ambiguous and incompatible with Instance binding                                | Replace with nested Instance Character workflows; retain only explicit compatibility reads during migration                                   |
| `/api/character-drafts`                       | User draft listing and edits                                           | Resumable user task can be top-level, but its target Instance must be explicit                         | Move listing to `/api/me/character-drafts`; create beneath an Instance or require an immutable Instance association                           |
| `/api/model-registries`                       | GM-owned model registry and releases                                   | Legitimate top-level authored aggregate                                                                | Keep top-level; add explicit World adoption routes and stable release resources                                                               |
| `/api/domain/:resource`                       | Generic CRUD for heterogeneous legacy resources                        | Bypasses aggregate ownership and encodes structure in payload/resource strings                         | Freeze new canonical writes, migrate by aggregate, then remove; never expose it as the extension mechanism                                    |
| `/api/ai/...`                                 | AI-assisted aggregate/content commands and generation history          | Several routes target legacy World/Location identities; generic generation can bypass owning context   | Nest generation commands under canonical owners or require immutable snapshot provenance; keep `/api/ai/generations` as bounded audit history |
| `/api/media`                                  | Media asset CRUD/download                                              | Asset identity is infrastructure-level, but attachment ownership/provenance is implicit                | Keep asset reads top-level; create/attach through owning aggregate context and enforce provenance                                             |
| `/api/graph/tuples`                           | Derived graph query and direct mutation                                | Direct tuple writes can compete with authoritative aggregates                                          | Move operational controls under system administration; derive domain relationships through the indexing boundary                              |
| `/api/auth`                                   | Development GM session, current user, logout                           | Correct top-level security boundary; development naming is not final provider architecture             | Keep top-level, replace `gm-session` with provider-neutral session/bootstrap flows                                                            |
| `/api/health`                                 | Process health                                                         | Correct deliberate top-level exception                                                                 | Keep                                                                                                                                          |

## Relationship audit

### Relationships that require contextual nesting

| Parent → child                                                     | Why nesting matters                                                                             | Required integrity check                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Campaign Definition → Campaign Instance                            | Prevent an Instance from being addressed through a different Definition lineage                 | Query by Definition ID, Instance ID, and owner; database preserves stable Definition lineage FK  |
| Campaign Instance → Session                                        | Session lifecycle and runtime boundaries belong to exactly one Instance                         | Query by Definition ID, Instance ID, Session ID, owner/membership, and relevant lifecycle status |
| Session → participation/invitation/event/summary/boundary          | These identities are meaningless outside one Session and can otherwise be mixed across Sessions | Composite Session/Instance foreign keys plus scoped service queries                              |
| Campaign Definition → Plot/placement/revision                      | Prevent cross-Definition authored content mutation                                              | Definition/child composite query and revision/draft lifecycle check                              |
| World → revision/Location/Creature/Item/model adoption             | Prevent same-named or opaque IDs from crossing Worlds                                           | World/child scoped query and captured-revision validation                                        |
| Campaign Instance → membership/Character/Agent/runtime realization | Prevent cross-Instance identity, capability, or mutable-state leakage                           | Definition/Instance/child scoped query and same-Instance composite FK                            |

### Relationships that should remain references rather than route ancestry

- Campaign Definition → captured World revision: the Definition is a peer authored aggregate and the
  capture is immutable provenance.
- Campaign Instance → currently adopted Campaign/World revisions: revision adoption changes while
  stable Definition lineage and Instance identity do not.
- Session → runtime boundary snapshot: the snapshot is referenced evidence, not Session-owned data.
- Domain content → media asset: media infrastructure retains provenance but is not nested for every
  download/read.
- World/Campaign → model registry release: adoption references an independently authored registry.

### Deliberately un-nested entry points

- token resolution and acceptance before authenticated context exists;
- authentication and first-administrator bootstrap;
- health/readiness probes;
- `/me` task projections selected from the authenticated identity; and
- cross-aggregate search/audit endpoints that return authorized projections rather than writable
  domain records.

## Session first implementation wave

The first wave introduces canonical GM Session routes beneath the stable Campaign Definition and
Campaign Instance parents:

```text
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId
PATCH /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId
PUT  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/participants
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/invitations
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/invitations/:invitationId/actions/retry
DELETE /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/invitations/:invitationId
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/participants/:participationId/actions/eject
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/readiness
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/events
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/summary
PUT  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/summary
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/sessions/:sessionId/actions/:command
```

The controller must reject a valid Instance/Session pair presented beneath the wrong Campaign
Definition with the same neutral not-found response used for an unavailable resource. The client
must obtain the stable Campaign Definition identity from the Instance projection; it must not infer
it from the selected snapshot revision.

Participant token entry remains un-nested. After authentication, participant access moves to:

```text
GET  /api/me/resumable-session
GET  /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId
POST /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence/join
POST /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence/heartbeat
POST /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence/leave
GET  /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/events
```

The authenticated membership supplies the person/Agent relationship; Campaign Definition ancestry
is not part of the participant's task and need not be repeated.

## Compatibility and rollout

1. Add canonical controllers as aliases over the same services; do not duplicate domain logic.
2. Add parent-scoped authorization tests before exposing each canonical route.
3. Preserve existing routes temporarily and mark responses with `Deprecation: true` plus a `Link`
   header naming the successor where a single successor exists. Do not announce a `Sunset` date
   until every first-party caller and migration tool has moved.
4. Migrate `apps/web`, server read models, tests, scripts, and AI/tool callers to canonical routes.
5. Reject redundant or contradictory parent IDs in new request bodies. Legacy aliases may translate
   old shapes only at the compatibility controller boundary.
6. Inventory access logs and repository callers. Remove an alias only after there are no first-party
   calls, persisted identifiers are classified, and rollback documentation exists.
7. Return `410 Gone` after an announced sunset rather than silently reinterpreting an old ambiguous
   route.
8. Remove legacy controllers, DTO compatibility fields, and generic write authority in bounded
   aggregate waves. Never combine route removal with destructive data deletion.

## Subsequent waves

1. **Session hierarchy:** canonical GM and `/me` routes, scoped authorization, client migration,
   compatibility headers.
2. **Campaign Instance hierarchy:** creation/listing beneath Campaign Definition; runtime, roster,
   Characters, Agents, migrations, restores, and continuation.
3. **Campaign and World authoring:** product vocabulary, revision resources, Plots, placements, and
   World libraries.
4. **Identity and participation:** Players, Instance memberships/invitations, Character workflows,
   provider-neutral authentication, and first-admin bootstrap.
5. **Model, AI, media, graph, and Settings:** explicit adoption/provenance and system-operator
   boundaries.
6. **Legacy removal:** ambiguous `campaignId`, singleton World operations, generic domain writes,
   obsolete redirects, compatibility types, and migration-only code.

## Acceptance criteria

- Every canonical child route proves its parent relationship in the authorization query.
- Presenting a real child beneath the wrong parent returns a neutral not-found response and causes
  no write.
- No canonical payload can rebind a child by supplying a different parent ID.
- Instance migration changes captured revisions without changing the stable Definition parent in
  its route.
- Public invitation and `/me` routes remain usable without fabricated authoring ancestry.
- First-party callers use canonical routes before an old alias receives a sunset date.
- Deprecated aliases are observable, tested, documented, and removed only through an explicit
  compatibility gate.
- Collection pagination, status codes, error shapes, authorization, and rate limits are reviewed in
  each wave rather than deferred to a final bulk rewrite.
- Excluded documentation is never used to justify retaining an ambiguous legacy route.
