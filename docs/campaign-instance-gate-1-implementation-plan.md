# Campaign Instance Vertical Slice — Gate 1 Implementation Plan

Status: **Proposed for Gate 1 approval**  
Size: **Large / cross-cutting**  
Implementation authorization: **Not granted until Gate 1 is approved**

## 1. Outcome

Deliver a coherent, discrete Campaign Instance management experience that turns one explicitly
selected published Campaign Definition revision into an independently mutable played realization.
The Instance captures the exact Campaign Definition snapshot and its required World snapshot,
owns its preparation, Plot progress, runtime embodiments, placement realizations, roster, and
continuing state, and can later adopt only a compatible direct-successor Campaign revision through
an explicit all-or-nothing migration.

This slice ends at Campaign Instance management. It establishes truthful Session ownership and
Continue/Resume behavior, but it does not implement the full Session lobby or Run experience.

## 2. Authoritative decisions

The implementation must preserve these approved product decisions:

- Campaign Definition and Campaign Instance are separate identity, ownership, lifecycle, route,
  and data scopes.
- An Instance captures one immutable Campaign Definition revision and the exact World snapshot
  required by that revision. It never follows either mutable authoring head.
- Several Instances may use the same Campaign Definition, but their runtime state is independent.
- A named or unique World Creature receives an independent embodiment in every Instance. Mutable
  state is never shared between embodiments in different Instances.
- Sessions, durable membership, invitations, Characters, Agent participation, Plot progress, and
  runtime state belong to Campaign Instances, never Campaign Definitions.
- A Character is bound to exactly one Campaign Instance. A later import creates a new destination
  Character with one-way provenance; it does not create shared identity or synchronization.
- Multiple Campaign Instances may be active concurrently. Only one Session may be active across
  the hosted installation.
- Instance migration is optional, complete, direct-lineage-only, and transactional. It cannot run
  while a Session is active and it never rewrites completed Session history.
- Home and the Instance Overview expose **Continue** for active Instances. **Resume** is used for a
  paused Instance or Session. **Run** names only the later operational Session workspace.
- World Authoring, Campaign Definition Authoring, Campaign Instance Management, and Run remain
  discrete user experiences.
- GM-visible application content resolves references to human labels and never displays opaque
  internal identifiers.

## 3. Existing foundation to retain

The slice builds on existing work rather than replacing it:

- `packages/common/src/types/versioning.ts` already defines distinct Instance, Instance snapshot,
  and runtime identities.
- `packages/common/src/types/plots.ts` already defines Instance Plot-progress concepts.
- `packages/common/src/types/participation.ts` already defines membership, invitations, Agent
  participation, Session participation, Character association, and consistency validation.
- Prisma already contains Instance, snapshot, runtime, membership, invitation, Agent, Character,
  Session, and Session-participation tables with composite integrity constraints.
- PostgreSQL already enforces at most one `ACTIVE` Campaign Instance Session installation-wide.
- `POST /campaign-instances` already creates a `PREPARING` Instance, initial compatible snapshot,
  and runtime in one serializable transaction from an explicitly selected owned Campaign
  Definition snapshot. List and detail reads are owner-scoped.
- The Campaign library already distinguishes Definitions and Instances, and a read-only Instance
  overview route already exists.

These are scaffolding. They do not yet provide a complete Instance runtime contract, lifecycle,
readiness, roster administration, migration, or management workspace.

## 4. Gate 1 scope

### 4.1 Canonical Instance contracts

Add or align authoritative common contracts for:

- `CampaignInstanceRuntimeState`, with a versioned, bounded envelope for:
  - Instance-owned preparation and staging derived from Definition defaults with provenance;
  - Plot progress for every captured root Plot and subplot;
  - placement realization decisions and realization provenance;
  - independent Creature embodiments and the minimum mutable Creature state needed by this slice;
  - Instance-created runtime content references;
  - schema conformance and extension preservation.
- Instance lifecycle commands, readiness results, and human-readable validation issues.
- Instance snapshot history, migration/restore preview, reconciliation mapping, audit, and runtime
  checkpoint contracts.
