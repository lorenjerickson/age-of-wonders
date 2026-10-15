import type { ActiveEffect as EffectState } from "@aow/common";
import {
  Entity,
  copyEntityData,
  type EntityOptions,
  type DeepReadonly,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";
export interface EffectProgress {
  event?: string;
  elapsed?: { amount: number; unit: string };
}
export interface ActiveEffectCommands {
  advance: { params: EffectProgress; context: object };
}
export interface ActiveEffectEvents {
  expired: { effectId: string };
}
export interface ActiveEffectState {
  effect: EffectState;
  expired: boolean;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** A captured mechanical effect. Scheduling and executing its rule payload remain caller responsibilities. */
export class ActiveEffect extends Entity<
  ActiveEffectState,
  ActiveEffectCommands,
  ActiveEffectEvents
> {
  private constructor(data: ActiveEffectState, options?: EntityOptions) {
    super("active-effect", data, ["expired"], { mode: "runtime" }, options);
    this.validate({ mode: "runtime" });
  }
  static capture(value: unknown): EffectState {
    const data = object(value),
      duration = object(data.duration);
    if (
      typeof data.id !== "string" ||
      !data.id ||
      typeof data.name !== "string" ||
      typeof data.appliedAt !== "string"
    )
      throw new TypeError(
        "Active effects require identity, name and application time.",
      );
    if (data.duration !== undefined) {
      const valid =
        duration.kind === "instantaneous" ||
        duration.kind === "permanent" ||
        (duration.kind === "until-event" &&
          typeof duration.event === "string") ||
        (duration.kind === "special" &&
          typeof duration.description === "string") ||
        (duration.kind === "measured" &&
          typeof duration.amount === "number" &&
          Number.isFinite(duration.amount) &&
          duration.amount >= 0 &&
          typeof duration.unit === "string" &&
          [
            "turn",
            "round",
            "minute",
            "hour",
            "day",
            "week",
            "month",
            "year",
          ].includes(duration.unit));
      if (!valid) throw new TypeError("The active effect duration is invalid.");
    }
    if (
      data.remaining !== undefined &&
      (typeof data.remaining !== "number" ||
        !Number.isFinite(data.remaining) ||
        data.remaining < 0)
    )
      throw new TypeError("The active effect remaining duration is invalid.");
    if (
      data.conditions !== undefined &&
      (!Array.isArray(data.conditions) ||
        !data.conditions.every((condition) => typeof condition === "string"))
    )
      throw new TypeError("Active effect conditions must be a list.");
    return copyEntityData(data) as unknown as EffectState;
  }
  static deserializePayload(
    value: unknown,
    options?: EntityOptions,
  ): ActiveEffect {
    return new ActiveEffect(
      { effect: this.capture(value), expired: false },
      options,
    );
  }
  static deserialize(value: unknown, options?: EntityOptions): ActiveEffect {
    const envelope = object(value),
      data = object(envelope.data);
    if (
      envelope.type !== "active-effect" ||
      envelope.schemaVersion !== 1 ||
      typeof data.expired !== "boolean"
    )
      throw new TypeError("Unsupported active effect envelope.");
    return new ActiveEffect(
      { effect: this.capture(data.effect), expired: data.expired },
      options,
    );
  }
  static advance(
    value: EffectState,
    progress: EffectProgress,
  ): EffectState | undefined {
    const effect = this.capture(value),
      duration = effect.duration;
    if (
      progress.elapsed &&
      (!Number.isFinite(progress.elapsed.amount) || progress.elapsed.amount < 0)
    )
      throw new TypeError(
        "Elapsed effect time must be finite and nonnegative.",
      );
    if (
      duration?.kind === "instantaneous" ||
      (duration?.kind === "until-event" && duration.event === progress.event)
    )
      return undefined;
    if (duration?.kind !== "measured") return effect;
    let remaining = effect.remaining ?? duration.amount;
    if (progress.elapsed?.unit === duration.unit)
      remaining = Math.max(0, remaining - progress.elapsed.amount);
    return remaining === 0 ? undefined : { ...effect, remaining };
  }
  static conditions(
    effects: readonly EffectState[],
    intrinsic: readonly string[] = [],
  ): string[] {
    return [
      ...new Set([
        ...intrinsic,
        ...effects.flatMap((effect) => effect.conditions ?? []),
      ]),
    ];
  }
  protected validateState(
    data: DeepReadonly<ActiveEffectState>,
  ): readonly ValidationIssue[] {
    try {
      ActiveEffect.capture(data.effect);
      return [];
    } catch (error) {
      return [
        {
          code: "active-effect",
          message:
            error instanceof Error ? error.message : "Invalid active effect.",
        },
      ];
    }
  }
  protected handleCommand<K extends keyof ActiveEffectCommands>(
    _name: K,
    invocation: CommandInvocation<ActiveEffectCommands[K]>,
  ): EntityTransition<ActiveEffectState, ActiveEffectEvents> {
    const current = this.serialize().data;
    if (current.expired) return { data: current };
    const effect = ActiveEffect.advance(current.effect, invocation.params);
    return effect
      ? { data: { effect, expired: false } }
      : {
          data: { ...current, expired: true },
          events: [
            { name: "expired", context: { effectId: current.effect.id } },
          ],
        };
  }
}
