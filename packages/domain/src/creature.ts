import { ActiveEffect, type EffectProgress } from "./active-effect";
import type { ActiveEffect as CapturedEffect } from "@aow/common";
import { resolveCreatureInstanceEmbodimentPolicy } from "@aow/common";
import {
  Entity,
  copyEntityData,
  type EntityOptions,
  type DeepReadonly,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";

export type CreatureRuntimeState = Record<string, unknown>;
export interface CreatureRuntimeContext {
  mode?: "runtime";
  campaignInstanceId?: string;
}
export interface CreatureCommands {
  publishCombat: {
    params: {
      hp: number;
      maxHp: number;
      prone: boolean;
      removed: boolean;
      incapacitation?: "unconscious" | "dead" | null;
      position?: unknown;
      updatedAt: string;
    };
    context: object;
  };
  applyEffect: {
    params: { effect: CapturedEffect; updatedAt: string };
    context: object;
  };
  removeEffect: {
    params: { effectId: string; updatedAt: string };
    context: object;
  };
  advanceEffects: {
    params: EffectProgress & { updatedAt: string };
    context: object;
  };
  place: {
    params: { locationId: string; position: unknown; updatedAt: string };
    context: object;
  };
  applyRuleFields: {
    params: {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      updatedAt: string;
    };
    context: object;
  };
}
export interface CreatureEvents {
  changed: { actorId: string };
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Mutable captured actor overlay. Unknown/private data survives every operation. */
export class Creature extends Entity<
  CreatureRuntimeState,
  CreatureCommands,
  CreatureEvents,
  CreatureRuntimeContext
> {
  protected constructor(
    data: CreatureRuntimeState,
    context: CreatureRuntimeContext = {},
    options?: EntityOptions,
    type = "creature",
  ) {
    super(type, data, ["changed"], { ...context, mode: "runtime" }, options);
    this.validate({ ...context, mode: "runtime" });
  }
  static deserializePayload(
    value: unknown,
    context: CreatureRuntimeContext = {},
    options?: EntityOptions,
  ): Creature {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Actor state must be an object.");
    return new Creature(
      copyEntityData(value as CreatureRuntimeState),
      context,
      options,
    );
  }
  static deserialize(
    value: unknown,
    context: CreatureRuntimeContext = {},
    options?: EntityOptions,
  ): Creature {
    const envelope = object(value);
    if (envelope.type !== "creature" || envelope.schemaVersion !== 1)
      throw new TypeError("Unsupported Creature envelope.");
    return this.deserializePayload(envelope.data, context, options);
  }
  static fromCaptured(input: {
    id: string;
    entityId: string;
    name: string;
    definitionId: string;
    updatedAt: string;
  }): CreatureRuntimeState {
    return {
      identity: {
        id: input.id,
        version: { revision: 1, updatedAt: input.updatedAt },
      },
      entityId: input.entityId,
      name: input.name.trim() || "Unnamed Creature",
      definitionId: input.definitionId,
    };
  }
  static embodimentPolicy(value: unknown) {
    return resolveCreatureInstanceEmbodimentPolicy(value);
  }
  static existingEmbodiment(
    policy: unknown,
    sourceId: string,
    embodiments: readonly Record<string, unknown>[],
  ): Record<string, unknown> | undefined {
    const resolved = this.embodimentPolicy(policy);
    if (
      !resolved ||
      !["one-per-instance", "one-per-realization"].includes(
        resolved.policy.strategy,
      )
    )
      throw new TypeError(
        "This Creature's embodiment policy cannot be resolved for the Campaign Instance.",
      );
    const matching = embodiments.filter(
      (entry) => object(entry.source).sourceCreatureId === sourceId,
    );
    if (resolved.policy.strategy === "one-per-instance") return matching[0];
    if (
      resolved.policy.maximumPerCampaignInstance !== undefined &&
      matching.length >= resolved.policy.maximumPerCampaignInstance
    )
      throw new TypeError(
        "This Creature has reached its maximum number of embodiments in the Campaign Instance.",
      );
    return undefined;
  }
  static ruleFields(data: CreatureRuntimeState): CreatureRuntimeState {
    const base = { ...data };
    if (data.activeEffects !== undefined)
      base.conditions = this.effectiveConditions(data);
    delete base.terrainPosition;
    delete base.currentLocationId;
    const extensions = { ...object(data.extensions) };
    delete extensions["aow:rules"];
    if (data.extensions !== undefined) base.extensions = extensions;
    return {
      ...base,
      ...object(object(data.extensions)["aow:rules"]),
      ...(data.terrainPosition === undefined
        ? {}
        : { position: data.terrainPosition }),
      ...(data.currentLocationId === undefined
        ? {}
        : { locationId: data.currentLocationId }),
    };
  }
  static movementResources(data: CreatureRuntimeState): {
    movementRemaining?: number;
    recordedMoves?: number;
  } {
    const resources = object(object(data.extensions)["aow:rules"]);
    const remaining = resources["aow:movementRemaining"],
      moves = resources["aow:moves"];
    return {
      ...(typeof remaining === "number" && Number.isFinite(remaining)
        ? { movementRemaining: remaining }
        : {}),
      ...(typeof moves === "number" && Number.isFinite(moves)
        ? { recordedMoves: moves }
        : {}),
    };
  }
  static place(
    data: CreatureRuntimeState,
    params: CreatureCommands["place"]["params"],
  ): CreatureRuntimeState {
    const next = copyEntityData(data);
    if (params.position === null) delete next.terrainPosition;
    else {
      next.currentLocationId = params.locationId;
      next.terrainPosition = copyEntityData(params.position);
    }
    return this.revised(next, params.updatedAt);
  }
  static publishCombat(
    data: CreatureRuntimeState,
    params: CreatureCommands["publishCombat"]["params"],
  ): CreatureRuntimeState {
    if (
      !Number.isFinite(params.hp) ||
      !Number.isFinite(params.maxHp) ||
      params.maxHp <= 0 ||
      params.hp < 0 ||
      params.hp > params.maxHp ||
      (params.incapacitation != null &&
        !["unconscious", "dead"].includes(params.incapacitation))
    )
      throw new TypeError(
        "Combat health must be between zero and the configured maximum.",
      );
    const next = copyEntityData(data);
    next.combat = {
      ...object(next.combat),
      hp: params.hp,
      maxHp: params.maxHp,
      prone: params.prone,
      removed: params.removed,
      incapacitation: params.incapacitation ?? null,
    };
    if (params.position !== undefined)
      next.terrainPosition = copyEntityData(params.position);
    return this.revised(next, params.updatedAt);
  }
  static applyRuleFields(
    data: CreatureRuntimeState,
    params: CreatureCommands["applyRuleFields"]["params"],
  ): CreatureRuntimeState {
    const next = copyEntityData(data);
    let changed = false;
    for (const [field, value] of Object.entries(params.after)) {
      if (JSON.stringify(value) === JSON.stringify(params.before[field]))
        continue;
      changed = true;
      if (field === "position") next.terrainPosition = copyEntityData(value);
      else if (
        field === "aow:movementRemaining" ||
        field === "aow:moves" ||
        field === "aow:bonusActions"
      )
        next.extensions = {
          ...object(next.extensions),
          "aow:rules": {
            ...object(object(next.extensions)["aow:rules"]),
            [field]: value,
          },
        };
      else throw new TypeError("A rule wrote an unsupported runtime field.");
    }
    return changed ? this.revised(next, params.updatedAt) : next;
  }
  static effectTransition(
    data: CreatureRuntimeState,
    name: "applyEffect" | "removeEffect" | "advanceEffects",
    params: Record<string, unknown>,
  ): CreatureRuntimeState {
    if (data.activeEffects !== undefined && !Array.isArray(data.activeEffects))
      throw new TypeError("Actor active effects must be a list.");
    const effects = (data.activeEffects ?? []) as CapturedEffect[];
    let next: CapturedEffect[];
    if (name === "applyEffect") {
      const effect = ActiveEffect.capture(params.effect);
      if (effects.some((current) => current.id === effect.id))
        return copyEntityData(data);
      next = [...effects, effect];
    } else if (name === "removeEffect")
      next = effects.filter((effect) => effect.id !== params.effectId);
    else
      next = effects.flatMap((effect) => {
        const advanced = ActiveEffect.advance(effect, params as EffectProgress);
        return advanced ? [advanced] : [];
      });
    if (JSON.stringify(next) === JSON.stringify(effects))
      return copyEntityData(data);
    return this.revised(
      { ...copyEntityData(data), activeEffects: next },
      String(params.updatedAt),
    );
  }
  static effectiveConditions(data: CreatureRuntimeState): string[] {
    if (data.activeEffects !== undefined && !Array.isArray(data.activeEffects))
      throw new TypeError("Actor active effects must be a list.");
    return ActiveEffect.conditions(
      (data.activeEffects ?? []) as CapturedEffect[],
      Array.isArray(data.conditions) ? (data.conditions as string[]) : [],
    );
  }
  private static revised(
    data: CreatureRuntimeState,
    updatedAt: string,
  ): CreatureRuntimeState {
    const identity = object(data.identity),
      version = object(identity.version);
    if (!Number.isSafeInteger(version.revision) || Number(version.revision) < 1)
      throw new TypeError("The actor has no valid runtime revision.");
    return {
      ...data,
      identity: {
        ...identity,
        version: {
          ...version,
          revision: Number(version.revision) + 1,
          updatedAt,
        },
      },
    };
  }
  protected validateState(
    data: DeepReadonly<CreatureRuntimeState>,
  ): readonly ValidationIssue[] {
    const identity = object(data.identity),
      version = object(identity.version);
    return typeof identity.id === "string" &&
      typeof data.entityId === "string" &&
      Number.isSafeInteger(version.revision) &&
      Number(version.revision) >= 1
      ? []
      : [
          {
            code: "actor-identity",
            message: "Actor identity and revision are required.",
            path: "identity",
          },
        ];
  }
  protected handleCommand<K extends keyof CreatureCommands>(
    name: K,
    invocation: CommandInvocation<CreatureCommands[K]>,
  ): EntityTransition<CreatureRuntimeState, CreatureEvents> {
    const data =
      name === "publishCombat"
        ? Creature.publishCombat(
            this.serialize().data,
            invocation.params as CreatureCommands["publishCombat"]["params"],
          )
        : name === "place"
          ? Creature.place(
              this.serialize().data,
              invocation.params as CreatureCommands["place"]["params"],
            )
          : name === "applyRuleFields"
            ? Creature.applyRuleFields(
                this.serialize().data,
                invocation.params as CreatureCommands["applyRuleFields"]["params"],
              )
            : Creature.effectTransition(
                this.serialize().data,
                name,
                invocation.params as unknown as Record<string, unknown>,
              );
    return {
      data,
      events:
        JSON.stringify(data) === JSON.stringify(this.state.data)
          ? []
          : [
              {
                name: "changed",
                context: { actorId: String(object(data.identity).id) },
              },
            ],
    };
  }
}