- Explicit realization provenance discriminants:
  - captured World placement;
  - Campaign independent placement;
  - Campaign decoration of a captured World placement;
  - Character;
  - GM-created Instance runtime content.
- Human-safe list/detail/readiness/roster/Plot/placement/version projections.

The contract must not reuse legacy `CampaignState` or `GameState` as the new Instance aggregate.
Unsupported namespaced extensions must round-trip without silent deletion.

### 4.2 Persistence and immutable history

Create one additive migration that:

- adds explicit `ownerUserId` and optimistic `metadataRevision` semantics to Campaign Instances;
  existing `createdByUserId` remains creation audit provenance rather than implicit authority;
- adds append-only Instance migration/restore audit records;
- adds immutable runtime checkpoints sufficient to preserve the interpretation of runtime state
  before a snapshot migration or restore;
- adds any indexes or composite constraints required for owner scoping, direct snapshot lineage,
  runtime CAS, and audit lookup;
- preserves all existing participation and global active-Session constraints;
- does not destructively transform legacy Campaign, Session, Character, or runtime rows.

The authoritative mutable runtime may remain a validated aggregate document in this slice. Hot or
query-heavy runtime concepts may be relationalized later without changing the public contract.
Derived projections are not a second writable source of truth.

### 4.3 Hardened Instance creation

Extend creation into an idempotent serializable command that:

1. requires an explicit published Campaign Definition snapshot owned by the GM;
2. verifies the Campaign snapshot, required World snapshot, canonical manifests, exact compatible
   model closure, and content hashes;
3. creates the owned `PREPARING` Instance and snapshot number 1;
4. creates an explicit GM human membership for the creator in the same transaction;
5. materializes Definition preparation defaults into Instance-owned preparation with provenance;
6. creates `not-started` progress for every captured Plot, including every subplot, without copying
   the Plot hierarchy;
7. records each captured Campaign placement as an explicit planned/deferred realization decision
   rather than automatically making shared mutable content;
8. creates exactly one independent embodiment for every captured named/unique Creature source;
   repeatable Creature definitions create embodiments only when explicitly realized;
9. creates the canonical runtime and binds it to the initial snapshot;
10. advances the current-snapshot pointer only after every dependent write succeeds.

Retry uses an idempotency key and returns the original successful result rather than creating a
duplicate Instance. Failure leaves no partial Instance, membership, embodiment, progress, runtime,
or snapshot.

### 4.4 Lifecycle and readiness

Implement strict server-owned transitions:

- `preparing → active`
- `active ↔ paused`
- `active | paused → concluded`
- `concluded → archived`
- `archived → concluded` for restoration to inspectable concluded state

There is no hard delete in this slice. Lifecycle and metadata writes require the exact
`metadataRevision` and are audited.

Activation readiness verifies at minimum:

- one consistent current Instance snapshot and runtime;
- exact Campaign/World compatible pair and schema closure;
- active owner and explicit active GM membership;
- valid Instance preparation/location references;
- complete captured Plot-progress membership;
- valid placement decisions, embodiment provenance, and cross-runtime references;
- no unresolved migration or validation conflict.

Player Character readiness and Session readiness are reported as future/blocked activities but do
not prevent creation of a `PREPARING` Instance in this slice.

### 4.5 Capability-specific runtime APIs

Do not expose an arbitrary “replace runtime JSON” endpoint. Add owner-scoped capabilities with
runtime revision CAS:

- read/update Instance preparation;
- read the captured recursive Plot tree with Instance progress;
- update Plot status, Objective progress, reveals/knowledge, approved overrides, and realization
  links without changing Definition-authored Plot structure;
- list placement plans and realization state;
- explicitly realize, defer, replace, or remove a placement;
- list Instance Creature embodiments with human source provenance.

Every mutation revalidates against the current captured snapshot and effective World-plus-Campaign
schema, enforces depth/count/size limits, preserves extensions, and returns the new runtime revision
and human-readable affected labels. Cross-Instance references are rejected with neutral errors.

### 4.6 Roster and Agent administration

Expose one Instance-owned roster projection with clearly separate collections for:

