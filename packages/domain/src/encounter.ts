import type {
  CombatActivity,
  CombatCost,
  CombatantState,
  CombatConflict,
  CombatHistoryEntry,
  CombatOutcome,
  CombatPlan,
  EncounterCommand,
  EncounterCommandContext,
  EncounterState,
  PlayerEncounterProjection,
} from "@aow/common";
import {
  Entity,
  copyEntityData,
  type CommandInvocation,
  type EntityOptions,
  type ValidationIssue,
  type EntityTransition,
} from "./entity-runtime";
import { CombatEntropy, validateCombatFormula } from "./combat-rolls";
type Mutable<T> = T extends string | number | boolean | null | undefined
  ? T
  : { -readonly [K in keyof T]: Mutable<T[K]> };
type State = Mutable<Omit<EncounterState, "extensions">> &
  Pick<EncounterState, "extensions">;
const emptyPlan = (): CombatPlan => ({
  activities: [],
  cursor: 0,
  movementUsed: 0,
  pathIndex: 0,
  submitted: false,
  revision: 0,
  armed: [],
  reactionStates: {},
});
export function createEncounterState(
  input: Pick<
    EncounterState,
    "identity" | "name" | "combatants" | "environment"
  >,
): EncounterState {
  const state: EncounterState = {
    ...input,
    schemaVersion: 2,
    revision: 0,
    randomCursor: 0,
    phase: "planning",
    paused: false,
    round: 1,
    slot: 0,
    simulated: copyEntityData(input.combatants),
    plans: Object.fromEntries(
      input.combatants.map((c) => [c.entityId, emptyPlan()]),
    ),
    history: [],
    processedCommandIds: [],
  };
  assertEncounter(state);
  return state;
}
function checkPoint(p: { x: number; y: number }): boolean {
  return Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y);
}
function assertEncounter(s: EncounterState): void {
  if (!s || s.schemaVersion !== 2)
    throw new TypeError(
      "Legacy initiative encounters require explicit archival before starting planned combat.",
    );
  if (
    ![
      "setup",
      "planning",
      "locked",
      "resolving",
      "adjudication",
      "review",
      "published",
      "completed",
    ].includes(s.phase) ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !Number.isSafeInteger(s.randomCursor) ||
    s.randomCursor < 0 ||
    !Number.isSafeInteger(s.slot) ||
    s.slot < 0 ||
    !Number.isSafeInteger(s.round) ||
    s.round < 1 ||
    !Array.isArray(s.history) ||
    !Array.isArray(s.processedCommandIds) ||
    typeof s.paused !== "boolean"
  )
    throw new TypeError("Invalid encounter lifecycle.");
  if (
    s.environment?.grid !== "square" ||
    s.environment.scale.value !== 5 ||
    s.environment.scale.unit !== "foot"
  )
    throw new TypeError("Combat requires a five-foot square grid.");
  if (
    !Array.isArray(s.combatants) ||
    !Array.isArray(s.simulated) ||
    new Set(s.combatants.map((c) => c.entityId)).size !== s.combatants.length
  )
    throw new TypeError("Encounter roster must be unique.");
  for (const c of [...s.combatants, ...s.simulated]) {
    if (
      !c.name?.trim() ||
      !Number.isSafeInteger(c.hp) ||
      !Number.isSafeInteger(c.maxHp) ||
      c.maxHp < 1 ||
      c.hp < 0 ||
      c.hp > c.maxHp ||
      !Array.isArray(c.controllerIds) ||
      c.controllerIds.some((id: unknown) => typeof id !== "string") ||
      typeof c.playerControlled !== "boolean" ||
      typeof c.visibleToPlayers !== "boolean" ||
      (c.removed !== undefined && typeof c.removed !== "boolean") ||
      (c.prone !== undefined && typeof c.prone !== "boolean") ||
      (c.incapacitation !== undefined &&
        c.incapacitation !== null &&
        !["unconscious", "dead"].includes(c.incapacitation)) ||
      (c.position && !checkPoint(c.position.point))
    )
      throw new TypeError(
        "Combatants require explicit health, controllers and square positions.",
      );
    const p = c.profile;
    if (
      !p ||
      !Number.isSafeInteger(p.reachSquares) ||
      p.reachSquares < 0 ||
      !Number.isSafeInteger(p.movementCheckpoints) ||
      p.movementCheckpoints < 0 ||
      !Array.isArray(p.rules) ||
      !Array.isArray(p.pairings) ||
      !p.resources
    )
      throw new TypeError("An explicit captured combat profile is required.");
    for (const pairing of p.pairings) {
      if (
        pairing.outcome !== "winner-first" ||
        ![
          "concurrency advantage",
          "concurrency disadvantage",
          "concurrency neutral",
        ].includes(pairing.firstLabel) ||
        ![
          "concurrency advantage",
          "concurrency disadvantage",
          "concurrency neutral",
        ].includes(pairing.secondLabel)
      )
        throw new TypeError(
          "Concurrency rules require labeled sides and explicit winner-first semantics.",
        );
      validateCombatFormula(pairing.first);
      validateCombatFormula(pairing.second);
    }
    for (const f of [p.attack, p.defense, p.damage, p.resistance, p.might])
      validateCombatFormula(f);
    for (const [resource, limit] of Object.entries(p.roundResourceLimits ?? {}))
      if (
        !Object.hasOwn(p.resources, resource) ||
        typeof limit !== "number" ||
        !Number.isSafeInteger(limit) ||
        limit < 0
      )
        throw new TypeError(
          "Round resource limits require an explicit nonnegative capacity.",
        );
    for (const rule of p.rules)
      if (
        rule.completion.kind === "summon" &&
        rule.completion.sameRoundAttackCost
      )
        validateCost(
          rule.completion.sameRoundAttackCost,
          p.resources,
          "on-completion",
        );
    for (const n of Object.values(p.resources))
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
        throw new TypeError("Resources must be nonnegative integers.");
    validateCost(p.attackCost, p.resources, "on-completion");
    if (!Array.isArray(p.reactions))
      throw new TypeError("Explicit reaction rules are required.");
    for (const r of p.reactions) {
      if (
        !r.id ||
        !r.name ||
        !["before", "replace", "after"].includes(r.timing)
      )
        throw new TypeError("Invalid reaction rule.");
      validateCombatFormula(r.defense);
      validateCost(r.cost, p.resources, "on-trigger");
    }
    for (const rule of p.rules) {
      if (
        !rule.id ||
        !rule.name ||
        !["potion", "spell", "interaction", "death-save", "summon"].includes(
          rule.kind,
        ) ||
        !["apply-hp", "gm-confirmation", "summon"].includes(
          rule.completion?.kind,
        ) ||
        (rule.completion.kind === "apply-hp" &&
          !Number.isSafeInteger(rule.completion.amount)) ||
        rule.impossible !== "skip" ||
        (rule.cost &&
          (rule.cost.payment !== "on-completion" ||
            !Number.isSafeInteger(rule.cost.amount) ||
            rule.cost.amount < 1 ||
            !Object.hasOwn(p.resources, rule.cost.resource)))
      )
        throw new TypeError("Invalid activity completion contract.");
    }
  }
  for (const c of s.combatants) {
    const p = s.plans[c.entityId];
    if (
      !p ||
      !Array.isArray(p.activities) ||
      !Array.isArray(p.armed) ||
      !Number.isSafeInteger(p.cursor) ||
      p.cursor < 0 ||
      p.cursor > p.activities.length ||
      !Number.isSafeInteger(p.movementUsed) ||
      p.movementUsed < 0 ||
      !Number.isSafeInteger(p.pathIndex) ||
      p.pathIndex < 0
    )
      throw new TypeError("Invalid plan cursor.");
    if (s.phase === "planning" || s.phase === "locked")
      validateActivities(c, p.activities, s);
  }
}
export function decodeEncounterState(input: unknown): EncounterState {
  const raw = copyEntityData(input) as {
    type?: string;
    schemaVersion?: number;
    data?: unknown;
  };
  const s = (raw?.type === "Encounter" ? raw.data : raw) as EncounterState;
  assertEncounter(s);
  return s;
}
function validateActivities(
  c: CombatantState,
  activities: readonly CombatActivity[],
  s: EncounterState,
): void {
  if (
    activities.length > 100 ||
    new Set(activities.map((a) => a.id)).size !== activities.length
  )
    throw new TypeError(
      "Plan activities must have unique identities and fit the supported plan size.",
    );
  if (
    c.incapacitation === "unconscious" &&
    activities.some((a) => a.kind !== "death-save")
  )
    throw new TypeError(
      "An unconscious combatant may declare only its configured death-save activity.",
    );
  let position = c.position?.point;
  let moves = 0;
  const costs: Record<string, number> = {};
  for (const a of activities) {
    if (!a.id || !a.name?.trim())
      throw new TypeError("Activities require a name.");
    if (a.kind === "move") {
      if (!position || !a.path.length)
        throw new TypeError("Movement needs a starting position and route.");
      for (const p of a.path) {
        if (
          !checkPoint(p) ||
          Math.max(Math.abs(p.x - position.x), Math.abs(p.y - position.y)) !==
            1 ||
          p.z !== position.z
        )
          throw new TypeError(
            "Each movement checkpoint must be an adjacent square at the same elevation.",
          );
        position = p;
        moves++;
      }
    } else {
      if (!s.combatants.some((x) => x.entityId === a.targetId))
        throw new TypeError("Choose an encounter target.");
      if (a.kind === "reaction") {
        if (!a.response.name?.trim() || a.trigger !== "incoming-attack")
          throw new TypeError("Declare a specific reaction response.");
        const rule = c.profile.reactions.find((r) => r.id === a.ruleId);
        if (
          !rule ||
          a.response.name !== rule.name ||
          (a.timing && a.timing !== rule.timing) ||
          (a.response.defense &&
            JSON.stringify(a.response.defense) !== JSON.stringify(rule.defense))
        )
          throw new TypeError("Choose a captured reaction rule.");
        if (rule.cost.kind === "resource")
          costs[rule.cost.resource] =
            (costs[rule.cost.resource] ?? 0) + rule.cost.amount;
      } else if (a.kind !== "attack") {
        const rule = c.profile.rules.find(
          (r) => r.id === a.ruleId && r.kind === a.kind,
        );
        if (!rule)
          throw new TypeError(
            "Activity needs a supported captured completion rule.",
          );
        if (
          a.kind === "death-save" &&
          rule.completion.kind !== "gm-confirmation"
        )
          throw new TypeError(
            "Death-save requires explicit GM confirmation of its configured result.",
          );
        if (a.kind === "summon") {
          if (
            rule.completion.kind !== "summon" ||
            !s.combatants.find((c) => c.entityId === a.targetId)?.removed
          )
            throw new TypeError(
              "Summon requires a captured inactive combatant.",
            );
          if (a.summonedAttack) {
            const cost = rule.completion.sameRoundAttackCost;
            if (!cost || cost.kind !== "resource")
              throw new TypeError(
                "A declared same-round summon attack must consume summoner capacity.",
              );
            costs[cost.resource] = (costs[cost.resource] ?? 0) + cost.amount;
            if (
              !s.combatants.some(
                (c) => c.entityId === a.summonedAttack!.targetId,
              )
            )
              throw new TypeError(
                "Choose a captured target for the summoned attack.",
              );
          }
        }
        if (rule.cost)
          costs[rule.cost.resource] =
            (costs[rule.cost.resource] ?? 0) + rule.cost.amount;
      }
      if (a.kind === "attack" && c.profile.attackCost.kind === "resource") {
        const cost = c.profile.attackCost;
        costs[cost.resource] = (costs[cost.resource] ?? 0) + cost.amount;
      }
    }
  }
  if (moves > c.profile.movementCheckpoints)
    throw new TypeError("Movement exceeds the captured round budget.");
  if (
    c.playerControlled &&
    activities.filter((a) => a.kind === "reaction").length > 1
  )
    throw new TypeError("Only one reaction may be declared per player token.");
  for (const [k, v] of Object.entries(costs))
    if (v > (c.profile.resources[k] ?? 0))
      throw new TypeError("Plan exceeds available resources.");
}
interface Commands {
  execute: {
    params: { command: EncounterCommand };
    context: EncounterCommandContext;
  };
}
interface Events {
  changed: { revision: number; phase: EncounterState["phase"] };
}
type EncounterData = Omit<EncounterState, "extensions"> & {
  readonly extensions?: Readonly<Record<string, unknown>>;
};
export class Encounter extends Entity<EncounterData, Commands, Events> {
  constructor(state: EncounterState, options: EntityOptions = {}) {
    super(
      "Encounter",
      decodeEncounterState(state),
      ["changed"],
      { mode: "runtime" },
      options,
    );
    this.revalidate();
  }
  override serialize(): {
    type: string;
    schemaVersion: 1;
    data: EncounterState;
  } {
    return super.serialize() as {
      type: string;
      schemaVersion: 1;
      data: EncounterState;
    };
  }
  static deserialize(
    input: unknown,
    _context: object = {},
    options: EntityOptions = {},
  ): Encounter {
    return new Encounter(decodeEncounterState(input), options);
  }
  protected validateState(data: EncounterData): readonly ValidationIssue[] {
    try {
      assertEncounter(data as EncounterState);
      return [];
    } catch (e) {
      return [{ code: "encounter.invalid", message: (e as Error).message }];
    }
  }
  protected handleCommand(
    _name: "execute",
    invocation: CommandInvocation<Commands["execute"]>,
  ): EntityTransition<EncounterData, Events> {
    const command = invocation.params.command;
    const context = invocation.context;
    const current = this.state.data;
    const controllerCommand =
      command.kind === "edit-plan" || command.kind === "submit-plan";
    if (
      !context.isGm &&
      (!controllerCommand ||
        !current.combatants.some(
          (c) =>
            c.entityId === (command as { combatantId?: string }).combatantId &&
            c.controllerIds.includes(context.userId),
        ))
    )
      throw new TypeError("This command is not permitted for this controller.");
    if (current.processedCommandIds.includes(command.commandId))
      return { data: current };
    if (!command.commandId || command.expectedRevision !== current.revision)
      throw new TypeError("The encounter changed. Refresh before editing.");
    const s = copyEntityData(current) as unknown as State;
    const entropy = new CombatEntropy(context.rolls, context.rollsByActor);
    const owner =
      command.kind === "edit-plan" || command.kind === "submit-plan";
    if (!owner && !context.isGm)
      throw new TypeError("Only the GM can guide encounter resolution.");
    if (s.paused && !["resume", "complete"].includes(command.kind))
      throw new TypeError("Resume the encounter first.");
    if (owner) {
      if (s.phase !== "planning") throw new TypeError("Planning is closed.");
      const c = s.combatants.find((c) => c.entityId === command.combatantId);
      if (!c || (!context.isGm && !c.controllerIds.includes(context.userId)))
        throw new TypeError("This plan belongs to another controller.");
      const p = s.plans[c.entityId]!;
      if (p.revision !== command.planRevision)
        throw new TypeError("This plan changed. Refresh before editing.");
      if (command.kind === "edit-plan") {
        validateActivities(c, command.activities, s);
        p.activities = copyEntityData(
          command.activities,
        ) as Mutable<CombatActivity>[];
        p.submitted = false;
        p.reactionStates = Object.fromEntries(
          p.activities
            .filter((a) => a.kind === "reaction")
            .map((a) => [a.id, { status: "pending" }]),
        );
      } else {
        validateActivities(c, p.activities, s);
        p.submitted = true;
      }
      p.revision++;
    } else
      switch (command.kind) {
        case "pause":
          s.paused = true;
          break;
        case "resume":
          s.paused = false;
          break;
        case "lock":
          if (s.phase !== "planning")
            throw new TypeError("Only planning can be locked.");
          s.simulated = copyEntityData(s.combatants);
          for (const [id, p] of Object.entries(s.plans)) {
            if (!p.submitted) p.activities = [];
            p.cursor = 0;
            p.pathIndex = 0;
            p.movementUsed = 0;
            p.armed = [];
            if (
              !alive(s.simulated.find((c) => c.entityId === id)!) &&
              s.simulated.find((c) => c.entityId === id)!.incapacitation !==
                "unconscious"
            )
              p.discarded = true;
          }
          s.phase = "locked";
          break;
        case "step":
          if (!["locked", "resolving"].includes(s.phase))
            throw new TypeError(
              "Resolve the current conflict or finish planning first.",
            );
          step(s, entropy);
          break;
        case "adjudicate":
          adjudicate(s, command, entropy);
          break;
        case "publish":
          if (s.phase !== "review")
            throw new TypeError("Finish guided resolution before publishing.");
          s.combatants = copyEntityData(s.simulated);
          s.phase = "published";
          for (const h of s.history)
            if (
              h.round === s.round &&
              !h.superseded &&
              !h.decision &&
              h.actorIds.every(
                (id) =>
                  s.combatants.find((c) => c.entityId === id)?.visibleToPlayers,
              )
            )
              h.visibility = "public";
          for (const p of Object.values(s.plans)) {
            for (const r of p.armed)
              (p.reactionStates ??= {})[r.id] = {
                status: "expired",
                slot: s.slot,
              };
            p.armed = [];
          }
          break;
        case "next-round":
          if (s.phase !== "published")
            throw new TypeError("Publish this round first.");
          for (const c of s.combatants)
            for (const [resource, limit] of Object.entries(
              c.profile.roundResourceLimits ?? {},
            ))
              c.profile.resources[resource] = limit;
          s.simulated = copyEntityData(s.combatants);
          s.round++;
          s.slot = 0;
          s.phase = "planning";
          s.plans = Object.fromEntries(
            s.combatants.map((c) => [c.entityId, emptyPlan()]),
          ) as State["plans"];
          break;
        case "reopen":
          if (["published", "completed"].includes(s.phase))
            throw new TypeError("Published rounds cannot be reopened.");
          s.phase = "planning";
          s.simulated = copyEntityData(s.combatants);
          delete s.conflict;
          s.slot = 0;
          for (const h of s.history)
            if (h.round === s.round) {
              h.superseded = true;
              h.visibility = "gm";
            }
          for (const p of Object.values(s.plans)) {
            p.cursor = 0;
            p.pathIndex = 0;
            p.armed = [];
            p.movementUsed = 0;
            p.submitted = false;
            if (p.discarded) p.activities = [];
            p.discarded = false;
            p.reactionStates = Object.fromEntries(
              p.activities
                .filter((a) => a.kind === "reaction")
                .map((a) => [a.id, { status: "pending" }]),
            );
            p.revision++;
          }
          break;
        case "complete":
          if (!["planning", "published", "setup"].includes(s.phase))
            throw new TypeError(
              "Publish or reopen the current round before completing.",
            );
          s.phase = "completed";
          break;
        case "change-combatant": {
          if (["published", "completed"].includes(s.phase))
            throw new TypeError(
              "Start the next round before changing a combatant.",
            );
          const list = s.phase === "planning" ? s.combatants : s.simulated;
          const c = list.find((c) => c.entityId === command.combatantId);
          if (!c) throw new TypeError("Combatant is unavailable.");
          if (command.hp !== undefined) c.hp = command.hp;
          if (command.incapacitation !== undefined)
            c.incapacitation = command.incapacitation;
          if (command.removed !== undefined) c.removed = command.removed;
          if (command.controllerIds) {
            c.controllerIds = [...command.controllerIds];
            s.combatants.find(
              (actor) => actor.entityId === c.entityId,
            )!.controllerIds = [...command.controllerIds];
          }
          if (
            c.removed ||
            c.incapacitation === "dead" ||
            (c.hp === 0 && c.incapacitation !== "unconscious") ||
            command.controllerIds
          ) {
            const p = s.plans[c.entityId]!;
            p.discarded = true;
            p.armed = [];
          }
          log(s, `${c.name}'s encounter state changed.`, [c.entityId]);
          break;
        }
        default:
          throw new TypeError("Unsupported encounter command.");
      }
    if (
      !owner &&
      !["step", "adjudicate", "change-combatant"].includes(command.kind)
    )
      log(s, `Encounter ${command.kind}.`, []);
    s.randomCursor += entropy.consumed;
    s.revision++;
    s.processedCommandIds.push(command.commandId);
    return {
      data: s as EncounterState,
      events: [
        {
          name: "changed" as const,
          context: { revision: s.revision, phase: s.phase },
        },
      ],
    };
  }
}
function alive(c: CombatantState): boolean {
  return c.hp > 0 && !c.removed && !c.incapacitation;
}
function log(
  s: State,
  text: string,
  actorIds: string[],
  extra: Partial<CombatHistoryEntry> = {},
): void {
  s.history.push({
    round: s.round,
    slot: s.slot,
    text,
    actorIds,
    visibility: "gm",
    ...extra,
  } as Mutable<CombatHistoryEntry>);
}
function current(s: State) {
  return s.simulated.flatMap((c) => {
    const p = s.plans[c.entityId];
    const a = p?.activities[p.cursor];
    return (alive(c) ||
      (c.incapacitation === "unconscious" &&
        !c.removed &&
        a?.kind === "death-save")) &&
      p &&
      !p.discarded &&
      a
      ? [{ c, p, a }]
      : [];
  });
}
type Active = ReturnType<typeof current>[number];
function conclude(x: Active) {
  x.p.cursor++;
  x.p.pathIndex = 0;
}
function discardDead(s: State) {
  for (const c of s.simulated)
    if (
      c.removed ||
      c.incapacitation === "dead" ||
      (c.hp === 0 && c.incapacitation !== "unconscious")
    ) {
      const p = s.plans[c.entityId]!;
      p.discarded = true;
      for (const r of p.armed)
        (p.reactionStates ??= {})[r.id] = {
          status: "invalidated",
          slot: s.slot,
        };
      p.armed = [];
    }
}
function conflict(
  s: State,
  kind: CombatConflict["kind"],
  actors: Active[],
  description: string,
) {
  s.conflict = {
    id: `round-${s.round}-slot-${s.slot}`,
    slot: s.slot,
    kind,
    actorIds: [...new Set(actors.map((x) => x.c.entityId))],
    activityIds: Object.fromEntries(actors.map((x) => [x.c.entityId, x.a.id])),
    outcomeIds: [
      ...new Set(
        actors.flatMap((x) => [
          x.c.entityId,
          ...("targetId" in x.a ? [x.a.targetId] : []),
        ]),
      ),
    ],
    ...(actors.filter((x) => x.a.kind === "attack").length === 1
      ? {
          focalActorId: actors.find((x) => x.a.kind === "attack")!.c.entityId,
          focalActivityName: actors.find((x) => x.a.kind === "attack")!.a.name,
        }
      : {}),
    description,
    facts: actors.map(
      (x) =>
        `${x.c.name}: ${x.a.name}${x.c.position ? ` at square (${x.c.position.point.x}, ${x.c.position.point.y})` : ""}; ${x.p.armed.length} armed reaction(s).`,
    ),
    choices: ["before", "after", "simultaneous", "custom"],
  };
  s.phase = "adjudication";
}
function step(s: State, entropy: CombatEntropy) {
  s.slot++;
  s.phase = "resolving";
  const active = current(s);
  for (const x of active.filter((x) => x.a.kind === "reaction"))
    apply(s, x, entropy);
  const rest = active.filter((x) => x.a.kind !== "reaction");
  const specialReactions = rest
    .filter((x) => x.a.kind === "attack")
    .flatMap((x) =>
      s.simulated.flatMap((c) =>
        (s.plans[c.entityId]?.armed ?? [])
          .filter(
            (r) =>
              alive(c) &&
              canPay(
                c,
                c.profile.reactions.find((rule) => rule.id === r.ruleId)!.cost,
              ) &&
              r.targetId === (x.a as { targetId: string }).targetId &&
              (!r.sourceIds?.length || r.sourceIds.includes(x.c.entityId)) &&
              c.profile.reactions.find((rule) => rule.id === r.ruleId)
                ?.timing !== "before",
          )
          .map((r) => ({ c, p: s.plans[c.entityId]!, a: r })),
      ),
    );
  if (specialReactions.length) {
    conflict(
      s,
      "interaction",
      [
        ...rest,
        ...specialReactions.filter((r) => !rest.some((x) => x.c === r.c)),
      ],
      "Declared after/replace reactions require a GM outcome respecting their captured timing.",
    );
    s.conflict!.reactionIds = Object.fromEntries(
      specialReactions.map((r) => [
        r.c.entityId,
        specialReactions.filter((x) => x.c === r.c).map((x) => x.a.id),
      ]),
    );
    s.conflict!.choices = ["custom"];
    return;
  }
  const risky = rest.filter(
    (x) => x.a.kind !== "move" || x.p.pathIndex === x.a.path.length - 1,
  );
  // A stationary occupant is the defender; two arrivals have no implicit defender.
  for (const x of rest) {
    if (x.a.kind !== "move" || x.p.pathIndex !== x.a.path.length - 1) continue;
    const destination = x.a.path[x.p.pathIndex]!;
    const occupants = s.simulated.filter(
      (c) =>
        c.entityId !== x.c.entityId &&
        alive(c) &&
        c.position?.sceneId === x.c.position?.sceneId &&
        c.position &&
        sameSquare(c.position.point, destination) &&
        !rest.some((y) => y.c.entityId === c.entityId && y.a.kind === "move"),
    );
    if (occupants.length) {
      const extras = occupants
        .filter((c) => !rest.some((x) => x.c === c))
        .map((c) => ({
          c,
          p: s.plans[c.entityId]!,
          a: {
            id: "occupancy",
            name: "Hold position",
            kind: "move" as const,
            path: [],
          },
        }));
      conflict(
        s,
        "collision",
        [...rest, ...extras],
        "Movement ends in an occupied square. Resolve contested Might or author the outcome.",
      );
      if (occupants.length === 1)
        s.conflict!.defenderId = occupants[0]!.entityId;
      return;
    }
  }
  let material = false;
  let collision = false;
  for (const x of risky)
    for (const y of rest) {
      if (x === y) continue;
      if (
        x.a.kind === "attack" &&
        (x.a.targetId === y.c.entityId ||
          (y.a.kind === "attack" && y.a.targetId === x.c.entityId))
      )
        material = true;
      if (
        x.a.kind === "move" &&
        y.a.kind === "move" &&
        x.p.pathIndex === x.a.path.length - 1 &&
        y.p.pathIndex === y.a.path.length - 1 &&
        sameSquare(x.a.path[x.p.pathIndex]!, y.a.path[y.p.pathIndex]!)
      ) {
        material = true;
        collision = true;
      }
      if (
        x.a.kind !== "move" &&
        x.a.kind !== "reaction" &&
        y.a.kind !== "move" &&
        y.a.kind !== "reaction" &&
        x.a.targetId === y.a.targetId
      )
        material = true;
    }
  if (
    rest.some(
      (x) =>
        ["interaction", "spell", "potion", "death-save"].includes(x.a.kind) &&
        x.c.profile.rules.find(
          (r) => r.id === (x.a as { ruleId: string }).ruleId,
        )?.completion.kind === "gm-confirmation",
    )
  )
    material = true;
  if (rest.filter((x) => x.a.kind === "attack").length > 1) material = true;
  if (material) {
    conflict(
      s,
      collision ? "collision" : "timing",
      rest,
      "The relative timing or outcome changes this slot. Choose the interpretation before continuing.",
    );
    return;
  }
  for (const x of rest) apply(s, x, entropy);
  discardDead(s);
  finish(s);
}
function sameSquare(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x === b.x && a.y === b.y;
}
function finish(s: State) {
  if (!current(s).length) s.phase = "review";
  else s.phase = "resolving";
}
function apply(s: State, x: Active, entropy: CombatEntropy) {
  if (
    (!alive(x.c) &&
      !(x.c.incapacitation === "unconscious" && x.a.kind === "death-save")) ||
    x.p.discarded
  )
    return;
  const a = x.a;
  if (a.kind === "move") {
    const point = a.path[x.p.pathIndex];
    if (
      point &&
      x.c.position &&
      x.p.movementUsed < x.c.profile.movementCheckpoints
    ) {
      x.c.position = { ...x.c.position, point: { ...point } };
      x.p.pathIndex++;
      x.p.movementUsed++;
      log(s, `${x.c.name} moves one square.`, [x.c.entityId]);
    }
    if (
      x.p.pathIndex >= a.path.length ||
      x.p.movementUsed >= x.c.profile.movementCheckpoints
    )
      conclude(x);
    return;
  }
  if (a.kind === "reaction") {
    x.p.armed.push(copyEntityData(a));
    (x.p.reactionStates ??= {})[a.id] = {
      status: "armed",
      slot: s.slot,
      ...(x.p.cursor > 0
        ? { armedAfter: x.p.activities[x.p.cursor - 1]!.id }
        : {}),
    };
    log(s, `${x.c.name} arms ${a.response.name}.`, [x.c.entityId]);
    conclude(x);
    return;
  }
  const target = s.simulated.find((c) => c.entityId === a.targetId)!;
  if (a.kind === "summon") {
    const rule = x.c.profile.rules.find((r) => r.id === a.ruleId)!;
    if (rule.completion.kind !== "summon" || !target.removed)
      throw new TypeError("Summon requires a captured inactive combatant.");
    if (rule.cost) {
      if ((x.c.profile.resources[rule.cost.resource] ?? 0) < rule.cost.amount) {
        log(s, `${a.name} is skipped because its resource is exhausted.`, [
          x.c.entityId,
        ]);
        conclude(x);
        return;
      }
      x.c.profile.resources[rule.cost.resource]! -= rule.cost.amount;
    }
    target.removed = false;
    const p = s.plans[target.entityId]!;
    p.activities = [];
    p.cursor = 0;
    p.pathIndex = 0;
    p.armed = [];
    p.discarded = true;
    if (a.summonedAttack) {
      if (
        !rule.completion.sameRoundAttackCost ||
        !pay(x.c, rule.completion.sameRoundAttackCost)
      )
        throw new TypeError(
          "Same-round summoned activity must consume captured summoner capacity.",
        );
      p.activities = [
        {
          id: `${a.id}-summoned`,
          kind: "attack",
          name: a.summonedAttack.name,
          targetId: a.summonedAttack.targetId,
        },
      ];
      p.submitted = true;
      p.discarded = false;
    }
    log(
      s,
      `${x.c.name} summons ${target.name}${a.summonedAttack ? " with a declared attack" : "; it waits until next round"}.`,
      [x.c.entityId, target.entityId],
    );
    conclude(x);
    return;
  }
  if (target.removed) {
    log(s, `${a.name} is skipped because its target is unavailable.`, [
      x.c.entityId,
    ]);
    conclude(x);
    return;
  }
  if (a.kind === "attack") {
    if (
      !alive(target) ||
      !x.c.position ||
      !target.position ||
      x.c.position.sceneId !== target.position.sceneId ||
      Math.max(
        Math.abs(x.c.position.point.x - target.position.point.x),
        Math.abs(x.c.position.point.y - target.position.point.y),
      ) > x.c.profile.reachSquares
    ) {
      log(s, `${x.c.name}'s attack cannot reach its target.`, [
        x.c.entityId,
        target.entityId,
      ]);
      conclude(x);
      return;
    }
    const reactions = s.simulated.flatMap((c) =>
      alive(c)
        ? (s.plans[c.entityId]?.armed ?? [])
            .filter(
              (r) =>
                r.targetId === target.entityId &&
                canPay(
                  c,
                  c.profile.reactions.find((rule) => rule.id === r.ruleId)!
                    .cost,
                ) &&
                (!r.sourceIds?.length || r.sourceIds.includes(x.c.entityId)),
            )
            .map((r) => ({ c, r }))
        : [],
    );
    if (!pay(x.c, x.c.profile.attackCost)) {
      log(
        s,
        `${x.c.name}'s attack is skipped because its resource is exhausted.`,
        [x.c.entityId],
      );
      conclude(x);
      return;
    }
    const attack = entropy.roll(
      "Attack",
      x.c.profile.attack,
      false,
      x.c.entityId,
    );
    const baseDefense = entropy.roll(
      "Defense",
      target.profile.defense,
      false,
      target.entityId,
    );
    const reactionRolls = reactions.map(({ c, r }) =>
      entropy.roll(
        r.response.name,
        c.profile.reactions.find((rule) => rule.id === r.ruleId)!.defense,
        false,
        c.entityId,
      ),
    );
    const defense = {
      ...baseDefense,
      total:
        baseDefense.total + reactionRolls.reduce((sum, r) => sum + r.total, 0),
    };
    const rolls = [attack, baseDefense, ...reactionRolls];
    let damage = 0;
    if (attack.total > defense.total) {
      const d = entropy.roll(
        "Damage",
        x.c.profile.damage,
        attack.total - defense.total >= 10,
        x.c.entityId,
      );
      const r = entropy.roll(
        "Resistance",
        target.profile.resistance,
        false,
        target.entityId,
      );
      rolls.push(d, r);
      damage = Math.max(0, d.total - r.total);
      target.hp = Math.max(0, target.hp - damage);
    }
    for (const { c, r } of reactions) {
      pay(c, c.profile.reactions.find((rule) => rule.id === r.ruleId)!.cost);
      const p = s.plans[c.entityId]!;
      p.armed = p.armed.filter((a) => a.id !== r.id);
      (p.reactionStates ??= {})[r.id] = {
        ...p.reactionStates?.[r.id],
        status: "triggered",
        slot: s.slot,
      };
      log(s, `${c.name} triggers ${r.response.name}.`, [c.entityId]);
    }
    log(
      s,
      `${x.c.name} attacks ${target.name}: ${attack.total > defense.total ? `${damage} damage` : "defended"}.`,
      [x.c.entityId, target.entityId],
      { rolls, outcomes: [{ combatantId: target.entityId, hp: target.hp }] },
    );
    conclude(x);
    return;
  }
  const rule = x.c.profile.rules.find((r) => r.id === a.ruleId)!;
  if (rule.cost) {
    const available = x.c.profile.resources[rule.cost.resource] ?? 0;
    if (available < rule.cost.amount) {
      log(s, `${a.name} is skipped because its resource is exhausted.`, [
        x.c.entityId,
      ]);
      conclude(x);
      return;
    }
    x.c.profile.resources[rule.cost.resource] = available - rule.cost.amount;
  }
  if (rule.completion.kind === "apply-hp")
    target.hp = Math.min(
      target.maxHp,
      Math.max(0, target.hp + rule.completion.amount),
    );
  log(s, `${x.c.name} completes ${a.name}.`, [x.c.entityId, target.entityId], {
    outcomes: [{ combatantId: target.entityId, hp: target.hp }],
  });
  conclude(x);
}
function adjudicate(
  s: State,
  command: Extract<EncounterCommand, { kind: "adjudicate" }>,
  entropy: CombatEntropy,
) {
  const f = s.conflict;
  if (s.phase !== "adjudication" || !f || f.id !== command.conflictId)
    throw new TypeError(
      "This decision no longer belongs to the current conflict.",
    );
  if (!f.choices.includes(command.choice))
    throw new TypeError("Choose one of the current conflict interpretations.");
  const active = current(s).filter(
    (x) => f.activityIds[x.c.entityId] === x.a.id,
  );
  if (command.choice === "custom") {
    if (!command.outcomes?.length || !command.reason?.trim())
      throw new TypeError("A custom outcome needs consequences and a reason.");
    for (const o of command.outcomes) {
      const c = s.simulated.find((c) => c.entityId === o.combatantId);
      if (!c || !f.outcomeIds.includes(c.entityId))
        throw new TypeError("Custom outcomes must belong to this conflict.");
      if (o.hp !== undefined) c.hp = o.hp;
      if (o.position)
        c.position = copyEntityData(o.position) as Mutable<
          NonNullable<CombatantState["position"]>
        >;
      if (o.prone !== undefined) c.prone = o.prone;
      if (o.removed !== undefined) c.removed = o.removed;
      if (o.incapacitation !== undefined) c.incapacitation = o.incapacitation;
    }
    for (const c of s.simulated)
      for (const r of [...(s.plans[c.entityId]?.armed ?? [])])
        if (f.reactionIds?.[c.entityId]?.includes(r.id)) {
          const p = s.plans[c.entityId]!;
          if (
            !pay(
              c,
              c.profile.reactions.find((rule) => rule.id === r.ruleId)!.cost,
            )
          )
            throw new TypeError(
              "Insufficient reaction resource for this outcome.",
            );
          p.armed = p.armed.filter((x) => x.id !== r.id);
          (p.reactionStates ??= {})[r.id] = {
            status: "triggered",
            slot: s.slot,
          };
          log(
            s,
            `${c.name} triggers ${r.response.name} at its declared timing.`,
            [c.entityId],
          );
        }
    for (const x of active) {
      if (x.a.kind === "attack") {
        if (!pay(x.c, x.c.profile.attackCost))
          throw new TypeError("Insufficient attack resource for this outcome.");
      } else if (x.a.kind !== "move" && x.a.kind !== "reaction") {
        const rule = x.c.profile.rules.find(
          (r) => r.id === (x.a as { ruleId: string }).ruleId,
        )!;
        if (rule.cost) {
          if (
            (x.c.profile.resources[rule.cost.resource] ?? 0) < rule.cost.amount
          )
            throw new TypeError(
              "Insufficient activity resource for this outcome.",
            );
          x.c.profile.resources[rule.cost.resource]! -= rule.cost.amount;
        }
      }
      conclude(x);
    }
  } else if (command.choice === "simultaneous") {
    if (f.kind === "collision" && f.actorIds.length === 2) {
      const contestants = f.actorIds.map((id) =>
        s.simulated.find((c) => c.entityId === id)!,
      );
      const [a, b] = contestants as [
        Mutable<CombatantState>,
        Mutable<CombatantState>,
      ];
      const first = entropy.roll("Might", a.profile.might, false, a.entityId),
        second = entropy.roll("Might", b.profile.might, false, b.entityId);
      if (first.total === second.total && !f.defenderId) {
        log(
          s,
          "Collision tied. The GM must identify a defender or author the outcome.",
          f.actorIds,
          { rolls: [first, second] },
        );
        s.conflict = {
          ...f,
          description:
            "Might rolls tied. Select the defender and consequences explicitly.",
          choices: ["custom"],
        };
        return;
      }
      for (const x of active) apply(s, x, entropy);
      const loser =
        first.total === second.total
          ? a.entityId === f.defenderId
            ? b
            : a
          : first.total < second.total
            ? a
            : b;
      loser.prone = true;
      log(s, "The collision is resolved by contested Might.", f.actorIds, {
        rolls: [first, second],
      });
    } else {
      const attack = active.find((x) => x.a.kind === "attack");
      const move = active.find((x) => x.a.kind === "move");
      if (attack && move) {
        const pairing = attack.c.profile.pairings.find(
          (p) => p.kinds[0] === attack.a.kind && p.kinds[1] === move.a.kind,
        );
        if (!pairing)
          throw new TypeError(
            "This simultaneous pairing needs an authored concurrency rule or a custom outcome.",
          );
        const a = entropy.roll(
            `${pairing.name}: ${pairing.firstLabel}`,
            pairing.first,
            false,
            attack.c.entityId,
          ),
          b = entropy.roll(
            `${pairing.name}: ${pairing.secondLabel}`,
            pairing.second,
            false,
            move.c.entityId,
          );
        log(s, `${pairing.name} resolves concurrency.`, f.actorIds, {
          rolls: [a, b],
        });
        for (const x of a.total > b.total ? [attack, move] : [move, attack])
          apply(s, x, entropy);
        for (const x of active.filter((x) => x !== attack && x !== move))
          apply(s, x, entropy);
      } else
        throw new TypeError(
          "Use an explicit custom outcome for this simultaneous interaction.",
        );
    }
  } else {
    if (active.length !== 2)
      throw new TypeError(
        "Choose a custom outcome for conflicts involving more than two activities.",
      );
    const attack = active.find(
      (x) =>
        x.a.kind === "attack" &&
        x.c.entityId === (command.focalActorId ?? f.focalActorId),
    );
    const other = active.find((x) => x !== attack);
    if (!attack || !other)
      throw new TypeError(
        "Before and after require a focal attack; choose a custom outcome.",
      );
    for (const x of command.choice === "before"
      ? [attack, other]
      : [other, attack]) {
      apply(s, x, entropy);
      discardDead(s);
    }
  }
  log(s, `GM adjudication: ${command.choice}.`, f.actorIds, {
    decision: {
      conflictId: f.id,
      choice: command.choice,
      ...(command.reason ? { reason: command.reason } : {}),
    },
    ...(command.outcomes ? { outcomes: command.outcomes } : {}),
  });
  delete s.conflict;
  discardDead(s);
  finish(s);
}
export function projectEncounter(
  state: EncounterState,
  context: Pick<EncounterCommandContext, "userId" | "isGm">,
): EncounterState | PlayerEncounterProjection {
  if (context.isGm) return copyEntityData(state);
  return {
    name: state.name,
    phase: state.phase,
    paused: state.paused,
    round: state.round,
    revision: state.revision,
    combatants: state.combatants
      .filter(
        (c) => c.visibleToPlayers || c.controllerIds.includes(context.userId),
      )
      .map((c) => ({
        entityId: c.entityId,
        name: c.name,
        hp: c.hp,
        maxHp: c.maxHp,
        ...(c.removed !== undefined ? { removed: c.removed } : {}),
        ...(c.prone !== undefined ? { prone: c.prone } : {}),
        ...(c.incapacitation !== undefined
          ? { incapacitation: c.incapacitation }
          : {}),
        ...(c.position ? { position: c.position } : {}),
        ...(c.controllerIds.includes(context.userId)
          ? {
              plan: {
                ...state.plans[c.entityId]!,
                activities: state.plans[c.entityId]!.activities.map((a) =>
                  a.kind === "reaction"
                    ? { ...a, response: { name: a.response.name } }
                    : a,
                ),
                armed: state.plans[c.entityId]!.armed.map((a) => ({
                  ...a,
                  response: { name: a.response.name },
                })),
              },
              availableReactions: c.profile.reactions.map(({ id, name }) => ({
                id,
                name,
              })),
              availableActivities: c.profile.rules.map(
                ({ id, name, kind, completion }) => ({
                  id,
                  name,
                  kind,
                  ...(completion.kind === "summon" &&
                  completion.sameRoundAttackCost
                    ? { permitsSummonedAttack: true }
                    : {}),
                }),
              ),
            }
          : {}),
      })),
    history: state.history
      .filter(
        (h) =>
          h.visibility === "public" &&
          !h.superseded &&
          h.actorIds.every((id) =>
            state.combatants.some(
              (c) =>
                c.entityId === id &&
                (c.visibleToPlayers ||
                  c.controllerIds.includes(context.userId)),
            ),
          ),
      )
      .map(({ text, round, slot }) => ({ text, round, slot })),
  };
}

function validateCost(
  cost: CombatCost,
  resources: Readonly<Record<string, number>>,
  payment: CombatCost extends never ? never : "on-trigger" | "on-completion",
): void {
  if (
    !cost ||
    (cost.kind !== "free" &&
      (cost.kind !== "resource" ||
        cost.payment !== payment ||
        !Object.hasOwn(resources, cost.resource) ||
        !Number.isSafeInteger(cost.amount) ||
        cost.amount < 1))
  )
    throw new TypeError("An explicit free or resource cost is required.");
}
function canPay(c: CombatantState, cost: CombatCost) {
  return (
    cost.kind === "free" ||
    (c.profile.resources[cost.resource] ?? 0) >= cost.amount
  );
}
function pay(c: Mutable<CombatantState>, cost: CombatCost) {
  if (!canPay(c, cost)) return false;
  if (cost.kind === "resource")
    c.profile.resources[cost.resource]! -= cost.amount;
  return true;
}
