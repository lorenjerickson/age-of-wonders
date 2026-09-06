---
name: api-information-architecture-realignment
description: Product-wide API ownership inventory, target route policy, and staged compatibility plan
status: active-implementation-plan-session-concurrency-corrected
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

The Session—including active-only installation concurrency—Campaign Instance, Campaign/World
authoring, identity/participation, Auth0 adapter,
writable hosted-Settings slice, system-boundary, legacy-removal, Instance-native Character-sheet,
Character completion/review, and first-party one-way Character import waves are implemented.
Canonical GM routes enforce Campaign Definition, Campaign Instance, and World ancestry; public
invitation entry points live beneath `/api/invitations`; and authenticated locator and participant
projections live beneath `/api/me`. First-party web callers use the canonical authoring roots
`/api/worlds` and `/api/campaigns`. The former
`/api/world-definitions`, `/api/campaign-definitions`, top-level Campaign Instance and Session,
implementation-named participation, generic domain, raw graph, ambiguous Campaign invitation, and
destructive root-Location World routes are no longer registered.

Route families not named in the completed-wave sections remain target architecture, not claims of
completed implementation. Plugin and broader operational administration, Auth0 provider
administration beyond deployment configuration, and fully contextual World/Campaign AI and media
commands remain separate follow-up work.

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
/api/worlds/:worldId/media

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
/api/model-registries/:registryId/releases
/api/media/:mediaAssetId
/api/ai/generations
/api/settings/system/:systemArea

/api/invitations/instance/resolve
/api/invitations/instance/accept
/api/invitations/session/resolve
/api/invitations/session/respond
/api/me/active-session
/api/me/campaign-instances/:campaignInstanceId/characters
/api/me/campaign-instances/:campaignInstanceId/characters/options
/api/me/campaign-instances/:campaignInstanceId/characters/:characterId
/api/me/campaign-instances/:campaignInstanceId/characters/:characterId/attribute-rolls
/api/me/campaign-instances/:campaignInstanceId/characters/:characterId/actions/submit-for-review
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

| Current controller/root                       | Current responsibility                                                 | Finding                                                                                              | Target disposition                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/world-definitions`                      | World lineage, draft, publication, archive, fork                       | Removed; canonical `/api/worlds` owns authoring, revisions, and World-library projections            | Do not restore or generate                                                                                                                    |
| `DELETE /api/worlds/:id`                      | Destructive legacy root-Location World operation                       | Removed; versioned World lifecycle is archive-first                                                  | Do not reinterpret as versioned World deletion                                                                                                |
| `/api/campaign-definitions`                   | Definition draft/revision lifecycle and World migration                | Removed; canonical `/api/campaigns` owns the complete Definition lifecycle                           | Do not restore or generate                                                                                                                    |
| `/api/campaign-instances`                     | Instance creation, runtime, roster, migrations, restores, Sessions     | Removed after migration beneath stable Campaign Definition ancestry                                  | Use `/api/campaigns/:campaignDefinitionId/instances`                                                                                          |
| `/api/campaign-instance-invitations`          | Public Instance/Session token workflows and participant Session access | Removed after token and participant operations moved to `/api/invitations` and `/api/me`             | Do not restore or generate                                                                                                                    |
| `/api/campaigns/:campaignId/invitations`      | Legacy Campaign membership/invitation                                  | Removed; the ambiguous identity cannot be translated safely                                          | Use Instance-owned memberships and invitations                                                                                                |
| `/api/campaigns/:campaignId/character-drafts` | Legacy Campaign-scoped Character creation                              | Removed; the ambiguous identity cannot be translated safely                                          | Use `/api/me/campaign-instances/:campaignInstanceId/characters` for the authenticated Player                                                  |
| `/api/character-drafts`                       | Legacy user draft listing and edits                                    | Removed after the Instance-native Character sheet workflow shipped                                   | Do not restore; every operation requires explicit Campaign Instance ancestry                                                                  |
| `/api/model-registries`                       | GM-owned model registry and releases                                   | Legitimate top-level authored aggregate                                                              | Keep top-level; add explicit World adoption routes and stable release resources                                                               |
| `/api/domain/:resource`                       | Generic CRUD for heterogeneous legacy resources                        | Removed from HTTP; internal `DomainRecord` persistence remains for migration and snapshot assembly   | Never expose it as the extension mechanism                                                                                                    |
| `/api/ai/...`                                 | AI-assisted aggregate/content commands and generation history          | Several routes target legacy World/Location identities; generic generation can bypass owning context | Nest generation commands under canonical owners or require immutable snapshot provenance; keep `/api/ai/generations` as bounded audit history |
| `/api/media`                                  | Media asset CRUD/download                                              | Asset identity is infrastructure-level, but attachment ownership/provenance is implicit              | Keep asset reads top-level; create/attach through owning aggregate context and enforce provenance                                             |
| `/api/graph/tuples`                           | Derived graph query and direct mutation                                | Removed from HTTP; graph state is a derived internal projection                                      | Surface only safe readiness/reconciliation operations through system administration                                                           |
| `/api/auth`                                   | Bootstrap session, current user, logout                                | Correct top-level security boundary; `gm-session` has been removed                                   | Keep provider-neutral session/bootstrap flows                                                                                                 |
| `/api/health`                                 | Process health                                                         | Correct deliberate top-level exception                                                               | Keep                                                                                                                                          |

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
GET  /api/me/active-session
GET  /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId
POST /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence/join
POST /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence/heartbeat
POST /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/presence/leave
GET  /api/me/campaign-instances/:campaignInstanceId/sessions/:sessionId/events
```