- durable human memberships;
- pending/historical invitations;
- Agent participations and Observe/Act grants;
- Character associations/readiness summaries;
- Session-specific response or attendance summaries, labeled as Session data rather than
  membership state.

In this slice, implement:

- list roster and membership status;
- create, retry, and revoke Player/Spectator invitations using existing delivery infrastructure
  where configured;
- masked delivery status without returning contact values, token hashes, or credentials;
- configure an existing Agent identity, review separate namespaced Observe and Act grants, and
  authorize, pause, or revoke participation;
- read Character association and readiness summaries.

Invitation acceptance, Player-profile/Auth0 completion, Character creation, and Character import
remain in the following Player/Character slice. A GM cannot be invited through the
Player/Spectator invitation path. Agent participation never creates a User, human role, or
impersonation target.

### 4.7 Session boundary and Continue/Resume

This slice exposes Instance-owned Session read projections but does not implement the complete
Session planning/lobby/Run lifecycle.

- Sessions are listed only beneath their owning Instance and grouped as current, planned, and
  history.
- Attendance/response remains distinct from durable roster membership.
- The existing installation-wide database constraint for one `ACTIVE` Session is retained and
  covered by transactional/concurrency tests.
- A server-derived continuation result is the sole source for Home and Instance actions:
  - explicit active Session → **Continue** to its future Run route;
  - explicit paused Session → **Resume**;
  - one planned Session → open its Session record when that surface exists;
  - multiple eligible Sessions → open an Instance-scoped chooser;
  - none → explain that the next step is to plan a Session.
- Selection never uses recency and never searches across Instances for a fallback.

The canonical future Run route remains
`/campaigns/instances/:campaignInstanceId/run/:sessionId`; this slice may link to an existing valid
surface but must not add operational play controls to Instance Management.

### 4.8 Campaign Definition → Instance migration and restore

Add preview/apply workflows with these invariants:

- the migration target is an explicitly selected published direct-successor Campaign Definition
  revision in the same lineage;
- the target's required World snapshot is adopted with it; a World snapshot cannot be selected
  independently;
- preview computes the complete semantic plan independently of bounded, paged presentation;
- comparison covers Plots, Objectives, claims, Locations, World and Campaign placements,
  preparation, model releases, Characters, embodiments, realization decisions, reveal/knowledge
  state, and every runtime reference;
- correspondence uses stable identity, an approved direct-lineage replacement, or an explicit GM
  mapping—never name-only matching;
- model conformance and values are revalidated against the complete target closure;
- unresolved or incompatible references are human-labeled blocking conflicts;
- there is no change selection or cherry-picking.

Apply requires the source Instance snapshot, target Campaign snapshot, expected runtime revision,
semantic plan hash, and all required mappings. Inside one serializable transaction it locks and
rechecks the Instance, runtime, target pair, and active-Session state; recomputes the plan; creates
snapshot N+1, immutable runtime checkpoint, and audit; migrates runtime; and atomically advances the
current snapshot/runtime binding. Any stale input or single bad mapping aborts everything.

Restore performs the same process toward the direct predecessor and creates a new Instance
snapshot with reason `restore`. It never rewinds a pointer, deletes later snapshots, or changes the
historical meaning of completed Sessions/events. Migration and restore are disabled while a
Session is `ACTIVE`, including a final in-transaction race check.

### 4.9 Discrete Campaign Instance Management workspace

Implement this route hierarchy:

```text
/campaigns
└── instances
    ├── new
    └── :campaignInstanceId
        ├── overview
        ├── plots
        ├── placements
        ├── roster
        │   ├── characters/:characterId     # read/status in this slice
        │   └── agents/:agentParticipationId
        ├── sessions                        # owned read projection in this slice
        └── versions
            └── migrate
```

The persistent Instance shell provides:

- secondary navigation for Overview, Plots & staging, Placements, Roster, Sessions, and Versions &
  migrations;
- Instance name/status plus captured Campaign Definition and World names/revisions;
- migration availability and truthful Continue/Resume/next-action state;
- explicit **Open Campaign Authoring** and **Open World Authoring** exits with safe return context;
- no embedded World or Campaign Definition editors and no Run mutation controls.

