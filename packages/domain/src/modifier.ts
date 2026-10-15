import {
  Entity,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationContext,
  type ValidationIssue,
} from "./entity";

/** An authored dice-based grant recipe, not an active GrantedModifier or Effect modifier. */
export type ModifierState = Record<string, unknown>;
export type ModifierValidationContext = ValidationContext;
export type ModifierCommands = {
  rename: { params: { label: string }; context: Record<string, never> };
};
export type ModifierEvents = { renamed: { label: string } };

export class Modifier extends Entity<
  ModifierState,
  ModifierCommands,
  ModifierEvents,
  ModifierValidationContext
> {
  private constructor(
    data: ModifierState,
    context: ModifierValidationContext,
    options?: EntityOptions,
  ) {
    super("modifier", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: ModifierValidationContext = {},
    options?: EntityOptions,
  ): Modifier {
    if (this.object(value) && value.type === "modifier") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Modifier schema version.");
      return this.deserializePayload(value.data, context, options);
    }
    return this.deserializePayload(value, context, options);
  }

  /** Persisted author input is always a raw recipe, never a serialized envelope. */
  static deserializePayload(
    value: unknown,
    context: ModifierValidationContext = {},
    options?: EntityOptions,
  ): Modifier {
    if (!this.object(value) || !this.json(value))
      throw new TypeError("A Modifier requires a bounded JSON object.");
    return new Modifier(value, context, options);
  }

  serializePayload(): ModifierState {
    return this.serialize().data;
  }

  protected validateState(
    data: DeepReadonly<ModifierState>,
  ): readonly ValidationIssue[] {
    return Modifier.recipeValid(data)
      ? []
      : [
          {
            code: "modifier-grant-invalid",
            message:
              "A Modifier grant has an invalid target, stacking mode, or dice recipe.",
          },
        ];
  }

  protected handleCommand<K extends keyof ModifierCommands>(
    name: K,
    invocation: CommandInvocation<ModifierCommands[K]>,
  ): EntityTransition<ModifierState, ModifierEvents> {
    if (name !== "rename") throw new TypeError("Unknown Modifier command.");
    if (!Modifier.text(invocation.params.label))
      throw new TypeError("Provide a valid Modifier label.");
    const label = invocation.params.label.trim();
    const data = this.serializePayload();
    if (data.label === label) return { data };
    return {
      data: { ...data, label },
      events: [{ name: "renamed", context: { label } }],
    };
  }

  static grantListIssue(
    grants: unknown,
    owner: "Skill" | "Background" | "Profession",
  ): string | undefined {
    return this.listIssue(grants, owner, new Set<string>());
  }

  private static listIssue(
    grants: unknown,
    owner: "Skill" | "Background" | "Profession",
    ids: Set<string>,
  ): string | undefined {
    if (!Array.isArray(grants) || grants.length > 128)
      return `${owner} modifier grants must be a bounded list.`;
    for (const grant of grants) {
      let entity: Modifier;
      try {
        entity = this.deserializePayload(grant);
      } catch {
        return `A ${owner} modifier grant has an invalid target, stacking mode, or dice recipe.`;
      }
      try {
        if (entity.state.metadata.validity.status !== "valid")
          return `A ${owner} modifier grant has an invalid target, stacking mode, or dice recipe.`;
        const id = entity.state.data.id as string;
        if (ids.has(id))
          return `${owner} modifier grant names must be unique ${owner === "Skill" ? "within the Skill" : "across expertise tiers"}.`;
        ids.add(id);
      } finally {
        entity.dispose();
      }
    }
    return undefined;
  }

  private static recipeValid(value: DeepReadonly<ModifierState>): boolean {
    if (
      !this.text(value.id) ||
      !this.text(value.label) ||
      value.stacking !== "add"
    )
      return false;
    if (
      !Array.isArray(value.dice) ||
      value.dice.length < 1 ||
      value.dice.length > 32
    )
      return false;
    if (
      !value.dice.every(
        (die: unknown) =>
          this.object(die) &&
          Number.isInteger(die.count) &&
          Number(die.count) >= 1 &&
          Number(die.count) <= 100 &&
          Number.isInteger(die.sides) &&
          Number(die.sides) >= 2 &&
          Number(die.sides) <= 10000,
      )
    )
      return false;
    const target = value.target;
    if (!this.object(target)) return false;
    const check =
      (target.kind === "skill-check" && this.text(target.skillDefinitionId)) ||
      (target.kind === "roll" &&
        ["hit", "defense", "damage"].includes(String(target.roll)));
    if (value.kind === "skill-proficiency")
      return (
        target.kind === "skill-check" && this.text(target.skillDefinitionId)
      );
    if (value.kind === "roll-dice") return check;
    return (
      value.kind === "rolled-flat" &&
      (check ||
        target.kind === "health-maximum" ||
        (target.kind === "speed" &&
          this.text(target.movementMode) &&
          ["foot", "mile", "square", "hex", "meter", "kilometer"].includes(
            String(target.unit),
          )) ||
        (target.kind === "attribute" && this.key(target.attribute)) ||
        (target.kind === "statistic" && this.key(target.key)))
    );
  }

  private static object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static text(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
  private static key(value: unknown): value is string {
    return this.text(value) && /^[^\s:]+:[^\s]+$/.test(value);
  }
  private static json(
    value: unknown,
    depth = 0,
    ancestors = new Set<object>(),
  ): boolean {
    if (depth > 64) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || ancestors.has(value)) return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const valid = Object.values(value).every((child) =>
      this.json(child, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return valid;
  }
}