The authenticated membership supplies the person/Agent relationship; Campaign Definition ancestry
is not part of the participant's task and need not be repeated.

## Campaign Instance implementation wave

The second wave introduces the stable Definition lineage as required route context for every GM
Instance mutation and owned child resource:

```text
GET  /api/campaigns/:campaignDefinitionId/instances
POST /api/campaigns/:campaignDefinitionId/instances
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/actions/validate
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/actions/change-status
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/runtime/preparation
PUT  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/runtime/preparation
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/plots
PATCH /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/plots/:plotDefinitionId
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/placements
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/placements/:realizationId/actions/:action
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/creature-embodiments
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/roster
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/memberships
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/character-imports/options
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/character-imports
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters/:characterId/review
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters/:characterId/actions/review
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/agents/available
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/agents
PATCH /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/agents/:agentParticipationId
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/invitations
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/invitations/:invitationId/actions/retry
DELETE /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/invitations/:invitationId
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/continuation
GET  /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/snapshots
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/migrations/preview
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/migrations
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/restores/preview
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/restores
```

Creation scopes the selected Campaign Definition snapshot to the Definition in the route, so a
payload cannot attach an Instance to another Definition lineage. Every existing Instance child
operation verifies Definition, Instance, and owner together before delegating to the established
domain transaction.

The application's intentionally shorter GM URLs bootstrap through read-only, identity-scoped
locator projections:

```text
GET /api/me/campaign-instances
GET /api/me/campaign-instances/:campaignInstanceId
```

Those projections expose the stable Campaign Definition lineage ID as transport context, while
continuing to use human-readable names and revisions for visible labels. Membership and Character
collection reads reflect the currently implemented roster associations. Full Character creation,
activation, retirement, and one-way import workflows remain part of the later identity and
participation wave. Instance collection reads are deterministically ordered and bounded to at most
200 records per request with `limit`, `offset`, and `total` metadata.

## Campaign and World authoring implementation wave

The third wave gives the authored aggregates the same vocabulary as the product navigation:

```text
GET|POST /api/worlds
GET      /api/worlds/:worldId
GET|POST|PUT /api/worlds/:worldId/draft
GET      /api/worlds/:worldId/draft/impact
POST     /api/worlds/:worldId/draft/validate
POST     /api/worlds/:worldId/draft/publish
GET      /api/worlds/:worldId/revisions
GET      /api/worlds/:worldId/revisions/:revisionId
GET      /api/worlds/:worldId/atlas/locations[/:locationId]
GET      /api/worlds/:worldId/bestiary/creatures[/:creatureId]
GET      /api/worlds/:worldId/item-compendium/items[/:itemId]
GET      /api/worlds/:worldId/character-model/:definitionKind[/:definitionId]

GET|POST /api/campaigns
GET      /api/campaigns/:campaignDefinitionId
GET|POST|PUT /api/campaigns/:campaignDefinitionId/draft
POST     /api/campaigns/:campaignDefinitionId/draft/reset
GET      /api/campaigns/:campaignDefinitionId/draft/impact
POST     /api/campaigns/:campaignDefinitionId/draft/validate
POST     /api/campaigns/:campaignDefinitionId/draft/publish
GET      /api/campaigns/:campaignDefinitionId/revisions[/:revisionId]
GET      /api/campaigns/:campaignDefinitionId/plots[/:plotDefinitionId]
GET      /api/campaigns/:campaignDefinitionId/placements[/:placementId]
POST     /api/campaigns/:campaignDefinitionId/world-migrations/{preview|apply}
```