Creation is available from the Instances library and a published Campaign Definition version. The
GM explicitly confirms the human-readable Campaign Definition revision, required World revision,
existing downstream Instances, Instance name, and preparation defaults. No latest revision is
silently chosen.

Overview presents authoritative readiness and next actions. Plot pages mirror the captured tree but
edit only Instance progress/staging. Placement pages visually separate source intent, Instance
realization, and current state. Roster visually separates membership, invitation, Agent, Character,
and Session-attendance concepts. Versions shows immutable snapshot history and complete migration
review.

All editable pages preserve dirty data on validation/network/CAS errors, use in-app route blocking
plus `beforeunload`, and provide reload/compare/reapply recovery for conflicts. Archived and
concluded states become read-only except for explicitly valid lifecycle or restore actions.

### 4.10 Home and Quick Start integration

- Home renders a distinct server-derived Continue card for every active Instance.
- The Instance Overview repeats its own Continue/Resume or next-step action.
- Replace the vague Quick Start “review Campaign Instance” activity with “create Campaign
  Instance.” It launches the canonical creation route with guide and return context.
- The guide sidebar persists through the creation and Instance Overview routes, explains the exact
  selected Definition/World pair, derives completion from authoritative Instance/snapshot/readiness
  state, and provides **Back to Quick Start**.
- Later `establish players` and `plan first Session` activities link to the canonical Instance Roster
  and Sessions pages without owning duplicate forms or state.

If the shared server-side Quick Start progress registry is not yet available, this slice implements
the canonical launch/return context and state predicates without inventing a second Instance-owned
checklist store.

### 4.11 Legacy quarantine

Once aggregate replacements are usable:

- reject generic writes for `games`, `sessions`, `scenes`, `encounters`, `pending-decisions`, and
  `game-events`, because they bypass Instance ownership, snapshot binding, and runtime CAS;
- quarantine the global `/sessions` route and any latest/singleton Campaign selection behind an
  explicit Instance chooser and explanation;
- do not accept a legacy `campaignId` where `campaignInstanceId` is required;
- inventory legacy invitation, membership, Character-draft, Creature, and Item runtime writes and
  block new ambiguous writes only when the corresponding Instance-owned capability in this or the
  next slice is usable;
- retain explicit read-only compatibility, identity maps, and historical exports until the later
  data-cutover plan is approved.

## 5. Public API direction

Retain:

- `GET /campaign-instances`
- `POST /campaign-instances`
- `GET /campaign-instances/:campaignInstanceId`

Add aggregate-specific routes along these lines:

- `POST /campaign-instances/:id/validate`
- `PATCH /campaign-instances/:id/lifecycle`
- `GET|PUT /campaign-instances/:id/preparation`
- `GET /campaign-instances/:id/plots`
- `PATCH /campaign-instances/:id/plots/:plotDefinitionId`
- `GET /campaign-instances/:id/placements`
- `POST /campaign-instances/:id/placements/:placementDefinitionId/{realize|defer|replace|remove}`
- `GET /campaign-instances/:id/embodiments`
- `GET /campaign-instances/:id/roster`
- bounded invitation administration beneath `/campaign-instances/:id/invitations`
- bounded Agent administration beneath `/campaign-instances/:id/agents`
- `GET /campaign-instances/:id/sessions`
- `GET /campaign-instances/:id/continuation`
- `GET /campaign-instances/:id/versions`
- `POST /campaign-instances/:id/migrations/{preview|apply}`
- `POST /campaign-instances/:id/restores/{preview|apply}`

Exact URLs may be adjusted during implementation for framework consistency, but every nested lookup
must prove Instance ownership and same-Instance membership. Mutation DTOs never accept owner,
audit, status, current-snapshot, or revision fields through mass assignment.

## 6. Security and privacy requirements

Because the slice touches authorization, database writes, invitations, protected contact data,
Agent capabilities, and runtime state, security review is mandatory.

