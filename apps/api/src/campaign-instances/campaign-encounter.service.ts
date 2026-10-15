import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  CampaignInstance,
  Encounter,
  createEncounterState,
  decodeEncounterState,
  projectEncounter,
  combatCompatibilityIssues,
} from "@aow/domain";
import type {
  CombatProfile,
  CombatantState,
  EncounterCommand,
  EncounterState,
} from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import { runtimeCaptureContext } from "./campaign-instance-management.service";
import { array, object, records } from "./session-movement-state";
import {
  bindCombatProfile,
  encounterSources,
} from "./campaign-encounter-sources";
import { capturedActorPositionIssue } from "./actor-position";
export interface EncounterScope {
  instanceId: string;
  sessionId: string;
  userId: string;
  definitionId?: string;
  player?: boolean;
}
export interface EncounterRequest {
  expectedRuntimeRevision: number;
  idempotencyKey: string;
  setup?: {
    name: string;
    combatants: readonly {
      entityId: string;
      hp: number;
      maxHp: number;
      profile: CombatProfile;
      controllerIds?: readonly string[];
      visibleToPlayers?: boolean;
      removed?: boolean;
      incapacitation?: "unconscious" | "dead" | null;
    }[];
  };
  command?: EncounterCommand;
}
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, value]) => value !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, canonical(value)]),
        )
      : v;
