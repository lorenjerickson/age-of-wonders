import { RuleDefinitionEntity } from "./rule-definition-entity";
import { ActionDefinition } from "./action-definition";
import { TraitDefinition } from "./trait-definition";
import { isAttributeScore } from "@aow/common";
import {
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationIssue,
} from "./entity";
import {
  type CodexDefinitionCommands,
  type CodexDefinitionEvents,
  type CodexDefinitionValidationContext,
} from "./codex-definition";

export interface MonsterDefinitionState extends Record<string, unknown> {
  readonly kind: "monster";
}
export type MonsterDefinitionValidationContext =
  CodexDefinitionValidationContext;
export type MonsterDefinitionCommands = CodexDefinitionCommands;
export type MonsterDefinitionEvents = CodexDefinitionEvents;

/** Catalog MonsterComponents owner; distinct from governed World Creature records. */
export class MonsterDefinition extends RuleDefinitionEntity<
  MonsterDefinitionState,
  MonsterDefinitionValidationContext
> {
  private constructor(
    data: MonsterDefinitionState,
    context: MonsterDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("monster-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: MonsterDefinitionValidationContext = {},
    options?: EntityOptions,
  ): MonsterDefinition {
    return this.deserializePayload(
      this.decode(value, "monster-definition"),
      context,
      options,
    );
  }

  static deserializePayload(
    value: unknown,
    context: MonsterDefinitionValidationContext = {},
    options?: EntityOptions,
  ): MonsterDefinition {
    const data = this.decodePayload(value);
    if (data.kind !== "monster")
      throw new TypeError(
        "A Monster Definition requires a JSON object with Monster kind.",
      );
    return new MonsterDefinition(
      data as MonsterDefinitionState,
      context,
      options,
    );
  }

  serializePayload(): MonsterDefinitionState {
    return this.serialize().data as MonsterDefinitionState;
  }

  protected override handleCommand<K extends keyof MonsterDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<MonsterDefinitionCommands[K]>,
  ): EntityTransition<MonsterDefinitionState, MonsterDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Monster Definition command.");
    if (!MonsterDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Monster name.");
    const data = this.serializePayload();
    const identity = MonsterDefinition.isObject(data.identity)
      ? data.identity
      : {};
    const nextName = invocation.params.name.trim();
    if (identity.name === nextName) return { data };
    return {
      data: { ...data, identity: { ...identity, name: nextName } },
      events: [{ name: "renamed", context: { name: nextName } }],
    };
  }

  protected validateState(
    data: DeepReadonly<MonsterDefinitionState>,
    context: MonsterDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const object = MonsterDefinition.isObject;
    const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    const string = (v: unknown) => typeof v === "string";
    const boolean = (v: unknown) => typeof v === "boolean";
    const c = object(data.components) ? data.components : {};
    const check = (
      v: unknown,
      path: string,
      valid: (v: unknown) => boolean,
    ) => {
      if (v === undefined || !valid(v))
        issues.push({
          code: `monster-${v === undefined ? "unresolved" : "invalid"}`,
          message: "Provide a valid Creature catalog value.",
          path,
          ...(v === undefined ? { unresolved: true } : {}),
        });
    };
    const list = (
      v: unknown,
      p: string,
      visit: (v: unknown, p: string) => void,
      required = false,
    ) => {
      if (v === undefined && !required) return;
      check(v, p, Array.isArray);
      if (Array.isArray(v)) v.forEach((v, i) => visit(v, `${p}[${i}]`));
    };
    const field = (
      owner: Record<string, unknown>,
      key: string,
      p: string,
      valid: (v: unknown) => boolean,
      required = false,
    ) => {
      if (required || owner[key] !== undefined)
        check(owner[key], `${p}.${key}`, valid);
    };
    const rule = (v: unknown, p: string, grammar: string) =>
      issues.push(...this.ruleValueIssues(v, p, "monster", grammar));
    const strings = (v: unknown, p: string) =>
      list(v, p, (v, p) => check(v, p, string));
    check(data.components, "components", object);
    for (const key of ["size"]) field(c, key, "components", string, true);
    for (const key of ["alignment"]) field(c, key, "components", string);
    for (const key of [
      "experiencePoints",
      "proficiencyBonus",
      "legendaryActionBudget",
    ])
      field(c, key, "components", number);
    check(
      c.challengeRating,
      "components.challengeRating",
      (v) =>
        number(v) ||
        (string(v) && /^-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?$/.test(v)),
    );
    check(
      c.attributes,
      "components.attributes",
      (v) =>
        object(v) &&
        Object.values(v).every(
          (v) => number(v) && isAttributeScore(v as number),
        ),
    );
    field(
      c,
      "savingThrows",
      "components",
      (v) => object(v) && Object.values(v).every(number),
    );
    rule(c.defenseRating, "components.defenseRating", "dice-expression");
    check(c.hitPoints, "components.hitPoints", object);
    if (object(c.hitPoints)) {
      check(c.hitPoints.average, "components.hitPoints.average", number);
      rule(
        c.hitPoints.formula,
        "components.hitPoints.formula",
        "dice-expression",
      );
    }
    for (const key of [
      "subtypes",
      "conditionImmunities",
      "languages",
      "gear",
      "encounterGroups",
    ])
      strings(c[key], `components.${key}`);
    check(c.classification, "components.classification", object);
    if (object(c.classification)) {
      const v = c.classification,
        p = "components.classification";
      field(v, "nature", p, string, true);
      for (const key of ["morphology", "formalName", "origin"])
        field(v, key, p, string);
      strings(v.composition, `${p}.composition`);
      list(
        v.aliases,
        `${p}.aliases`,
        (v, p) => {
          check(v, p, object);
          if (object(v)) {
            field(v, "label", p, string, true);
            for (const key of ["context", "language", "locationId"])
              field(v, key, p, string);
          }
        },
        true,
      );
    }
    list(c.skills, "components.skills", (v, p) => {
      check(v, p, object);
      if (object(v)) {
        field(v, "skillDefinitionId", p, string, true);
        field(v, "bonus", p, number, true);
      }
    });
    list(
      c.speeds,
      "components.speeds",
      (v, p) => {
        check(v, p, object);
        if (object(v)) {
          field(v, "mode", p, string, true);
          rule(v.distance, `${p}.distance`, "distance");
          field(v, "hover", p, boolean);
          list(v.restrictions, `${p}.restrictions`, (v, p) =>
            rule(v, p, "predicate"),
          );
        }
      },
      true,
    );
    list(c.damageAdjustments, "components.damageAdjustments", (v, p) => {
      check(v, p, object);
      if (object(v)) {
        field(v, "damageType", p, string, true);
        field(
          v,
          "response",
          p,
          (v) =>
            [
              "resistance",
              "immunity",
              "vulnerability",
              "reduction",
              "multiplier",
            ].includes(String(v)),
          true,
        );
        field(v, "multiplier", p, number);
        if (v.amount !== undefined) rule(v.amount, `${p}.amount`, "numeric");
        for (const key of ["predicate", "bypassPredicate"])
          if (v[key] !== undefined) rule(v[key], `${p}.${key}`, "predicate");
      }
    });
    list(c.senses, "components.senses", (v, p) => {
      check(v, p, object);
      if (object(v)) {
        field(v, "sense", p, string, true);
        for (const key of [
          "detail",
          "operatingBasis",
          "understanding",
          "mechanismDescription",
        ])
          field(v, key, p, string);
        if (v.range !== undefined) rule(v.range, `${p}.range`, "distance");
      }
    });
    list(
      c.communicationCapabilities,
      "components.communicationCapabilities",
      (v, p) => {
        check(v, p, object);
        if (object(v)) {
          for (const key of ["medium", "operatingBasis", "understanding"])
            field(v, key, p, string, true);
          field(
            v,
            "directionality",
            p,
            (v) =>
              ["one-way", "bidirectional", "broadcast"].includes(String(v)),
            true,
          );
          field(v, "description", p, string);
          strings(v.requirements, `${p}.requirements`);
          if (v.range !== undefined) rule(v.range, `${p}.range`, "distance");
        }
      },
    );
    for (const key of [
      "traits",
      "regionalEffects",
      "actions",
      "bonusActions",
      "reactions",
      "legendaryActions",
      "mythicActions",
      "lairActions",
    ]) {
      const trait = key === "traits" || key === "regionalEffects";
      list(
        c[key],
        `components.${key}`,
        (v, p) => {
          check(
            v,
            p,
            (x) => object(x) && x.kind === (trait ? "trait" : "action"),
          );
          if (!object(v) || v.kind !== (trait ? "trait" : "action")) return;
          let child;
          try {
            child = (
              trait ? TraitDefinition : ActionDefinition
            ).deserializePayload(v, context);
          } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            check(v, p, () => false);
            return;
          }
          try {
            for (const issue of child.state.metadata.validity.issues)
              issues.push({
                ...issue,
                code: `monster-${issue.code}`,
                path: `${p}.${issue.path ?? "components"}`,
              });
          } finally {
            child.dispose();
          }
        },
        key === "actions",
      );
    }
    if (c.disciplines !== undefined) {
      const v = c.disciplines,
        p = "components.disciplines";
      check(v, p, object);
      if (object(v)) {
        field(v, "currentlyActivating", p, string);
        list(
          v.sources,
          `${p}.sources`,
          (v, p) => {
            check(v, p, object);
            if (!object(v)) return;
            for (const key of [
              "id",
              "sourceDefinitionId",
              "attribute",
              "accessMode",
            ])
              field(v, key, p, string, true);
            for (const key of ["targetingBonus", "resistanceDifficulty"])
              rule(v[key], `${p}.${key}`, "numeric");
            for (const key of [
              "disciplinesLearned",
              "disciplinesConfigured",
              "procedureLibrary",
              "bypassesInputs",
            ])
              strings(v[key], `${p}.${key}`);
            for (const key of ["controlInterfaceItemId", "requiredToolItemId"])
              field(v, key, p, string);
            field(v, "extendedProcedureAccess", p, boolean);
          },
          true,
        );
        if (v.integratedUses !== undefined) {
          check(v.integratedUses, `${p}.integratedUses`, object);
          if (object(v.integratedUses))
            for (const [key, pool] of Object.entries(v.integratedUses)) {
              const pp = `${p}.integratedUses[${JSON.stringify(key)}]`;
              check(pool, pp, object);
              if (object(pool)) {
                for (const key of ["current", "maximum"])
                  field(pool, key, pp, number, true);
                field(pool, "temporary", pp, number);
              }
            }
        }
      }
    }
    return issues;
  }

  protected static decode(
    value: unknown,
    type: string,
  ): Record<string, unknown> {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Monster Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): Record<string, unknown> {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError(
        "A Monster Definition requires a bounded JSON object.",
      );
    return payload;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
  protected static isJson(
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
    if (typeof value !== "object" || value === null || ancestors.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const valid = Object.values(value).every((child) =>
      this.isJson(child, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return valid;
  }
}