Lifecycle archive/restore and explicit fork commands also moved to the canonical World and
Campaign roots. World and Campaign collections are deterministically ordered by their established
services and bounded to at most 200 returned records with `limit`, `offset`, and `total` metadata.
Revision and authored-child reads first resolve the owner-scoped parent and return a neutral miss
when a child does not belong to it.

Atlas, Bestiary, Item Compendium, Character-model, Plot, and placement endpoints are deliberately
read-only projections of the mutable aggregate draft in this wave. They make the hierarchy
explicit for navigation and contextual reads without creating false independent persistence
boundaries. Writes continue through the complete optimistic draft replacement so recursive Plot
lineage, placements, schemas, and cross-record references validate atomically. Dedicated child
commands may be added later only as transactional transformations of that same draft.

First-party web and server read-model callers use `/api/worlds` and `/api/campaigns`. This wave
initially retained the old authoring roots and destructive root-Location World operation behind
deprecation metadata; the legacy-removal wave subsequently removed them. Versioned Worlds remain
archive-first and have no canonical delete operation.

## Identity and participation implementation wave

The fourth wave establishes installation identity separately from Campaign participation and adds
the canonical Player and Instance-child lifecycle APIs:

```text
GET  /api/auth/bootstrap
POST /api/auth/bootstrap
POST /api/auth/session

GET  /api/players
GET  /api/players/:playerId
POST /api/players/:playerId/actions/change-standing

POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/memberships/:membershipId/actions/change-status
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/memberships/:membershipId/actions/select-character
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/characters/:characterId/actions/change-status
POST /api/campaigns/:campaignDefinitionId/instances/:campaignInstanceId/character-imports
```

First launch no longer invents a GM automatically. It requires the installation bootstrap
credential plus administrator name, email, and phone; creates exactly one protected
`SystemAdministrator`; and may independently grant GM authority to the same User. The bootstrap
credential authenticates the active administrator whether or not that User is also a GM. The
internal `aow:bootstrap` provider association is an adapter-neutral durable link that can coexist
with a later Auth0 association. The temporary `/api/auth/gm-session` alias introduced during this
wave was subsequently removed; `/api/auth/session` is the only bootstrap-session command.

The Auth0 adapter adds provider discovery plus explicit sign-in and linking entry points:

```text
GET /api/auth/providers
GET /api/auth/providers/me
GET /api/auth/auth0/start
GET /api/auth/auth0/link
GET /api/auth/auth0/callback
```