- Use explicit Instance owner authority. GM membership records participation and does not by itself
  grant administration. Co-GM delegation is deferred.
- Creation may use only an owned published Campaign Definition snapshot in this slice.
- Return neutral not-found/conflict responses for inaccessible nested resources.
- Protect every nested query against cross-Instance ID substitution.
- Contact values remain encrypted/hash-only and are never returned after entry. Invitation tokens
  are generated securely and stored hash-only.
- Agent Observe and Act capabilities are separate, least-privilege, namespaced, reviewed, and
  audited. Agents cannot receive human credentials or impersonation authority.
- GM-only Plot cues, unrevealed claims, runtime state, snapshot manifests, schema internals, and
  protected participant data never enter Player/Spectator-safe projections.
- Bound payload bytes, nesting, collection sizes, mapping counts, and paged response sizes.
- Audit creation, lifecycle, preparation/progress changes, realization decisions, invitation and
  capability changes, migration, and restore with human-resolvable subjects.

## 7. Accessibility and recovery acceptance

- Use native semantic controls, persistent labels, and text in addition to color for every status.
- Meet WCAG 2.2 AA contrast and visible focus requirements.
- Interactive targets are at least 24×24 CSS pixels; existing 44-pixel controls are preferred.
- Secondary navigation disclosure exposes `aria-expanded`, `aria-controls`, and `aria-current`.
- At 400% zoom and narrow widths, the same hierarchy moves to an accessible drawer without hiding
  primary actions or the Quick Start guide.
- Dialogs contain focus, close with Escape and an explicit control, and restore focus to the
  trigger.
- Error summaries receive focus and link to invalid fields; asynchronous save, invitation,
  readiness, and migration results use restrained polite live regions.
- Drag, map, or reorder interactions have equivalent button/menu actions.
- Network, stale-revision, and authorization failures preserve safe local work and never suggest
  retrying a mutation that may already have succeeded without first resolving its idempotency key.

## 8. TDD implementation task list

After Gate 1 approval, execute these tasks in order. Each task starts by adding or changing tests
that express the approved behavior.

1. **Characterize the existing spine**
   - Lock current create/list/detail, schema constraints, and global active-Session behavior with
     regression tests.
   - Add failing contract tests for the missing owner, GM membership, canonical runtime, and
     independent embodiment invariants.

2. **Define canonical common contracts**
   - Add runtime, readiness, realization, migration/restore, checkpoint, and projection types.
   - Add pure validation tests, including cross-Instance rejection and recursive subplot coverage.
   - Synchronize `apps/api/src/ai/prompts/domain-model.md` in the same change.

3. **Add persistence support**
   - Add owner/CAS, runtime checkpoint, migration/restore audit, constraints, and indexes.
   - Verify the entire migration chain on fresh disposable PostgreSQL.
   - Prove the migration is additive and existing snapshots/participation rows remain unchanged.

4. **Harden atomic Instance creation**
   - Add idempotency, explicit owner and GM membership, preparation materialization, Plot progress,
     placement decisions, and named/unique Creature embodiments.
   - Test two Instances from one source Creature have different runtime identities and state.
   - Test every transaction failure point leaves zero partial rows.

5. **Implement lifecycle, readiness, and runtime CAS capabilities**
   - Add validation, strict lifecycle transitions, preparation, Plot progress, placement realization,
     and embodiment reads.
   - Test schema/reference validation, extension preservation, stale revisions, lifecycle read-only
     states, and cross-Instance substitution.

6. **Implement bounded roster and Agent administration**
   - Add human-safe roster projections, invitation create/retry/revoke, and Agent grant lifecycle.
   - Test owner scoping, protected-data omission, hash-only tokens, role restrictions, capability
     escalation rejection, and audit.

7. **Add Session ownership projection and continuation resolver**
   - Add nested Session reads and deterministic continuation responses.
   - Test zero/one/many eligible Sessions, active/paused precedence, no recency inference, and the
     installation-wide active-Session race.

