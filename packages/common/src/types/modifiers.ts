import type { DefinitionId, DistanceUnit, DomainId, EventId, ItemInstanceId, MovementMode, NamespacedKey } from "./primitives";

/** Bounded physical dice; counts and sides are positive integers (sides >= 2). */
export interface ModifierDice {
  readonly count: number;
  readonly sides: number;
}

export type ModifierCheckTarget =
  | { readonly kind: "skill-check"; readonly skillDefinitionId: DefinitionId }
  | { readonly kind: "roll"; readonly roll: "hit" | "defense" | "damage" };

export type ModifierTarget =
  | { readonly kind: "attribute"; readonly attribute: NamespacedKey }
  /** Increases maximum health, not current health or healing. */
  | { readonly kind: "health-maximum" }
  /** Adds distance to an existing movement speed; does not grant a new movement mode. */
  | { readonly kind: "speed"; readonly movementMode: MovementMode; readonly unit: DistanceUnit }
  | ModifierCheckTarget
  | { readonly kind: "statistic"; readonly key: NamespacedKey };

interface ModifierGrantBase {
  /** Stable within the contributing Definition, including across profession tiers. */
  readonly id: string;
  readonly label: string;
  /** Every distinct grant contributes; equal targets are never deduplicated. */
  readonly stacking: "add";
  readonly dice: readonly ModifierDice[];
}

export interface RolledFlatModifier extends ModifierGrantBase {
  readonly kind: "rolled-flat";
  readonly target: ModifierTarget;
}

export interface RollDiceModifier extends ModifierGrantBase {
  readonly kind: "roll-dice";
  readonly target: ModifierCheckTarget;
}

export interface SkillProficiencyModifier extends ModifierGrantBase {
  readonly kind: "skill-proficiency";
  readonly target: Extract<ModifierCheckTarget, { kind: "skill-check" }>;
}

/** Authoring recipe. Flat increases are rolled once; other dice roll on each check. */
export type ModifierGrantDefinition = RolledFlatModifier | RollDiceModifier | SkillProficiencyModifier;

export type ModifierGrantSource =
  | { readonly kind: "skill"; readonly definitionId: DefinitionId }
  | { readonly kind: "profession"; readonly definitionId: DefinitionId; readonly expertise: NamespacedKey }
  | { readonly kind: "equipment"; readonly definitionId: DefinitionId; readonly itemInstanceId: ItemInstanceId }
  | { readonly kind: "other"; readonly definitionId: DefinitionId; readonly instanceId: string };

interface GrantedModifierBase {
  readonly id: DomainId<"modifier-grant">;
  readonly source: ModifierGrantSource;
  /** Retrying the same grant event must reuse the existing instance, never reroll. */
  readonly grantedByEventId: EventId;
  readonly active: boolean;
}

/** Captured recipe + result survives reloads and later edits to its source Definition. */
export type GrantedModifier = GrantedModifierBase & (
  | {
      readonly definition: RolledFlatModifier;
      readonly resolution: {
        readonly kind: "flat";
        /** One array per dice group, one face per die, in recipe order. */
        readonly rolls: readonly (readonly number[])[];
        readonly value: number;
      };
    }
  | {
      readonly definition: RollDiceModifier | SkillProficiencyModifier;
      /** No rolled total is stored: these dice contribute to each applicable check. */
      readonly resolution: { readonly kind: "per-check" };
    }
);

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const key = (v: unknown): v is string => text(v) && /^[^\s:]+:[^\s]+$/.test(v);