const hash = (v: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
const metadata = (e: EncounterState) =>
  object(object(e.extensions)["aow:combatCapture"]) as Record<
    string,
    import("@aow/common").JsonValue
  >;
/** A single Instance JSON aggregate owns every durable combat transition. */
@Injectable()
export class CampaignEncounterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private async load(tx: Prisma.TransactionClient, scope: EncounterScope) {
    const session = await tx.campaignInstanceSession.findFirst({
      where: {
        id: scope.sessionId,
        campaignInstanceId: scope.instanceId,
        ...(!scope.player
          ? {
              campaignInstance: {
                ownerUserId: scope.userId,
                campaignDefinitionId: scope.definitionId,
              },
            }
          : {}),
      },
      include: {
        campaignInstance: {
          include: {
            runtime: true,
            currentSnapshot: {
              include: {
                worldDefinitionSnapshot: true,
                campaignDefinitionSnapshot: true,
              },
            },
          },
        },
      },
    });
    if (
      !session ||
      !session.campaignInstance.runtime ||
      !session.campaignInstance.currentSnapshot
    )
      throw new NotFoundException("The Session runtime is unavailable.");
    const memberships = await tx.campaignInstanceHumanMembership.findMany({
      where: {
        campaignInstanceId: scope.instanceId,
        status: "ACTIVE",
        role: "PLAYER",
        user: { playerProfile: { standing: "ACTIVE" } },
        sessionParticipations: {
          some: {
            sessionId: scope.sessionId,
            selected: true,
            response: "ACCEPTED",
          },
        },
      },
      include: { activeCharacter: true },
    });
    if (scope.player && !memberships.some((m) => m.userId === scope.userId))
      throw new NotFoundException(
        "You are not an active player in this Session.",
      );
    return { session, instance: session.campaignInstance, memberships };
  }
  private setupActors(
    loaded: Awaited<ReturnType<CampaignEncounterService["load"]>>,
  ) {
    const state = object(loaded.instance.runtime!.state),
      manifest =
        loaded.instance.currentSnapshot!.worldDefinitionSnapshot.manifest;
    return array(state.creatureEmbodiments).map((entry) => {
      const actor = object(entry.creature),
        health = object(actor.combat);
      const captured = object(
        records(manifest).find((r) => r.sourceId === actor.definitionId)
          ?.payload,
      );
      const authored = object(object(captured.components).health);
      const characterId = object(entry.source).characterId;
      const controllerIds = loaded.memberships
        .filter(
          (m) =>
            m.activeCharacter?.status === "ACTIVE" &&
            m.activeCharacter.characterId === characterId,
        )
        .map((m) => m.userId);
      return {
        entityId: String(entry.runtimeEntityId),
        name: typeof actor.name === "string" ? actor.name : "Actor",
        hp: health.hp ?? authored.current,
        maxHp: health.maxHp ?? authored.maximum,
        controllerIds,
        sources: encounterSources(entry, state, manifest),
        ...(actor.terrainPosition
          ? {
              position: {
                sceneId: actor.currentLocationId,
                point: {
                  x: Number(object(actor.terrainPosition).x) / 5,
                  y: Number(object(actor.terrainPosition).y) / 5,
                  z: Number(object(actor.terrainPosition).z ?? 0) / 5,
                },
              },
            }
          : {}),
      };
    });
  }
  private projection(
    loaded: Awaited<ReturnType<CampaignEncounterService["load"]>>,
    scope: EncounterScope,
    state: Record<string, unknown>,
    revision: number,
  ) {
    let encounter = state.encounter
      ? decodeEncounterState(state.encounter)
      : undefined;
    if (encounter && scope.player) {
      const entries = array(state.creatureEmbodiments);
      const permitted = (actor: CombatantState) => {
        const characterId = object(
          entries.find((e) => e.runtimeEntityId === actor.entityId)?.source,
        ).characterId;
        return {
          ...actor,
          controllerIds: actor.controllerIds.filter((id) =>
            loaded.memberships.some(
              (m) =>
                m.userId === id &&
                (!characterId ||
                  (m.activeCharacter?.status === "ACTIVE" &&
                    m.activeCharacter.characterId === characterId)),
            ),
          ),
        };
      };
      encounter = {
        ...encounter,
        combatants: encounter.combatants.map(permitted),
        simulated: encounter.simulated.map(permitted),
      };
    }
    return {
      runtimeRevision: revision,
      encounter: encounter
        ? projectEncounter(encounter, {
            userId: scope.userId,
            isGm: !scope.player,
          })
        : null,
      ...(!scope.player
        ? {
            setupActors: this.setupActors(loaded),
            controllers: loaded.memberships.map((m) => ({
              id: m.userId,
              name: m.displayName,
            })),
          }
        : {}),
    };
  }
  async read(scope: EncounterScope) {
    return this.prisma.$transaction(
      async (tx) => {
        const loaded = await this.load(tx, scope);
        return this.projection(
          loaded,
          scope,
          object(loaded.instance.runtime!.state),
          loaded.instance.runtime!.revision,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async execute(scope: EncounterScope, input: EncounterRequest) {
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRuntimeRevision) ||
      input.expectedRuntimeRevision < 1 ||
      typeof input.idempotencyKey !== "string" ||
      !input.idempotencyKey.trim() ||
      input.idempotencyKey.length > 150 ||
      Boolean(input.setup) === Boolean(input.command)
    )
      throw new BadRequestException(
        "Provide one encounter operation and its current revision.",
      );
    if (
      scope.player &&
      (input.setup ||
        !["edit-plan", "submit-plan"].includes(input.command!.kind))
    )
      throw new ForbiddenException(
        "Players may edit and submit their own plans.",
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'LOCK TABLE "CampaignInstanceSession" IN SHARE ROW EXCLUSIVE MODE',
          );
          const loaded = await this.load(tx, scope),
            { instance, session } = loaded,
            runtime = instance.runtime!,
            state = object(runtime.state);
          if (!["ACTIVE", "PAUSED"].includes(session.status))
            throw new ConflictException(
              "Combat requires an active or paused Session.",
            );
          if (
            session.status === "PAUSED" &&
            (scope.player ||
              !["pause", "resume"].includes(input.command?.kind ?? ""))
          )
            throw new ConflictException(
              "Resume the Session before continuing combat.",
            );
          let encounter = state.encounter
            ? decodeEncounterState(state.encounter)
            : undefined;
          const requestHash = hash({
            setup: input.setup,
            command: input.command,
            userId: scope.userId,
          });
          let saved: Record<string, import("@aow/common").JsonValue> = encounter
            ? metadata(encounter)
            : {};
          let receipts = object(saved.receipts) as Record<string, string>;
          if (receipts[input.idempotencyKey] !== undefined) {
            if (receipts[input.idempotencyKey] !== requestHash)
              throw new ConflictException(
                "This operation key was already used for another request.",
              );
            return this.projection(loaded, scope, state, runtime.revision);
          }
          if (runtime.revision !== input.expectedRuntimeRevision)
            throw new ConflictException(
              "The Instance changed. Refresh before continuing.",
            );
          const actors = this.setupActors(loaded),
            entries = array(state.creatureEmbodiments);
          if (input.setup) {
            if (encounter && encounter.phase !== "completed")
              throw new ConflictException(
                "Complete the existing encounter first.",
              );
            if (
              !input.setup.name?.trim() ||
              !Array.isArray(input.setup.combatants) ||
              !input.setup.combatants.length ||
              input.setup.combatants.length > 100
            )
              throw new BadRequestException(
                "Name the encounter and select its combatants.",
              );
            saved = { seed: randomBytes(32).toString("hex") };
            receipts = {};
            const combatants = input.setup.combatants.map(
              (
                request: NonNullable<
                  EncounterRequest["setup"]
                >["combatants"][number],
              ) => {
                const actor = actors.find(
                    (a) => a.entityId === request.entityId,
                  ),
                  entry = entries.find(
                    (e) => e.runtimeEntityId === request.entityId,
                  );
                if (!actor || !entry)
                  throw new BadRequestException(
                    "Select an actor belonging to this Instance.",
                  );
                const assigned = request.controllerIds ?? actor.controllerIds;
                const definition = records(
                  instance.currentSnapshot!.worldDefinitionSnapshot.manifest,
                ).find(
                  (r) => r.sourceId === object(entry.creature).definitionId,
                );
                if (
                  combatCompatibilityIssues({
                    profile: request.profile,
                    definition: definition?.payload,
                    activeEffects: object(entry.creature).activeEffects,
                  }).length
                )
                  throw new BadRequestException(
                    "Rewrite legacy turn-based combat rules before using this actor in planned combat.",
                  );
                if (
                  actor.position &&
                  ![
                    actor.position.point.x,
                    actor.position.point.y,
                    actor.position.point.z,
                  ].every(Number.isSafeInteger)
                )
                  throw new BadRequestException(
                    "Place combatants on five-foot square boundaries before starting.",
                  );
                if (
                  assigned.some(
                    (id) => !loaded.memberships.some((m) => m.userId === id),
                  )
                )
                  throw new BadRequestException(
                    "Assign only accepted active players as controllers.",
                  );
                if (
                  object(entry.source).kind === "character" &&
                  JSON.stringify([...assigned].sort()) !==
                    JSON.stringify([...actor.controllerIds].sort())
                )
                  throw new BadRequestException(
                    "A Character is controlled by its active player membership.",
                  );
                const existing = object(object(entry.creature).combat);
                return {
                  entityId: request.entityId,
                  name: actor.name,
                  hp: existing.hp ?? request.hp,
                  maxHp: existing.maxHp ?? request.maxHp,
                  prone: existing.prone === true,
                  removed: existing.removed ?? request.removed ?? false,
                  incapacitation:
                    existing.incapacitation ?? request.incapacitation ?? null,
                  profile: bindCombatProfile(request.profile, actor.sources),
                  controllerIds: assigned,
                  playerControlled: assigned.length > 0,
                  visibleToPlayers: request.visibleToPlayers ?? true,
                  ...(actor.position ? { position: actor.position } : {}),
                } as CombatantState;
              },
            );
            const sceneIds = new Set(
              combatants.map((c) => c.position?.sceneId),
            );
            if (sceneIds.size > 1 || sceneIds.has(undefined))
              throw new BadRequestException(
                "Place every combatant in the same captured Location before starting.",
              );
            encounter = createEncounterState({
              identity: {
                id: randomUUID(),
                version: { revision: 1, updatedAt: new Date().toISOString() },
              } as EncounterState["identity"],
              name: input.setup.name.trim(),
              combatants,
              environment: {
                sceneId: combatants[0].position!.sceneId,
                grid: "square",
                scale: { value: 5, unit: "foot" },
              },
            });
          } else {
            if (!encounter)
              throw new ConflictException("Set up an encounter first.");
            if (input.command!.commandId !== input.idempotencyKey)
              throw new BadRequestException(
                "The command and request operation keys must match.",
              );
            if (
              input.command!.kind !== "complete" &&
              saved.snapshotId !== instance.currentSnapshotId
            )
              throw new ConflictException(
                "Captured content changed. Complete this encounter before starting another.",
              );

            if (
              input.command!.kind === "change-combatant" &&
              input.command!.controllerIds
            ) {
              const assignment = input.command!.controllerIds;
              const entry = entries.find(
                (e) =>
                  e.runtimeEntityId ===
                  (input.command as { combatantId: string }).combatantId,
              );
              if (
                object(entry?.source).kind === "character" ||
                assignment.some(
                  (id) => !loaded.memberships.some((m) => m.userId === id),
                )
              )
                throw new BadRequestException(
                  "Only additional actors may be assigned to accepted active players.",
                );
            }
            if (
              input.command!.kind === "lock" ||
              input.command!.kind === "publish"
            )
              this.assertBaseline(encounter, state, saved);
            if (input.command!.kind === "edit-plan") {
              this.validateReactionSources(input.command!, actors);
              if (scope.player)
                for (const activity of input.command!.activities) {
                  if (activity.kind === "move") continue;
                  const target = encounter.combatants.find(
                    (actor) => actor.entityId === activity.targetId,
                  );
                  if (
                    !target ||
                    !(
                      target.visibleToPlayers ||
                      target.controllerIds.includes(scope.userId)
                    )
                  )
                    throw new BadRequestException(
                      "Choose a visible encounter target.",
                    );
                }
            }
            if (input.command!.expectedRevision !== encounter.revision)
              throw new ConflictException(
                "The encounter changed. Refresh before continuing.",
              );
            const seed = typeof saved.seed === "string" ? saved.seed : "";
            const needsEntropy = ["step", "adjudicate"].includes(
              input.command!.kind,
            );
            const owner = new Encounter(encounter);
            try {
              let commandRevision = encounter.revision;
              const currentActors = encounter.paused
                ? []
                : encounter.phase === "planning"
                  ? encounter.combatants
                  : encounter.simulated;
              for (const actor of currentActors) {
                const entry = entries.find(
                  (e) => e.runtimeEntityId === actor.entityId,
                );
                const characterId = object(entry?.source).characterId;
                const allowed = actor.controllerIds.filter((id) =>
                  loaded.memberships.some(
                    (m) =>
                      m.userId === id &&
                      (!characterId ||
                        (m.activeCharacter?.status === "ACTIVE" &&
                          m.activeCharacter.characterId === characterId)),
                  ),
                );
                if (allowed.length === actor.controllerIds.length) continue;
                const receipt = await owner.command("execute", {
                  initiator: scope.userId,
                  context: { userId: scope.userId, isGm: true, rolls: [] },
                  params: {
                    command: {
                      kind: "change-combatant",
                      combatantId: actor.entityId,
                      controllerIds: allowed,
                      commandId:
                        input.idempotencyKey + ":control:" + actor.entityId,
                      expectedRevision: commandRevision,
                    },
                  },
                });
                if (receipt.status === "rejected")
                  throw new ConflictException(receipt.reason);
                commandRevision++;
              }
              const receipt = await owner.command("execute", {
                initiator: scope.userId,
                context: {
                  userId: scope.userId,
                  isGm: !scope.player,
                  ...{
                    rollsByActor: needsEntropy
                      ? Object.fromEntries(
                          encounter.combatants.map((actor) => [
                            actor.entityId,
                            encounterEntropy(
                              seed,
                              encounter!.randomCursor,
                              actor.entityId,
                              entropyBudget(
                                actor.profile,
                                encounter!.combatants.length,
                              ),
                            ),
                          ]),
                        )
                      : {},
                  },
                  rolls: needsEntropy
                    ? encounterEntropy(
                        seed,
                        Number(
                          (encounter as unknown as Record<string, unknown>)
                            .randomCursor ?? 0,
                        ),
                      )
                    : [],
                },
                params: {
                  command: {
                    ...input.command!,
                    expectedRevision: commandRevision,
                  },
                },
              });
              if (receipt.status === "rejected")
                throw new ConflictException(receipt.reason);
              encounter = decodeEncounterState(owner.serialize().data);
            } finally {
              owner.dispose();
            }
          }
          if (!encounter)
            throw new ConflictException("The encounter is unavailable.");
          const ids = new Set(encounter.combatants.map((c) => c.entityId));
          const baseline = hash({
            actors: entries.filter((e) => ids.has(e.runtimeEntityId as never)),
            items: state.itemInstances,
          });
          encounter = {
            ...encounter,
            extensions: {
              ...encounter.extensions,
              "aow:combatCapture": {
                ...saved,
                snapshotId: instance.currentSnapshotId!,
                baseline: saved.baseline ?? baseline,
                source: "gm-configured",
                configuredBy: saved.configuredBy ?? scope.userId,
                receipts: { ...receipts, [input.idempotencyKey]: requestHash },
              },
            },
          };
          const instanceOwner = CampaignInstance.deserializePayload(state, {
            captured: runtimeCaptureContext(instance),
          });
          let next: Record<string, unknown>;
          try {
            const publish = input.command?.kind === "publish";
            if (publish)
              for (const actor of encounter.combatants) {
                if (
                  actor.position &&
                  capturedActorPositionIssue(
                    instance.currentSnapshot!.worldDefinitionSnapshot.manifest,
                    actor.position.sceneId,
                    {
                      x: actor.position.point.x * 5,
                      y: actor.position.point.y * 5,
                      z: (actor.position.point.z ?? 0) * 5,
                    },
                  )
                )
                  throw new BadRequestException(
                    "A resolved position is outside the captured Location.",
                  );
              }
            const result = await instanceOwner.command("encounter", {
              initiator: scope.userId,
              context: {},
              params: {
                encounter,
                publish,
                updatedAt: new Date().toISOString(),
              },
            });
            if (result.status === "rejected")
              throw new BadRequestException(result.reason);
            next = instanceOwner.serializePayload();
            // Publication establishes the baseline for the next round, without exposing simulation early.
            if (publish) {
              const nextBaseline = hash({
                actors: array(next.creatureEmbodiments).filter((e) =>
                  ids.has(e.runtimeEntityId as never),
                ),
                items: next.itemInstances,
              });
              next.encounter = {
                ...encounter,
                extensions: {
                  ...encounter.extensions,
                  "aow:combatCapture": {
                    ...metadata(encounter),
                    baseline: nextBaseline,
                  },
                },
              };
            }
          } finally {
            instanceOwner.dispose();
          }
          const changed = await tx.campaignInstanceRuntime.updateMany({
            where: {
              id: runtime.id,
              revision: input.expectedRuntimeRevision,
              campaignInstanceSnapshotId: instance.currentSnapshotId!,
            },
            data: { state: json(next), revision: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new ConflictException(
              "The Instance changed. Refresh before continuing.",
            );
          await tx.campaignInstanceAuditEvent.create({
            data: {
              campaignInstanceId: scope.instanceId,
              actorUserId: scope.userId,
              action: `instance.encounter.${input.command?.kind ?? "setup"}`,
              subjectName: encounter.name,
              subjectType: "Encounter",
              detail: json({
                fromRuntimeRevision: runtime.revision,
                toRuntimeRevision: runtime.revision + 1,
                encounterRevision: encounter.revision,
                operationKey: input.idempotencyKey,
                command: input.command ?? null,
                ...(input.command?.kind === "reopen"
                  ? { discardedRound: state.encounter }
                  : {}),
                ...(input.setup && state.encounter
                  ? { completedEncounter: state.encounter }
                  : {}),
              }),
            },
          });
          return this.projection(loaded, scope, next, runtime.revision + 1);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new ConflictException(
          "Another operation changed this encounter. Refresh and retry.",
        );
      if (error instanceof TypeError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  private assertBaseline(
    encounter: EncounterState,
    state: Record<string, unknown>,
    saved: Record<string, unknown>,
  ) {
    const ids = new Set(encounter.combatants.map((c) => c.entityId));
    if (
      saved.baseline !==
      hash({
        actors: array(state.creatureEmbodiments).filter((e) =>
          ids.has(e.runtimeEntityId as never),
        ),
        items: state.itemInstances,
      })
    )
      throw new ConflictException(
        "Combatant or equipment state changed. This round cannot overwrite those changes.",
      );
  }
  private validateReactionSources(
    command: Extract<EncounterCommand, { kind: "edit-plan" }>,
    actors: ReturnType<CampaignEncounterService["setupActors"]>,
  ) {
    const actor = actors.find((a) => a.entityId === command.combatantId);
    if (!actor) throw new BadRequestException("This actor is unavailable.");
    for (const activity of command.activities)
      if (activity.kind === "reaction") {
        for (const c of activity.response.defense ?? [])
          if (
            !actor.sources.some(
              (s) => s.id === c.source.id && s.kind === c.source.kind,
            )
          )
            throw new BadRequestException(
              "A reaction uses an unavailable contribution source.",
            );
      }
  }
}

/** Secret captured seed and persisted domain cursor reproduce dice across restart/retry. */
export function encounterEntropy(
  seed: string,
  cursor: number,
  actorId = "shared",
  count = 8192,
): number[] {
  if (
    !/^[a-f0-9]{64}$/.test(seed) ||
    !Number.isSafeInteger(cursor) ||
    cursor < 0
  )
    throw new ConflictException("The encounter random state is unavailable.");
  return Array.from(
    { length: count },
    (_, i) =>
      createHmac("sha256", seed)
        .update(JSON.stringify([actorId, cursor, i]))
        .digest()
        .readUInt32BE(0) /
      2 ** 32,
  );
}

function entropyBudget(profile: CombatProfile, roster: number): number {
  const formulas = [
    profile.attack,
    profile.defense,
    profile.damage,
    profile.resistance,
    profile.might,
    ...profile.reactions.map((rule) => rule.defense),
    ...profile.pairings.flatMap((rule) => [rule.first, rule.second]),
  ];
  const dice = formulas
    .flatMap((formula) => formula)
    .flatMap((contribution) => contribution.terms)
    .reduce(
      (count, term) => count + (term.kind === "dice" ? term.count * 2 : 0),
      0,
    );
  return Math.min(8192, Math.max(32, dice * (roster + 2)));
}
