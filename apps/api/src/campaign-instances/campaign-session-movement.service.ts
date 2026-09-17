import { randomInt, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type CampaignSessionMovementProposal } from "@prisma/client";
import {
  executeWorldRules,
  isTerrainActorPosition,
  type RecordedRuleRoll,
  type SessionMovementContext,
  type SessionMovementRequest,
  type SessionMovementProposal,
  type WorldRuleExecution,
  type WorldRuleEvent,
} from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import { canonicalJsonHash } from "../domain/snapshot-manifest";
import { validateRuntimeForCapturedPair } from "./campaign-instance-management.service";
import {
  applyMovementState,
  array,
  capturedTerrain,
  json,
  movementGeometry,
  movementStateView,
  object,
  records,
} from "./session-movement-state";

type Scope = {
  definitionId: string;
  instanceId: string;
  sessionId: string;
  userId: string;
};
const asJson = (value: unknown) => json(value) as Prisma.InputJsonValue;
const sessionSelection = {
  campaignInstance: {
    include: {
      owner: { select: { displayName: true } },
      runtime: true,
      currentSnapshot: {
        include: {
          worldDefinitionSnapshot: true,
          campaignDefinitionSnapshot: true,
        },
      },
    },
  },
} satisfies Prisma.CampaignInstanceSessionInclude;
type Session = Prisma.CampaignInstanceSessionGetPayload<{
  include: typeof sessionSelection;
}>;

