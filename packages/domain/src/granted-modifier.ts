import {
  isGrantedModifier,
  isModifierGrantDefinition,
  type GrantedModifier as Grant,
  type ModifierGrantDefinition,
  type ModifierGrantSource,
} from "@aow/common";
import {
  Entity,
  copyEntityData,
  type DeepReadonly,
  type EntityOptions,
  type CommandInvocation,
  type EntityTransition,
  type ValidationIssue,
} from "./entity";
export interface GrantAcquisition {
  id: string;
  eventId: string;
  source: ModifierGrantSource;
  definition: ModifierGrantDefinition;
  rolls?: readonly (readonly number[])[];
}
const same = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  );
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export interface GrantedModifierCommands {
  setActive: { params: { active: boolean }; context: object };
}
export interface GrantedModifierEvents {
  activationChanged: { active: boolean };
}
/** Captures an acquired recipe once. Entropy, identities and transaction boundaries belong to the caller. */
export class GrantedModifier extends Entity<
  Grant,
  GrantedModifierCommands,
  GrantedModifierEvents
> {
  private constructor(data: Grant, options?: EntityOptions) {
    super(
      "granted-modifier",
      data,
      ["activationChanged"],
      { mode: "runtime" },
      options,
    );
    this.validate({ mode: "runtime" });
  }
  static deserialize(value: unknown, options?: EntityOptions): GrantedModifier {
    const envelope = object(value);
    if (envelope.type !== "granted-modifier" || envelope.schemaVersion !== 1)
      throw new TypeError("Unsupported acquired modifier envelope.");
    return this.deserializePayload(envelope.data, options);
  }
  static deserializePayload(
    value: unknown,
    options?: EntityOptions,
  ): GrantedModifier {
    if (!isGrantedModifier(value))
      throw new TypeError("Invalid acquired modifier.");
    return new GrantedModifier(copyEntityData(value), options);
  }
  static reusableCreationGrant(
    existing: unknown,
    source: ModifierGrantSource,
    definition: ModifierGrantDefinition,
  ): Grant | undefined {
    const matches = array(existing).filter(
      (grant): grant is Grant =>
        isGrantedModifier(grant) &&
        same(grant.source, source) &&
        same(grant.definition, definition),
    );
    if (matches.length > 1)
      throw new TypeError(
        "The imported Character has ambiguous acquired benefits.",
      );
    return matches[0] ? copyEntityData(matches[0]) : undefined;
  }
  static acquire(
    input: GrantAcquisition,
    existing: readonly Grant[] = [],
  ): Grant {
    const prior = existing.find(
      (grant) =>
        grant.grantedByEventId === input.eventId &&
        grant.definition.id === input.definition.id &&
        same(grant.source, input.source),
    );
    if (prior) return copyEntityData(prior);
    if (!isModifierGrantDefinition(input.definition))
      throw new TypeError("Invalid modifier recipe.");
    if (existing.some((grant) => grant.id === input.id))
      throw new TypeError("Modifier identity is already in use.");
    const resolution =
      input.definition.kind === "rolled-flat"
        ? {
            kind: "flat",
            rolls: input.rolls ?? [],
            value: (input.rolls ?? [])
              .flat()
              .reduce((sum, value) => sum + value, 0),
          }
        : { kind: "per-check" };
    const grant = {
      id: input.id,
      grantedByEventId: input.eventId,
      active: true,
      source: input.source,
      definition: input.definition,
      resolution,
    };
    if (!isGrantedModifier(grant))
      throw new TypeError(
        "Acquisition requires valid captured dice results and provenance.",
      );
    return copyEntityData(grant);
  }
  /** Select only explicitly acquired creation benefits from the immutable capture. */
  static creationRecipes(
    records: readonly { sourceId: string; payload: unknown }[],
    backgroundId: string,
    professionId: string,
  ): { source: ModifierGrantSource; definition: ModifierGrantDefinition }[] {
    const components = (id: string, kind: string) => {
      const matches = records.filter(
        (record) =>
          record.sourceId === id && object(record.payload).kind === kind,
      );
      if (matches.length > 1)
        throw new TypeError(
          "An acquired definition is ambiguous in the capture.",
        );
      return object(object(matches[0]?.payload).components);
    };
    const result: {
      source: ModifierGrantSource;
      definition: ModifierGrantDefinition;
    }[] = [];
    const collect = (value: unknown, source: ModifierGrantSource) => {
      if (value === undefined) return;
      if (!Array.isArray(value) || !value.every(isModifierGrantDefinition))
        throw new TypeError(
          "An acquired definition contains invalid modifier recipes.",
        );
      if (
        new Set(value.map((definition) => definition.id)).size !== value.length
      )
        throw new TypeError(
          "Acquired modifier recipes must have unique identities within their source.",
        );
      for (const definition of value) result.push({ source, definition });
    };
    const background = components(backgroundId, "background");
    collect(background.modifierGrants, {
      kind: "background",
      definitionId: backgroundId as never,
    });
    for (const skillId of new Set(array(background.skillProficiencyIds))) {
      if (typeof skillId !== "string")
        throw new TypeError("An acquired Skill reference is invalid.");
      collect(components(skillId, "skill").modifierGrants, {
        kind: "skill",
        definitionId: skillId as never,
      });
    }
    const profession = components(professionId, "profession");
    const acquisition = array(profession.acquisition)
      .map(object)
      .filter((rule) => rule.kind === "character-creation");
    if (acquisition.length > 1)
      throw new TypeError(
        "The Profession has ambiguous creation acquisition rules.",
      );
    const expertise = acquisition[0]?.startingExpertise;
    if (typeof expertise === "string") {
      const levels = array(profession.expertiseLevels)
        .map(object)
        .filter((level) => level.tier === expertise);
      if (levels.length > 1)
        throw new TypeError("The acquired Profession tier is ambiguous.");
      collect(object(levels[0]?.benefits).modifierGrants, {
        kind: "profession",
        definitionId: professionId as never,
        expertise: expertise as never,
      });
    }
    return result;
  }
  static remove(grants: readonly Grant[], id: string): Grant[] {
    return copyEntityData(grants.filter((grant) => grant.id !== id)) as Grant[];
  }
  static contributions(
    grants: readonly Grant[],
    target: ModifierGrantDefinition["target"],
  ): { flat: number; perCheck: Grant[] } {
    const active = grants.filter(
      (grant) => grant.active && same(grant.definition.target, target),
    );
    return {
      flat: active.reduce(
        (sum, grant) =>
          sum + (grant.resolution.kind === "flat" ? grant.resolution.value : 0),
        0,
      ),
      perCheck: copyEntityData(
        active.filter((grant) => grant.resolution.kind === "per-check"),
      ),
    };
  }
  protected validateState(
    data: DeepReadonly<Grant>,
  ): readonly ValidationIssue[] {
    return isGrantedModifier(data)
      ? []
      : [{ code: "modifier-grant", message: "Invalid acquired modifier." }];
  }
  protected handleCommand<K extends keyof GrantedModifierCommands>(
    _name: K,
    invocation: CommandInvocation<GrantedModifierCommands[K]>,
  ): EntityTransition<Grant, GrantedModifierEvents> {
    return {
      data: { ...this.serialize().data, active: invocation.params.active },
      events: [
        {
          name: "activationChanged",
          context: { active: invocation.params.active },
        },
      ],
    };
  }
}