8. **Implement Instance migration and restore**
   - Add complete semantic preview, bounded paging, mappings, plan hash, active-Session gate,
     serializable apply, checkpoint/audit, and direct-predecessor restore-as-new-snapshot.
   - Test stale plans, incompatible schemas, removed Plots/claims/placements, runtime references,
     large pages, rollback at each write, and preserved completed Session meaning.

9. **Build the discrete Instance Management workspace**
   - Add creation, shell, overview/readiness, Plot progress, placements, roster, Session projection,
     versions/migration, and reciprocal authoring exits.
   - Add dirty-state, conflict recovery, human-label, responsive, keyboard, focus, and screen-reader
     tests.

10. **Connect Home and Quick Start**
    - Use the server continuation resolver for every active Instance card and Overview action.
    - Add canonical Quick Start launch/sidebar/return context and authoritative completion
      predicates for Instance creation.

11. **Quarantine ambiguous legacy paths**
    - Reject covered generic runtime writes and replace global/latest Session navigation with an
      explicit Instance chooser.
    - Add compatibility tests proving reads remain available where required and new writes cannot
      bypass Instance ownership.

12. **Review and verification**
    - Run independent architecture, domain, UX/accessibility, database, and security reviews.
    - Resolve every Critical and High finding before Gate 2.
    - Run full tests, typecheck, lint, API build, web production build/prerender, UI-boundary checks,
      Prisma validate/generate, migration-chain and rollback tests, and `git diff --check`.

## 9. Required scenario tests

- Two Instances created from the same Campaign Definition and named Creature source have distinct
  embodiments; changing one cannot affect the other.
- Creation retry cannot duplicate an Instance or GM membership.
- Every captured root Plot and subplot has progress, while parentage remains Definition-owned.
- Campaign and World content remain byte-identical after every Instance mutation.
- A placement can remain deferred, be realized, be replaced, or be removed without rewriting its
  source plan.
- Membership, invitation, Character association, Session participation, and attendance remain
  distinct and same-Instance constrained.
- A Character, embodiment, placement realization, Plot progress record, or Session from another
  Instance is rejected.
- Agent Observe/Act grants cannot exceed the explicitly submitted reviewed capability set or create
  human impersonation.
- Continue/Resume resolves the same explicit Instance/Session on Home and Instance Overview and
  never chooses by recency.
- A race to activate Sessions in two Instances permits exactly one and reports the blocking Session
  and Instance by human name.
- A migration with one unresolved reference writes nothing.
- A Session becoming active between preview and apply causes the migration transaction to abort.
- Successful migration creates snapshot N+1 and preserves the previous snapshot, runtime
  checkpoint, completed Sessions, logs, and summaries.
- Restore creates a new snapshot and does not rewind or delete history.
- No GM-facing view or error-free empty state displays an opaque identifier.

## 10. Explicit deferrals

- Auth0 integration and complete Player-profile/authentication-provider onboarding.
- Invitation acceptance and recipient portal flows.
- Full Character creation, review, activation, death/replacement, and one-way import UI.
- Session planning mutations, invitations/responses, lobby presence, start/pause/resume/conclude,
  attendance editing, summary approval, and backup trigger.
- Run/game-time event processing, Player/Spectator live projections, audio/video, chat, Scenes,
  canvas, fog, travel, downtime, encounters, combat, and Rules execution.
- Schema authoring from an Instance; Instances conform to captured schemas but define none.
- Co-GM ownership delegation or transfer.
- Cross-lineage/branch migration, partial migration, cherry-picking, and name-based automatic
  matching.
- Distributed Agent execution and narrative/event-stream Agents beyond participation and grants.
- Full legacy data cutover, deletion, and archive retirement.
- Server-audited Quick Start review acknowledgment beyond the canonical launch context and
  authoritative completion predicates needed here.

## 11. Gate 1 approval boundary

Approval authorizes implementation of Sections 4–9 using the TDD order in Section 8. It does not
authorize any deferred Player/Character, Session lobby, Run, Rules, combat, Auth0, plugin, or full
legacy-cutover work.

Implementation will stop again at **Gate 2** with:

- the complete uncommitted diff;
- verification and disposable-database evidence;
- resolved review findings and remaining limitations;
- a proposed conventional commit split.