@Injectable()
export class CampaignSessionMovementService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async scope(tx: Prisma.TransactionClient, scope: Scope) {
    const session = await tx.campaignInstanceSession.findFirst({
      where: {
        id: scope.sessionId,
        campaignInstanceId: scope.instanceId,
        campaignInstance: {
          campaignDefinitionId: scope.definitionId,
          ownerUserId: scope.userId,
        },
      },
      include: sessionSelection,
    });
    if (!session)
      throw new NotFoundException("The selected Session was not found.");
    if (
      !session.campaignInstance.runtime ||
      !session.campaignInstance.currentSnapshot
    )
      throw new ConflictException(
        "The Session runtime or captured content is unavailable.",
      );
    return session;
  }
  private active(session: Session) {
    if (session.status !== "ACTIVE")
      throw new ConflictException(
        "Resume this Session before submitting or deciding movement.",
      );
  }
  private projection(
    row: CampaignSessionMovementProposal,
    session: Session,
  ): SessionMovementProposal {
    const projection = row.projection as unknown as SessionMovementProposal;
    const savedActor = array(object(row.nextState).creatureEmbodiments).find(
      (entry) => entry.runtimeCreatureId === projection.actorId,
    );
    const savedLocationId = object(savedActor?.creature).currentLocationId;
    const locationId =
      typeof projection.locationId === "string" && projection.locationId
        ? projection.locationId
        : typeof savedLocationId === "string" && savedLocationId
          ? savedLocationId
          : undefined;
    const valid =
      session.status === "ACTIVE" &&
      session.campaignInstance.currentSnapshotId === row.snapshotId &&
      session.campaignInstance.runtime?.revision === row.runtimeRevision;
    return {
      ...projection,
      locationId,
      status: row.status as SessionMovementProposal["status"],
      canApprove: row.status === "pending" && valid,
      decidedAt: row.decidedAt?.toISOString(),
    };
  }

  async context(scope: Scope): Promise<SessionMovementContext> {
    return this.prisma.$transaction(
      async (tx) => {
        const session = await this.scope(tx, scope);
        if (session.status !== "ACTIVE" && session.status !== "PAUSED")
          throw new ConflictException(
            "Movement history is available during active or paused play.",
          );
        const instance = session.campaignInstance;
        const world = records(
          instance.currentSnapshot!.worldDefinitionSnapshot.manifest,
        );
        const locations = new Map(
          world
            .filter((r) => r.resourceType === "locations")
            .map((r) => [r.sourceId, object(r.payload)]),
        );
        const actors: SessionMovementContext["actors"][number][] = [];
        for (const entry of array(
          object(instance.runtime!.state).creatureEmbodiments,
        )) {
          const creature = object(entry.creature);
          const locationId =
            typeof creature.currentLocationId === "string"
              ? creature.currentLocationId
              : "";
          const location = locations.get(locationId);
          if (
            location &&
            object(location.map).kind === "isometric" &&
            isTerrainActorPosition(creature.terrainPosition)
          )
            actors.push({
              id: String(entry.runtimeCreatureId),
              name:
                typeof creature.name === "string"
                  ? creature.name
                  : "Unnamed actor",
              locationId,
              locationName:
                typeof location.name === "string"
                  ? location.name
                  : "Unnamed Location",
              position: creature.terrainPosition,
              ...movementResources(creature),
            });
        }
        const proposals = await tx.campaignSessionMovementProposal.findMany({
          where: { sessionId: scope.sessionId },
          orderBy: { createdAt: "desc" },
          take: 30,
        });
        return {
          status: session.status === "ACTIVE" ? "active" : "paused",
          runtimeRevision: instance.runtime!.revision,
          snapshotNumber: instance.currentSnapshot!.snapshotNumber,
          actors,
          capturedRules: world
            .filter((r) => r.resourceType === "world-rules")
            .map((r) => ({
              name:
                typeof object(r.payload).name === "string"
                  ? (object(r.payload).name as string)
                  : "Unnamed rule",
              revision: Number(object(r.payload).revision) || 1,
            })),
          proposals: proposals.map((p) => this.projection(p, session)),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async preview(
    scope: Scope,
    request: SessionMovementRequest,
  ): Promise<SessionMovementProposal> {
    validateRequest(request);
    const requestHash = canonicalJsonHash({
      actorId: request.actorId,
      destination: request.destination,
      expectedRuntimeRevision: request.expectedRuntimeRevision,
    });
    return this.prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
          );
          const session = await this.scope(tx, scope);
          const existing = await tx.campaignSessionMovementProposal.findUnique({
            where: {
              sessionId_requestKey: {
                sessionId: scope.sessionId,
                requestKey: request.idempotencyKey,
              },
            },
          });
          if (existing) {
            if (existing.requestHash !== requestHash)
              throw new ConflictException(
                "This submission key was already used for a different movement. Build a new preview.",
              );
            return this.projection(existing, session);
          }
          this.active(session);
          const instance = session.campaignInstance;
          const runtime = instance.runtime!;
          if (runtime.revision !== request.expectedRuntimeRevision)
            throw new ConflictException(
              "The runtime changed. Refresh and build a new movement preview.",
            );
          const state = object(runtime.state);
          if (
            validateRuntimeForCapturedPair(
              state as Record<string, Prisma.JsonValue>,
              instance,
            ).length
          )
            throw new ConflictException(
              "The runtime does not satisfy its captured structural contract.",
            );
          const embodiment = array(state.creatureEmbodiments).find(
            (r) => r.runtimeCreatureId === request.actorId,
          );
          const creature = object(embodiment?.creature);
          if (
            !embodiment ||
            !isTerrainActorPosition(creature.terrainPosition) ||
            typeof creature.currentLocationId !== "string"
          )
            throw new BadRequestException(
              "Choose an actor placed on a captured isometric map.",
            );
          const worldManifest =
            instance.currentSnapshot!.worldDefinitionSnapshot.manifest;
          const campaignManifest =
            instance.currentSnapshot!.campaignDefinitionSnapshot.manifest;
          const volume = capturedTerrain(
            worldManifest,
            creature.currentLocationId,
          );
          const facts = movementGeometry(
            volume,
            creature.terrainPosition,
            request.destination,
          );
          const world = records(worldManifest);
          const rules = world
            .filter((r) => r.resourceType === "world-rules")
            .map((r) => r.payload);
          const view = movementStateView(
            state,
            worldManifest,
            campaignManifest,
          );
          const id = randomUUID();
          const event: WorldRuleEvent = {
            formatVersion: 1,
            id,
            rootEventId: id,
            idempotencyKey: request.idempotencyKey,
            type: "aow:movement-declared",
            version: 1,
            source: "gm",
            context: {
              actorId: request.actorId,
              destination: { ...request.destination },
              ...facts,
            },
          };
          const entropy: RecordedRuleRoll[] = [];
          let result = executeWorldRules({
            rules,
            event,
            state: view,
            entropy,
          });
          for (
            let round = 0;
            result.status === "needs-entropy" && round < 32;
            round++
          ) {
            for (const roll of result.requests) {
              if (entropy.some((r) => r.requestId === roll.requestId)) continue;
              if (
                roll.count < 1 ||
                roll.count > 100 ||
                roll.sides < 2 ||
                roll.sides > 1_000_000 ||
                entropy.reduce((n, r) => n + r.count, 0) + roll.count > 1000
              )
                throw new BadRequestException(
                  "The rule chain exceeds the recorded dice budget.",
                );
              entropy.push({
                ...roll,
                values: Array.from({ length: roll.count }, () =>
                  randomInt(1, roll.sides + 1),
                ),
              });
            }
            result = executeWorldRules({ rules, event, state: view, entropy });
          }
          let nextState = state;
          if (result.status === "applied") {
            try {
              nextState = applyMovementState(state, view, result.state);
              const issues = validateRuntimeForCapturedPair(
                nextState as Record<string, Prisma.JsonValue>,
                instance,
              );
              if (issues.length)
                throw new Error(
                  "The resulting runtime does not satisfy its captured structural contract.",
                );
            } catch {
              result = {
                ...result,
                status: "failed",
                state: view,
                writes: [],
                diagnostics: [
                  "The rule chain produced invalid runtime state; no effects were applied.",
                ],
              };
              nextState = state;
            }
          }
          if (result.status === "needs-entropy")
            result = {
              ...result,
              status: "failed",
              state: view,
              writes: [],
              diagnostics: [
                "The rule chain exceeded the dice continuation budget.",
              ],
            };
          const status =
            result.status === "applied"
              ? "pending"
              : result.status === "no-op"
                ? "no-op"
                : "failed";
          const actorName =
            typeof creature.name === "string" ? creature.name : "Unnamed actor";
          const location = world.find(
            (r) =>
              r.resourceType === "locations" &&
              r.sourceId === creature.currentLocationId,
          );
          const locationName =
            typeof object(location?.payload).name === "string"
              ? (object(location?.payload).name as string)
              : "Unnamed Location";
          const projection: SessionMovementProposal = {
            id,
            actorId: request.actorId,
            status,
            actorName,
            locationId: creature.currentLocationId,
            locationName,
            origin: creature.terrainPosition,
            destination: request.destination,
            expectedRuntimeRevision: runtime.revision,
            canApprove: status === "pending",
            explanation:
              status === "pending"
                ? result.writes.some(
                    (write) =>
                      write.field === "position" &&
                      write.entityId === request.actorId,
                  )
                  ? "Captured rules produced a position change. Approval applies this chain once."
                  : "Captured rules produced other effects; the declaring actor stays in place. Approval applies only the listed effects."
                : status === "no-op"
                  ? "No applicable captured rule produced an effect. The actor remains in place."
                  : "The rule chain failed safely. No gameplay changes were applied.",
            effects: result.writes.map(
              (w) =>
                `${w.ruleName} — ${actorLabel(view.runtime[w.entityId]?.fields.name)}: ${w.field === "position" ? "change actor position" : w.field === "aow:movementRemaining" ? "update remaining movement" : w.field === "aow:moves" ? "update recorded moves" : "update runtime state"}${["position", "aow:movementRemaining", "aow:moves"].includes(w.field) ? ` (${JSON.stringify(w.before)} → ${JSON.stringify(w.after)})` : ""}`,
            ),
            trace: result.trace.map((t) =>
              t.ruleName ? `${t.ruleName}: ${t.detail}` : t.detail,
            ),
            createdAt: new Date().toISOString(),
          };
          const row = await tx.campaignSessionMovementProposal.create({
            data: {
              id,
              campaignInstanceId: scope.instanceId,
              sessionId: scope.sessionId,
              snapshotId: instance.currentSnapshotId!,
              runtimeRevision: runtime.revision,
              requestKey: request.idempotencyKey,
              requestHash,
              request: asJson(request),
              result: asJson({ ...result, rolls: entropy }),
              nextState: asJson(nextState),
              projection: asJson(projection),
              status,
            },
          });
          return this.projection(row, session);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      )
      .catch(rethrowMovementConflict);
  }

  async decide(
    scope: Scope,
    proposalId: string,
    decision: "approved" | "rejected",
    key: string,
  ): Promise<SessionMovementProposal> {
    validateKey(key);
    return this.prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
          );
          const session = await this.scope(tx, scope);
          const proposal = await tx.campaignSessionMovementProposal.findFirst({
            where: {
              id: proposalId,
              sessionId: scope.sessionId,
              campaignInstanceId: scope.instanceId,
            },
          });
          if (!proposal)
            throw new NotFoundException("The movement proposal was not found.");
          if (proposal.status !== "pending") {
            if (proposal.status === decision && proposal.decisionKey === key)
              return this.projection(proposal, session);
            throw new ConflictException(
              "This movement proposal has already been resolved.",
            );
          }
          this.active(session);
          const instance = session.campaignInstance;
          const before = instance.runtime!.revision;
          if (
            decision === "approved" &&
            (before !== proposal.runtimeRevision ||
              instance.currentSnapshotId !== proposal.snapshotId)
          )
            throw new ConflictException(
              "The runtime or captured rules changed. Build a new movement preview.",
            );
          const result = proposal.result as unknown as WorldRuleExecution;
          if (decision === "approved") {
            const issues = validateRuntimeForCapturedPair(
              object(proposal.nextState) as Record<string, Prisma.JsonValue>,
              instance,
            );
            if (result.status !== "applied" || issues.length)
              throw new ConflictException(
                "The saved rule chain is not valid for this runtime. Build a new preview.",
              );
            const updated = await tx.campaignInstanceRuntime.updateMany({
              where: {
                campaignInstanceId: scope.instanceId,
                campaignInstanceSnapshotId: proposal.snapshotId,
                revision: before,
              },
              data: {
                state: asJson(proposal.nextState),
                revision: { increment: 1 },
              },
            });
            if (updated.count !== 1)
              throw new ConflictException(
                "The runtime changed. Build a new movement preview.",
              );
          }
          const after = before + (decision === "approved" ? 1 : 0);
          await this.journal(
            tx,
            session,
            scope,
            proposal,
            decision,
            result,
            before,
            after,
          );
          const row = await tx.campaignSessionMovementProposal.update({
            where: { id: proposal.id },
            data: { status: decision, decisionKey: key, decidedAt: new Date() },
          });
          return this.projection(row, session);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      )
      .catch(rethrowMovementConflict);
  }

  private async journal(
    tx: Prisma.TransactionClient,
    session: Session,
    scope: Scope,
    proposal: CampaignSessionMovementProposal,
    decision: string,
    result: WorldRuleExecution,
    before: number,
    after: number,
  ) {
    let sequence = session.lastEventSequence ?? 0;
    let previous = sequence
      ? await tx.campaignSessionEvent.findUnique({
          where: {
            sessionId_sequence: { sessionId: scope.sessionId, sequence },
          },
          select: { contentHash: true },
        })
      : null;
    const start = sequence + 1;
    const projection =
      proposal.projection as unknown as SessionMovementProposal;
    const entries = decision === "approved" ? result.events : [];
    const sequenceByEvent = new Map<string, number>();
    for (const event of [undefined, ...entries]) {
      sequence++;
      const summary = event
        ? `Captured rules processed a causal event for ${projection.actorName}.`
        : `${projection.actorName}'s declared action chain was ${decision}.`;
      const payload = event
        ? { proposalId: proposal.id, event }
        : {
            proposalId: proposal.id,
            decision,
            writes: decision === "approved" ? result.writes : [],
          };
      const contentHash = canonicalJsonHash({
        hashVersion: 1,
        campaignInstanceId: scope.instanceId,
        sessionId: scope.sessionId,
        sequence,
        type: event ? "rules.causal-event" : `rules.movement.${decision}`,
        summary,
        payload,
        actorName: session.campaignInstance.owner?.displayName ?? "GM",
        actorUserId: scope.userId,
        visibility: "GM",
        runtimeRevisionBefore: before,
        runtimeRevisionAfter: after,
        causedBySequence: event
          ? event.parentEventId
            ? (sequenceByEvent.get(event.parentEventId) ?? null)
            : start
          : null,
        previousHash: previous?.contentHash ?? null,
      });
      await tx.campaignSessionEvent.create({
        data: {
          campaignInstanceId: scope.instanceId,
          sessionId: scope.sessionId,
          sequence,
          type: event ? "rules.causal-event" : `rules.movement.${decision}`,
          summary,
          actorName: session.campaignInstance.owner?.displayName ?? "GM",
          actorUserId: scope.userId,
          visibility: "GM",
          runtimeRevisionBefore: before,
          runtimeRevisionAfter: after,
          causedBySequence: event
            ? event.parentEventId
              ? sequenceByEvent.get(event.parentEventId)
              : start
            : undefined,
          payload: asJson(payload),
          previousHash: previous?.contentHash,
          contentHash,
        },
      });
      if (event) sequenceByEvent.set(event.id, sequence);
      previous = { contentHash };
    }
    await tx.campaignInstanceSession.update({
      where: { id: scope.sessionId },
      data: {
        firstEventSequence: session.firstEventSequence ?? start,
        lastEventSequence: sequence,
        lastRuntimeRevision: after,
      },
    });
  }
}