export function isModifierGrantDefinition(value: unknown): value is ModifierGrantDefinition {
  if (!object(value) || !text(value.id) || !text(value.label) || value.stacking !== "add") return false;
  if (!Array.isArray(value.dice) || value.dice.length < 1 || value.dice.length > 32) return false;
  if (!value.dice.every((die: unknown) => object(die) && Number.isInteger(die.count) && Number(die.count) >= 1 && Number(die.count) <= 100 && Number.isInteger(die.sides) && Number(die.sides) >= 2 && Number(die.sides) <= 10000)) return false;
  const target = value.target;
  if (!object(target)) return false;
  const check = (target.kind === "skill-check" && text(target.skillDefinitionId)) || (target.kind === "roll" && ["hit", "defense", "damage"].includes(String(target.roll)));
  if (value.kind === "skill-proficiency") return target.kind === "skill-check" && text(target.skillDefinitionId);
  if (value.kind === "roll-dice") return check;
  return value.kind === "rolled-flat" && (check || target.kind === "health-maximum" || (target.kind === "speed" && text(target.movementMode) && ["foot", "mile", "square", "hex", "meter", "kilometer"].includes(String(target.unit))) || (target.kind === "attribute" && key(target.attribute)) || (target.kind === "statistic" && key(target.key)));
}

export function isGrantedModifier(value: unknown): value is GrantedModifier {
  if (!object(value) || !text(value.id) || !text(value.grantedByEventId) || typeof value.active !== "boolean" || !isModifierGrantDefinition(value.definition) || !object(value.resolution)) return false;
  const source = value.source;
  if (!object(source) || !text(source.definitionId)) return false;
  if (source.kind !== "skill" && !(source.kind === "profession" && key(source.expertise)) && !(source.kind === "equipment" && text(source.itemInstanceId)) && !(source.kind === "other" && text(source.instanceId))) return false;
  if (value.definition.kind !== "rolled-flat") return value.resolution.kind === "per-check" && Object.keys(value.resolution).length === 1;
  const { rolls, value: total } = value.resolution;
  if (value.resolution.kind !== "flat" || !Array.isArray(rolls) || rolls.length !== value.definition.dice.length) return false;
  let sum = 0;
  for (let index = 0; index < rolls.length; index++) {
    const faces: unknown = rolls[index];
    const die = value.definition.dice[index];
    if (!Array.isArray(faces) || faces.length !== die.count) return false;
    for (const face of faces as unknown[]) {
      if (typeof face !== "number" || !Number.isInteger(face) || face < 1 || face > die.sides) return false;
      sum += face;
    }
  }
  return total === sum;
}

/** Optional for old drafts; an explicit set is validated across all expertise tiers. */
export function professionModifierGrantIssue(components: unknown): string | undefined {
  if (!object(components) || components.expertiseLevels === undefined) return undefined;
  if (!Array.isArray(components.expertiseLevels)) return "Profession expertise levels must be a list.";
  const ids = new Set<string>();
  for (const level of components.expertiseLevels as unknown[]) {
    if (!object(level) || !object(level.benefits)) return "Each Profession expertise level requires a benefits object.";
    if (level.benefits.modifierGrants === undefined) continue;
    const grants = level.benefits.modifierGrants;
    if (!Array.isArray(grants) || grants.length > 128) return "Profession modifier grants must be a bounded list.";
    for (const grant of grants as unknown[]) {
      if (!isModifierGrantDefinition(grant)) return "A Profession modifier grant has an invalid target, stacking mode, or dice recipe.";
      if (ids.has(grant.id)) return "Profession modifier grant names must be unique across expertise tiers.";
      ids.add(grant.id);
    }
  }
  return undefined;
}

/** Skills share profession grant recipes, without requiring an expertise-tier container. */
export function skillModifierGrantIssue(components: unknown): string | undefined {
  if (!object(components)) return undefined;
  const professions = components.associatedProfessionIds;
  if (professions !== undefined && (!Array.isArray(professions) || professions.length > 128 || !professions.every(text) || new Set(professions).size !== professions.length))
    return "Associated Professions must be a bounded list of distinct references.";
  if (components.modifierGrants === undefined) return undefined;
  const issue = professionModifierGrantIssue({ expertiseLevels: [{ benefits: { modifierGrants: components.modifierGrants } }] });
  return issue?.replaceAll("Profession", "Skill").replace("across expertise tiers", "within the Skill");
}