The deployment enables the adapter only when `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
`AUTH0_CLIENT_SECRET`, and the exact browser-visible `AUTH0_CALLBACK_URL` are all present. The
callback URL terminates at the public web `/api` proxy in the standard hosted topology.

It uses Authorization Code with S256 PKCE, state, nonce, an encrypted short-lived HTTP-only
transaction cookie, exact issuer/audience/signature validation, and local-only return paths. It
stores no Auth0 access or refresh token. Anonymous sign-in succeeds only for an exact active
provider-subject association. Linking must start and finish as the same authenticated User, refuses
subjects linked elsewhere, and never infers identity from email, phone, invitation contact,
display name, or another provider association. The local application session remains the
authorization boundary after Auth0 authentication. Its cookie is `SameSite=Lax` so it survives the
top-level provider callback; the existing trusted-origin middleware continues to reject unsafe
cross-origin cookie-authenticated requests.

Authentication-provider associations now belong to a User and only optionally link to that User's
Player profile. This permits administrators and invited Spectators to have durable authenticated
identities without becoming Players. Instance invitation acceptance no longer searches for or
claims a profile by contact similarity. An invitation is bound to an already-known User only when
the GM explicitly selects that Player profile; a matching contact otherwise produces a collision,
not an identity decision. Unbound acceptance creates a new User and internal provider association;
a Player profile is created only for a Player invitation.

The Player directory is a bounded, deterministically ordered server-wide projection. Standing is
changed with an optimistic explicit action and remains independent of membership status and Session
attendance. Its first-party screen shows human-readable contact, provider, Campaign, Instance, and
Character context without rendering internal identifiers.

Membership and Character commands scope Definition, Instance, child, and owner together. A current
Session blocks removal of one of its participating memberships. GM membership follows Instance
ownership rather than the ordinary participant status command. Character imports require a
different source Instance owned by the same GM and the same durable Player User; each import creates
a new destination identity, copies the source Character sheet into a destination-owned draft, and
records complete provenance with no synchronization or transfer-back.
Terminal `retired` and `dead` Characters cannot transition back. Activating a Character requires a
GM-approved Character draft owned by the same destination Player membership. Activation repeats
validation against the Instance's current captured World/Campaign schema and atomically materializes
a snapshot-stamped `campaign-instance-character-sheet`; selecting for play then requires an active
Character owned by the selected Player membership.

The Character ownership shell, lifecycle/provenance, resumable authoring editor, submission lock,
GM review, and activation materialization are Instance-bound. Attribute requirements come from the
immutable Model Schema releases selected by the captured World revision, including their locked
dependency releases, so a World-defined Attribute such as Likeable participates without a
hard-coded UI change. Submission and approval
validate Background, Profession, Heritage, every captured Attribute roll/assignment, and optional
starting equipment against the current captured snapshot. A later Instance migration therefore
requires stale approval to be reopened and reviewed rather than silently materializing against a
different schema. The first-party import flow lists only approved, previously activated source
sheets from another Instance owned by the same GM and belonging to the same durable Player as an
active destination membership. It identifies every choice with human-readable Player, Campaign,
Instance, and Character names while keeping command identifiers out of visible labels. The
canonical import command creates a distinct destination draft and the database constraints prevent
cross-Player, cross-owner, same-Instance, or identity-preserving transfers.

## Model, AI, media, graph, and Settings implementation wave

The fifth wave establishes an initial explicit boundary for independently authored models and
hosted-system infrastructure:

```text
GET  /api/worlds/:worldId/model-adoptions
POST /api/model-registries/:registryId/releases
GET  /api/ai/generations
POST /api/worlds/:worldId/media
GET  /api/settings/system
GET  /api/settings/system/:systemArea
PUT  /api/settings/system/:systemArea/settings/:settingKey
POST /api/settings/system/:systemArea/settings/:settingKey/secret
POST /api/settings/system/:systemArea/settings/:settingKey/actions/{revoke,reset,test}
GET  /api/settings/system/:systemArea/settings/:settingKey/history
```

Model Registry collections are bounded and deterministic. Effective Model adoption is now read
beneath its owning World rather than selected by a top-level query parameter, and publishing a
successor uses the registry's release collection. The former effective query and `/releases/extend`
command were subsequently removed.

New AI generation audit records identify the authenticated GM and carry an explicit bounded
context kind and context identity when one exists. History remains requester-scoped and exposes
only bounded previews. The immutable World-snapshot Campaign proposal remains canonical; generic
generation and legacy root-Location AI mutations were removed. Equivalent aggregate-native
World-draft transformations remain future work.

Media metadata now carries nullable creator and aggregate-scope provenance for legacy-safe
rollout. Canonical World uploads validate the World and GM together, remove an already-uploaded
object when validation fails, and persist World Definition scope. Top-level reads remain available
and creator-scoped, including nullable legacy assets; the unscoped upload is deprecated.

System Settings now presents the adopted twelve-area taxonomy and classifies every item as
application-managed, secret-backed, deployment-managed, or observed. Responses report capability
and readiness without returning saved secrets. Both the API and navigation require the active
System Administrator independently of GM authority; an administrator without GM authority can
open Settings without receiving World or Campaign access.

The writable follow-up supplies application bindings for installation name, invitation lifetime,
default AI model, and the OpenAI credential. Values resolve with explicit application,
deployment, product-default, or disabled provenance and take effect immediately in the runtime
consumers. Expected revisions reject stale commands. Secret replacement, rotation, revocation,
reset-to-deployment, and rate-limited validation never return protected material. Immutable,
value-free history records the named operator, action, reason, and configuration version. Public
network addresses, Auth0 topology, encryption roots, databases, and object storage remain
deployment-managed rather than becoming an unsafe generic key/value surface.

Direct HTTP graph creation and deletion are disabled because tuples are derived projections, not
domain authority. The legacy raw graph query is restricted to the System Administrator and marked
deprecated; safe graph counts and drift signals appear under Data & storage. All generic domain
routes are now marked deprecated, and legacy `systems` writes are frozen because hosted settings
are not game-system documents.

This vertical slice does not claim complete hosted administration. Plugin lifecycle, additional
provider configuration, infrastructure credential rotation, graph rebuild commands,
Campaign/Instance media scopes, and aggregate-native AI transformations remain fast follows.
Compatibility rows with missing creator/scope provenance remain intentionally readable and are not
rewritten by inference.

## Legacy removal implementation wave

The first removal tranche deletes compatibility surfaces whose canonical replacements are already
used by every first-party caller. Removed API routes are not redirects and do not guess ancestry:

- `/api/world-definitions`, `/api/campaign-definitions`, and `/api/campaign-instances`;
- `/api/campaign-instance-invitations` and ambiguous
  `/api/campaigns/:campaignId/invitations` operations;
- ambiguous `/api/campaigns/:campaignId/character-drafts` creation;
- `/api/domain/:resource`, `DELETE /api/worlds/:id`, and `/api/graph/tuples`;
- `/api/auth/gm-session`, `/api/model-registries/effective`, and
  `/api/model-registries/:id/releases/extend`;
- top-level media upload and unscoped/root-Location AI generation commands.

The web application no longer ships the old top-level Location, Creature, Item, System, or
ambiguous Campaign pages. It also removes the duplicate `/join/campaign` exchange and obsolete
World `creatures`/`items` placeholders. `/join` is now a neutral invitation landing page, while
Instance and Session credentials use `/join/instance` and `/join/session`.

The Character-sheet tranche removes the final live `/api/character-drafts` compatibility workflow.
Player collection, creation, option, read, and save operations now live beneath
`/api/me/campaign-instances/:campaignInstanceId/characters`. Creation allocates the Character's
Instance association and resumable draft atomically; subsequent operations authorize through the
same active Player membership and cannot rebind either parent. Options come from the World snapshot
captured by the Instance's current snapshot. Legacy Campaign-scoped draft rows are timestamped as
archived migration input and have no live controller or writer. Migration/preflight code may still
inspect those rows; that internal compatibility does not restore HTTP authority.

The completion wave adds a Player submit-for-review transition and GM review resource beneath the
same explicit Instance ancestry. Submitted and approved drafts are immutable to the Player. The GM
may approve a conformant submission or request changes; activation revalidates the approved draft
against the current Instance snapshot and materializes the internal Character resource in the same
transaction as the lifecycle transition. The materialized creation sheet is deliberately not
presented as a fabricated full `CharacterState`; runtime rule compilation remains responsible for
combining it with captured Profession, Heritage, Item, and Rule definitions.

The import-experience wave adds a bounded, destination-scoped import-options projection and a
progressively disclosed roster workflow. The GM selects a human-labeled source, may rename the
copy, sees the destination Player and source Campaign/Instance before confirming, and is taken to
the new draft's GM review after the copy. The UI explicitly describes the operation as one-way: it
does not move, link, synchronize, or preserve the source Character identity. The destination draft
must be reconciled with its own captured schema and approved before activation.

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

1. **Session hierarchy — complete:** canonical GM and `/me` routes, scoped authorization, client
   migration, compatibility headers.
2. **Campaign Instance hierarchy — complete:** creation/listing beneath Campaign Definition;
   runtime, roster, Characters, Agents, migrations, restores, and continuation.
3. **Campaign and World authoring — complete:** product vocabulary, revision resources, Plots,
   placements, and World libraries.
4. **Identity and participation — complete vertical slice:** first-admin bootstrap, user-level
   provider associations, Players, Instance memberships/invitations, Character
   ownership/lifecycle/import boundaries, Instance-native resumable Character sheets,
   captured-schema submission, GM review, activation materialization, and first-party one-way
   import selection, plus explicit Auth0 account linking and exact-subject sign-in.
5. **Model, AI, media, graph, and Settings — complete vertical slice:** explicit World model
   adoption, creator/context provenance, System Administrator readiness surfaces, derived-graph
   authority boundaries, and immediate application bindings for the first runtime settings.
   Broader hosted administration and fully contextual content operations remain fast follows.
6. **Legacy removal — Character tranche complete:** fully replaced aliases, ambiguous `campaignId`
   invitation/creation routes, singleton World operations, generic domain HTTP authority, raw graph
   HTTP access, obsolete web routes, unscoped AI commands, and the unscoped Character-draft workflow
   are removed. Legacy Character draft rows remain only as explicitly archived migration input.

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