function validateKey(key: unknown) {
  if (typeof key !== "string" || key.length < 8 || key.length > 200)
    throw new BadRequestException("Provide a valid operation key.");
}
function validateRequest(request: SessionMovementRequest) {
  if (
    !request ||
    typeof request.actorId !== "string" ||
    !request.actorId ||
    request.actorId.length > 200 ||
    !isTerrainActorPosition(request.destination) ||
    !Number.isSafeInteger(request.expectedRuntimeRevision) ||
    request.expectedRuntimeRevision < 1
  )
    throw new BadRequestException(
      "Choose an actor, valid destination, and current runtime revision.",
    );
  validateKey(request.idempotencyKey);
}

function actorLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "Actor";
}

/** SERIALIZABLE conflicts are normal concurrent edits, never an internal-error page. */
function rethrowMovementConflict(caught: unknown): never {
  if (
    caught instanceof Prisma.PrismaClientKnownRequestError &&
    caught.code === "P2034"
  ) {
    throw new ConflictException(
      "The runtime changed during this operation. Refresh and build a new movement preview.",
    );
  }
  throw caught;
}

/** Project only named numeric gameplay resources, never arbitrary extensions or internal IDs. */
export function movementResources(creature: Record<string, unknown>): {
  movementRemaining?: number;
  recordedMoves?: number;
} {
  const resources = object(object(creature.extensions)["aow:rules"]);
  const remaining = resources["aow:movementRemaining"];
  const moves = resources["aow:moves"];
  return {
    ...(typeof remaining === "number" && Number.isFinite(remaining)
      ? { movementRemaining: remaining }
      : {}),
    ...(typeof moves === "number" && Number.isFinite(moves)
      ? { recordedMoves: moves }
      : {}),
  };
}
