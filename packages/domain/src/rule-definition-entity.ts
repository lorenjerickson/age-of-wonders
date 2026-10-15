import { Entity, type ValidationIssue } from "./entity";
import type {
  CodexDefinitionCommands,
  CodexDefinitionEvents,
  CodexDefinitionValidationContext,
} from "./codex-definition";

/** Internal shared grammar for authored rule owners; each concrete entity owns its diagnostics. */
export abstract class RuleDefinitionEntity<
  State extends Record<string, unknown>,
  Context extends CodexDefinitionValidationContext,
> extends Entity<
  State,
  CodexDefinitionCommands,
  CodexDefinitionEvents,
  Context
> {
  /** Known character-option structures compose the same rule grammar as Actions and Traits. */
  protected characterOptionIssues(
    value: unknown,
    concept: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const code = `${concept}-components`;
    const object = RuleDefinitionEntity.isObject;
    const schemas: Record<string, Record<string, string>> = {
      profession: {
        expertiseOrder: "key[]",
        expertiseLevels: "tier[]",
        acquisition: "acquisition[]",
        actions: "progression[]",
        "prerequisites?": "predicate[]",
        "choices?": "choice[]",
        "mutuallyExclusiveWith?": "string[]",
      },
      tier: {
        tier: "key",
        rank: "number",
        "advancementPointCost?": "numeric",
        "advancementWindow?": "window",
        "prerequisites?": "predicate[]",
        benefits: "benefits",
      },
      benefits: {
        "modifiers?": "modifier[]",
        "traitIds?": "string[]",
        "resourceMaximums?": "numeric{}",
      },
      progression: {
        actionId: "string",
        unlocksAt: "key",
        advancementPointsOnUse: "numeric",
        "advancementLimit?": "limit",
        "qualifyingUse?": "predicate",
        "improvements?": "improvement[]",
      },
      improvement: {
        atExpertise: "key",
        "modifiers?": "modifier[]",
        "replacementActionId?": "string",
        "description?": "string",
      },
      background: {
        "attributeOptions?": "key[]",
        "skillProficiencyIds?": "string[]",
        "toolProficiencies?": "string[]",
        "languageChoices?": "number",
        "startingEquipment?": "string[]",
        "featId?": "string",
        "featureIds?": "string[]",
        "characteristics?": "string[]{}",
        "choices?": "choice[]",
      },
      feat: {
        "category?": "string",
        "repeatable?": "boolean",
        "prerequisites?": "predicate[]",
        traits: "object[]",
        "choices?": "choice[]",
      },
      heritage: {
        shortDescription: "string",
        modifierPairs: "pair[]",
        "prerequisites?": "predicate[]",
      },
      pair: {
        id: "string",
        "title?": "string",
        "description?": "string",
        beneficial: "heritage-modifier[]",
        harmful: "heritage-modifier[]",
      },
      discipline: {
        band: "number",
        functionTags: "string[]",
        operatingBasis: "string",
        understanding: "string",
        observedPhenomenon: "string",
        "mechanismDescription?": "string",
        "provenance?": "string",
        "extendedProcedure?": "boolean",
        activationTime: "action-cost[]",
        "reactionTrigger?": "string",
        range: "range",
        "targets?": "target[]",
        inputs: "input[]",
        duration: "duration",
        "sustainedOperation?": "boolean",
        "prerequisites?": "predicate[]",
        outcomes: "outcome[]",
        "scaling?": "scaling[]",
        "trainingProgramIds?": "string[]",
        "compatibleSourceIds?": "string[]",
        "relatedSkillIds?": "string[]",
        "safetyNotes?": "string[]",
        "failureModes?": "string[]",
      },
      outcome: { id: "string", "when?": "predicate", effects: "effect[]" },
      scaling: {
        mode: "string",
        "baseBand?": "number",
        "intervals?": "number[]",
        "addDamage?": "dice-expression",
        "addTargets?": "numeric",
        "additionalEffects?": "outcome[]",
      },
    };
    const issue = (v: unknown, path: string) =>
      issues.push({
        code: `${code}-${v === undefined ? "unresolved" : "invalid"}`,
        message:
          v === undefined
            ? "Supply the authored value."
            : "Provide a valid authored value.",
        path,
        ...(v === undefined ? { unresolved: true } : {}),
      });
    const visit = (v: unknown, path: string, shape: string): void => {
      if (v === undefined) {
        issue(v, path);
        return;
      }
      if (shape.endsWith("[]")) {
        if (!Array.isArray(v)) {
          issue(v, path);
          return;
        }
        v.forEach((child, i) =>
          visit(child, `${path}[${i}]`, shape.slice(0, -2)),
        );
        return;
      }
      if (shape.endsWith("{}")) {
        if (!object(v)) {
          issue(v, path);
          return;
        }
        Object.entries(v).forEach(([key, child]) =>
          visit(child, `${path}.${key}`, shape.slice(0, -2)),
        );
        return;
      }
      if (["string", "number", "boolean", "key", "object"].includes(shape)) {
        const valid =
          shape === "object"
            ? object(v)
            : shape === "key"
              ? typeof v === "string" && v.includes(":")
              : shape === "number"
                ? typeof v === "number" && Number.isFinite(v)
                : typeof v === shape;
        if (!valid) issue(v, path);
        return;
      }
      if (shape === "range") {
        if (typeof v === "string") {
          if (!["self", "touch", "sight", "unlimited", "special"].includes(v))
            issue(v, path);
        } else issues.push(...this.ruleValueIssues(v, path, code, "distance"));
        return;
      }
      if (shape === "action-cost") {
        issues.push(...this.costIssues([v], code, path, true));
        return;
      }
      if (shape === "choice") {
        issues.push(...this.choiceIssues([v], concept, path, true));
        return;
      }
      if (shape === "limit") {
        issues.push(...this.usageLimitIssues(v, path, code));
        return;
      }
      if (
        !schemas[shape] &&
        !["acquisition", "window", "heritage-modifier", "input"].includes(shape)
      ) {
        issues.push(...this.ruleValueIssues(v, path, code, shape));
        return;
      }
      if (!object(v)) {
        issue(v, path);
        return;
      }
      const fields = (schema: Record<string, string>) => {
        for (const [field, type] of Object.entries(schema)) {
          const optional = field.endsWith("?");
          const key = optional ? field.slice(0, -1) : field;
          if (!optional || v[key] !== undefined)
            visit(v[key], `${path}.${key}`, type);
        }
      };
      fields(schemas[shape] ?? {});
      if (shape === "profession") {
        for (const field of ["expertiseOrder", "expertiseLevels"] as const) {
          const values = v[field];
          if (!Array.isArray(values)) continue;
          if (values.length === 0) issue(undefined, `${path}.${field}`);
          const seen = new Set<string>();
          values.forEach((entry, index) => {
            const key =
              field === "expertiseOrder"
                ? entry
                : object(entry)
                  ? entry.tier
                  : undefined;
            if (typeof key !== "string") return;
            if (seen.has(key))
              issue(
                key,
                `${path}.${field}[${index}]${field === "expertiseLevels" ? ".tier" : ""}`,
              );
            seen.add(key);
          });
        }
      }
      if (
        ["acquisition", "window", "heritage-modifier", "input"].includes(shape)
      )
        visit(v.kind, `${path}.kind`, "string");
      if (shape === "acquisition") {
        if (v.kind === "character-creation")
          fields({ startingExpertise: "key", "choices?": "choice[]" });
        if (v.kind === "during-play")
          fields({
            startingExpertise: "key",
            "prerequisites?": "predicate[]",
            "trainingDuration?": "duration",
            "trainingActionId?": "string",
          });
      }
      if (shape === "window") {
        const variants: Record<string, Record<string, string>> = {
          "minimum-character-level": { level: "number" },
          "character-levels": { levels: "number[]" },
          "character-level-interval": {
            firstLevel: "number",
            everyLevels: "number",
            "finalLevel?": "number",
          },
          milestone: { milestone: "string" },
          custom: { predicate: "predicate" },
        };
        fields(variants[v.kind as string] ?? {});
      }
      if (shape === "heritage-modifier") {
        const variants: Record<string, Record<string, string>> = {
          "rule-modifier": { modifier: "modifier" },
          "grant-action": { actionId: "string" },
          "grant-trait": { traitId: "string" },
          "grant-skill-proficiency": {
            skillDefinitionId: "string",
            rank: "string",
          },
          "grant-discipline-access": { disciplineDefinitionId: "string" },
          choice: { choice: "choice" },
          custom: { key: "key" },
        };
        fields(variants[v.kind as string] ?? {});
        if (
          v.kind === "grant-skill-proficiency" &&
          v.rank !== undefined &&
          !["half", "proficient", "expertise", "custom"].includes(
            v.rank as string,
          )
        )
          issue(v.rank, `${path}.rank`);
        if (v.kind === "custom" && v.payload === undefined)
          issue(v.payload, `${path}.payload`);
      }
      if (shape === "input") {
        if (
          ["material", "consumable", "device", "custom"].includes(
            v.kind as string,
          )
        )
          fields({ description: "string" });
        if (["material", "consumable", "device"].includes(v.kind as string))
          fields({
            "costInGp?": "number",
            "consumed?": "boolean",
            "itemDefinitionId?": "string",
          });
      }
      if (
        shape === "scaling" &&
        v.mode !== undefined &&
        !["capacity-band", "character-level", "class-level", "custom"].includes(
          v.mode as string,
        )
      )
        issue(v.mode, `${path}.mode`);
    };
    visit(value, "components", concept);
    return issues;
  }

  protected costIssues(
    costs: unknown,
    code = "action-cost",
    basePath = "components.costs",
    singleton = false,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const object = RuleDefinitionEntity.isObject;
    const finite = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value);
    const string = (value: unknown) => typeof value === "string";
    const field = (
      owner: Record<string, unknown>,
      key: string,
      path: string,
      check: (value: unknown) => boolean,
      required = true,
    ) => {
      const value = owner[key];
      if (value === undefined && !required) return;
      if (value === undefined || !check(value))
        issues.push({
          code: value === undefined ? `${code}-unresolved` : `${code}-invalid`,
          message:
            value === undefined
              ? `Supply the cost ${key} value.`
              : `Provide a valid cost ${key} value.`,
          path: `${path}.${key}`,
          ...(value === undefined ? { unresolved: true } : {}),
        });
    };
    if (costs === undefined) return issues;
    if (!Array.isArray(costs))
      return [
        {
          code: `${code}-invalid`,
          message: "Provide a valid Action cost list.",
          path: basePath,
        },
      ];
    costs.forEach((cost, index) => {
      const path = singleton ? basePath : `${basePath}[${index}]`;
      if (!object(cost) || !string(cost.kind)) {
        issues.push({
          code: `${code}-invalid`,
          message: "Provide a valid Action cost.",
          path,
        });
        return;
      }
      switch (cost.kind) {
        case "economy":
          field(
            cost,
            "activation",
            path,
            (value) =>
              typeof value === "string" &&
              [
                "action",
                "bonus-action",
                "reaction",
                "free-action",
                "movement",
                "legendary-action",
                "lair-action",
                "mythic-action",
                "special",
                "passive",
              ].includes(value),
          );
          field(cost, "count", path, finite, false);
          break;
        case "resource":
          field(cost, "cost", path, object);
          if (object(cost.cost)) {
            field(cost.cost, "resource", `${path}.cost`, string);
            issues.push(
              ...this.ruleValueIssues(
                cost.cost.amount,
                `${path}.cost.amount`,
                code,
                "numeric",
              ),
            );
            field(cost.cost, "minimumRemaining", `${path}.cost`, finite, false);
          }
          break;
        case "capacity":
          field(
            cost,
            "band",
            path,
            (value) => finite(value) || value === "chosen",
          );
          field(cost, "sourceId", path, string, false);
          break;
        case "item-use":
          field(cost, "item", path, string);
          field(cost, "amount", path, finite, false);
          break;
        case "hit-die":
          field(cost, "amount", path, finite);
          break;
        case "movement":
          field(cost, "distance", path, object);
          if (object(cost.distance)) {
            field(cost.distance, "value", `${path}.distance`, finite);
            field(cost.distance, "unit", `${path}.distance`, (value) =>
              ["foot", "mile", "square", "hex", "meter", "kilometer"].includes(
                value as string,
              ),
            );
          }
          break;
        // Custom and imported cost kinds remain opaque and round-trip unchanged.
      }
    });
    return issues;
  }

  protected static readonly triggerEvents = [
    "before-d20-test",
    "after-d20-test",
    "before-attack",
    "after-attack",
    "hit",
    "miss",
    "critical-hit",
    "before-damage",
    "after-damage",
    "damage-taken",
    "healed",
    "reduced-to-zero-hp",
    "death",
    "turn-start",
    "turn-end",
    "round-start",
    "round-end",
    "move",
    "enter-area",
    "leave-area",
    "condition-applied",
    "condition-removed",
    "discipline-activated",
    "rest-start",
    "rest-complete",
    "resource-spent",
    "profession-action-used",
    "profession-advanced",
    "custom",
  ];

  /** Shared UsageLimit syntax; the concrete owner supplies its diagnostic prefix and path. */
  protected usageLimitIssues(
    limit: unknown,
    limitPath: string,
    codePrefix: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (limit === undefined) return issues;
    const string = (value: unknown) => typeof value === "string";
    const field = (
      value: unknown,
      path: string,
      check: (value: unknown) => boolean,
      required = true,
    ) => {
      if (value === undefined && !required) return;
      if (value === undefined || !check(value))
        issues.push({
          code: `${codePrefix}-${value === undefined ? "unresolved" : "invalid"}`,
          message:
            value === undefined
              ? "Supply the usage limit value."
              : "Provide a valid usage limit value.",
          path,
          ...(value === undefined ? { unresolved: true } : {}),
        });
    };
    field(limit, limitPath, RuleDefinitionEntity.isObject);
    if (RuleDefinitionEntity.isObject(limit)) {
      field(limit.kind, `${limitPath}.kind`, string);
      const finite = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value);
      switch (limit.kind) {
        case "uses": {
          issues.push(
            ...this.ruleValueIssues(
              limit.maximum,
              `${limitPath}.maximum`,
              codePrefix,
              "numeric",
            ),
          );
          field(
            limit.resetsOn,
            `${limitPath}.resetsOn`,
            (value) =>
              string(value) &&
              (RuleDefinitionEntity.triggerEvents.includes(value as string) ||
                value === "short" ||
                value === "long" ||
                (value as string).startsWith("homebrew:")),
            false,
          );
          break;
        }
        case "recharge":
          field(limit.die, `${limitPath}.die`, finite);
          field(limit.succeedsOn, `${limitPath}.succeedsOn`, Array.isArray);
          if (Array.isArray(limit.succeedsOn))
            limit.succeedsOn.forEach((value, index) =>
              field(value, `${limitPath}.succeedsOn[${index}]`, finite),
            );
          break;
        case "resource":
          field(limit.resource, `${limitPath}.resource`, string);
          break;
        // Once-per-* and future imported variants have no edited internals.
      }
    }
    return issues;
  }

  protected effectIssues(
    effects: unknown,
    basePath: string,
    concept: string,
  ): ValidationIssue[] {
    if (!Array.isArray(effects)) return [];
    return effects.flatMap((effect, index) =>
      this.ruleValueIssues(
        effect,
        `${basePath}[${index}]`,
        `${concept.toLowerCase()}-effect`,
        "effect",
      ),
    );
  }

  /** Choice structure belongs to the owning rule entity; selection and predicate evaluation remain deferred. */
  protected choiceIssues(
    choices: unknown,
    concept: string,
    basePath = "components.choices",
    singleton = false,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const object = RuleDefinitionEntity.isObject;
    const string = (value: unknown) => typeof value === "string";
    const field = (
      owner: Record<string, unknown>,
      key: string,
      path: string,
      check: (value: unknown) => boolean,
      required = true,
    ) => {
      const value = owner[key];
      if (value === undefined && !required) return;
      if (value === undefined || !check(value))
        issues.push({
          code:
            value === undefined
              ? `${concept.toLowerCase()}-choice-unresolved`
              : `${concept.toLowerCase()}-choice-invalid`,
          message:
            value === undefined
              ? `Supply the choice ${key} value.`
              : `Provide a valid choice ${key} value.`,
          path: `${path}.${key}`,
          ...(value === undefined ? { unresolved: true } : {}),
        });
    };
    const invalid = (path: string) =>
      issues.push({
        code: `${concept.toLowerCase()}-choice-invalid`,
        message: `Provide a valid ${concept} choice value.`,
        path,
      });
    if (choices === undefined) return issues;
    if (!Array.isArray(choices)) {
      invalid(basePath);
      return issues;
    }
    choices.forEach((choice, index) => {
      const path = singleton ? basePath : `${basePath}[${index}]`;
      if (!object(choice)) {
        invalid(path);
        return;
      }
      field(choice, "id", path, string);
      field(choice, "prompt", path, string);
      for (const key of ["minimum", "maximum"])
        field(
          choice,
          key,
          path,
          (value) => typeof value === "number" && Number.isFinite(value),
        );
      field(choice, "optionCatalog", path, string, false);
      field(
        choice,
        "allowDuplicates",
        path,
        (value) => typeof value === "boolean",
        false,
      );
      field(
        choice,
        "visibility",
        path,
        (value) => ["public", "controller", "gm"].includes(value as string),
        false,
      );
      field(choice, "options", path, Array.isArray, false);
      if (Array.isArray(choice.options))
        choice.options.forEach((option, optionIndex) => {
          const optionPath = `${path}.options[${optionIndex}]`;
          if (!object(option)) {
            invalid(optionPath);
            return;
          }
          field(option, "id", optionPath, string);
          field(option, "label", optionPath, string);
          field(option, "value", optionPath, (value) =>
            RuleDefinitionEntity.isJson(value),
          );
          issues.push(
            ...this.prerequisiteIssues(
              option.prerequisites,
              concept,
              `${optionPath}.prerequisites`,
            ),
          );
        });
    });
    return issues;
  }

  protected scalarExpressionIssues(
    value: unknown,
    path: string,
    code: string,
  ): ValidationIssue[] {
    if (
      !RuleDefinitionEntity.isObject(value) ||
      ![
        "literal",
        "dice",
        "attribute-score",
        "skill-bonus",
        "collection-count",
        "lookup",
        "choice-value",
        "event-value",
      ].includes(value.kind as string)
    )
      return this.ruleValueIssues(value, path, code, "numeric");
    const issues: ValidationIssue[] = [];
    const field = (
      key: string,
      check: (v: unknown) => boolean,
      optional = false,
    ) => {
      if (optional && value[key] === undefined) return;
      if (value[key] === undefined || !check(value[key]))
        issues.push({
          code: `${code}-${value[key] === undefined ? "unresolved" : "invalid"}`,
          message: "Supply a valid expression value.",
          path: `${path}.${key}`,
          ...(value[key] === undefined ? { unresolved: true } : {}),
        });
    };
    const string = (v: unknown) => typeof v === "string";
    switch (value.kind) {
      case "literal":
        field("value", RuleDefinitionEntity.isJson.bind(RuleDefinitionEntity));
        break;
      case "dice":
        issues.push(
          ...this.ruleValueIssues(
            value.expression,
            `${path}.expression`,
            code,
            "dice-expression",
          ),
        );
        break;
      case "attribute-score":
        field("attribute", (v) => string(v) && (v as string).includes(":"));
        field("actor", string, true);
        break;
      case "skill-bonus":
        field("skillDefinitionId", string);
        field("actor", string, true);
        break;
      case "collection-count":
      case "event-value":
        field("path", string);
        break;
      case "choice-value":
        field("choiceId", string);
        break;
      case "lookup":
        field("table", string);
        issues.push(
          ...this.scalarExpressionIssues(value.key, `${path}.key`, code),
        );
        break;
    }
    return issues;
  }

  /** Structural grammar from common types. Unknown imported tags remain opaque. */
  protected ruleValueIssues(
    value: unknown,
    path: string,
    code: string,
    grammar: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const object = RuleDefinitionEntity.isObject;
    const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    const string = (v: unknown) => typeof v === "string";
    const boolean = (v: unknown) => typeof v === "boolean";
    const check = (
      v: unknown,
      p: string,
      predicate: (v: unknown) => boolean,
    ) => {
      if (v === undefined || !predicate(v))
        issues.push({
          code: `${code}-${v === undefined ? "unresolved" : "invalid"}`,
          message:
            v === undefined
              ? "Supply the rule value."
              : "Provide a valid rule value.",
          path: p,
          ...(v === undefined ? { unresolved: true } : {}),
        });
    };
    const visit = (v: unknown, p: string, type: string): void => {
      if (type === "scalar") {
        issues.push(...this.scalarExpressionIssues(v, p, code));
        return;
      }
      if (type === "predicate") {
        issues.push(...this.predicateIssues(v, p, code));
        return;
      }
      if (type === "choice") {
        issues.push(
          ...this.choiceIssues(
            [v],
            `${code.charAt(0).toUpperCase()}${code.split("-")[0].slice(1)}`,
            p,
            true,
          ),
        );
        return;
      }
      check(v, p, object);
      if (!object(v)) return;
      const field = (
        key: string,
        test: (v: unknown) => boolean,
        optional = false,
      ) => {
        if (!optional || v[key] !== undefined)
          check(v[key], `${p}.${key}`, test);
      };
      const fields = (
        keys: string[],
        test: (v: unknown) => boolean,
        optional = false,
      ) => keys.forEach((key) => field(key, test, optional));
      const nested = (key: string, shape: string, optional = false) => {
        if (!optional || v[key] !== undefined)
          visit(v[key], `${p}.${key}`, shape);
      };
      const list = (
        key: string,
        shape: string | ((v: unknown) => boolean),
        optional = false,
      ) => {
        if (optional && v[key] === undefined) return;
        field(key, Array.isArray);
        if (Array.isArray(v[key]))
          v[key].forEach((child, i) =>
            typeof shape === "string"
              ? visit(child, `${p}.${key}[${i}]`, shape)
              : check(child, `${p}.${key}[${i}]`, shape),
          );
      };
      const enumeration = (
        key: string,
        values: readonly unknown[],
        optional = false,
      ) => field(key, (child) => values.includes(child), optional);
      if (
        !["dice-expression", "distance", "modifier", "target", "test"].includes(
          type,
        )
      )
        field("kind", string);
      switch (type) {
        case "numeric": {
          if (
            [
              "literal",
              "dice",
              "attribute-score",
              "skill-bonus",
              "collection-count",
              "lookup",
              "choice-value",
              "event-value",
            ].includes(v.kind as string)
          ) {
            check(v, p, () => false);
            return;
          }
          switch (v.kind) {
            case "constant":
              field("value", number);
              break;
            case "path":
              field("fallback", number, true);
              field("path", string);
              break;
            case "attribute-modifier":
              field(
                "attribute",
                (v) => string(v) && (v as string).includes(":"),
              );
              field("actor", string, true);
              break;
            case "proficiency-bonus":
              field("actor", string, true);
              field("multiplier", number, true);
              break;
            case "level":
              fields(["actor", "professionId"], string, true);
              break;
            case "resource":
              field("resource", string);
              field("actor", string, true);
              break;
            case "arithmetic":
              enumeration("operator", [
                "add",
                "subtract",
                "multiply",
                "divide",
                "floor",
                "ceil",
                "min",
                "max",
              ]);
              list("operands", "numeric");
              break;
            case "conditional":
              field("predicate", string);
              nested("whenTrue", "numeric");
              nested("whenFalse", "numeric");
              break;
          }
          break;
        }
        case "dice-expression":
          list("terms", "roll-term");
          field("label", string, true);
          break;
        case "roll-term":
          if (v.kind !== "dice") {
            visit(v, p, "numeric");
            break;
          }
          if (typeof v.count === "number") field("count", number);
          else nested("count", "numeric");
          field("size", number);
          enumeration("sign", [1, -1], true);
          field("label", string, true);
          list("modifiers", "dice-modifier", true);
          break;
        case "dice-modifier":
          if (
            [
              "keep-highest",
              "keep-lowest",
              "drop-highest",
              "drop-lowest",
            ].includes(v.kind as string)
          )
            field("count", number);
          if (v.kind === "reroll") {
            list("values", number);
            field("once", boolean, true);
          }
          if (v.kind === "explode")
            fields(["threshold", "maximumExtraDice"], number, true);
          if (v.kind === "minimum" || v.kind === "maximum")
            field("value", number);
          break;
        case "distance":
          field("value", number);
          enumeration("unit", [
            "foot",
            "mile",
            "square",
            "hex",
            "meter",
            "kilometer",
          ]);
          break;
        case "duration":
          if (v.kind === "until-event") field("event", string);
          if (v.kind === "permanent") field("neutralizable", boolean, true);
          if (v.kind === "measured") {
            field("amount", number);
            enumeration("unit", [
              "turn",
              "round",
              "minute",
              "hour",
              "day",
              "week",
              "month",
              "year",
            ]);
          }
          if (v.kind === "special") field("description", string);
          break;
        case "test":
          field("kind", string);
          if (
            ![
              "attribute-check",
              "saving-throw",
              "attack-roll",
              "death-saving-throw",
            ].includes(v.kind as string)
          )
            break;
          field(
            "attribute",
            (v) => string(v) && (v as string).includes(":"),
            true,
          );
          fields(["skillDefinitionId", "proficiency"], string, true);
          nested("difficultyClass", "numeric", true);
          nested("opposedBy", "test", true);
          enumeration(
            "rollMode",
            [
              "normal",
              "advantage",
              "disadvantage",
              "super-advantage",
              "super-disadvantage",
            ],
            true,
          );
          enumeration(
            "ties",
            ["initiator-wins", "defender-wins", "reroll", "no-change"],
            true,
          );
          for (const key of ["criticalSuccessRange", "criticalFailureRange"])
            field(
              key,
              (child) =>
                Array.isArray(child) &&
                child.length === 2 &&
                child.every(number),
              true,
            );
          break;
        case "area": {
          const distances: Record<string, string[]> = {
            cone: ["length"],
            cube: ["size"],
            cylinder: ["radius", "height"],
            emanation: ["radius"],
            sphere: ["radius"],
            line: ["length", "width"],
            wall: ["length", "height"],
          };
          for (const key of distances[v.kind as string] ?? [])
            nested(key, "distance");
          if (v.kind === "wall") nested("thickness", "distance", true);
          break;
        }
        case "target":
          field("kind", string);
          if (
            ![
              "self",
              "creature",
              "object",
              "point",
              "area",
              "willing-creature",
            ].includes(v.kind as string)
          )
            break;
          nested("count", "numeric", true);
          if (
            v.range !== undefined &&
            !["touch", "sight", "unlimited", "self"].includes(v.range as string)
          )
            nested("range", "distance");
          nested("area", "area", true);
          list("filters", "predicate", true);
          fields(["requiresSight", "canTargetSelf"], boolean, true);
          enumeration(
            "relationship",
            ["ally", "enemy", "neutral", "any"],
            true,
          );
          break;
        case "modifier":
          fields(["id", "target"], string);
          enumeration("operation", [
            "add",
            "subtract",
            "multiply",
            "divide",
            "set",
            "minimum",
            "maximum",
            "grant-advantage",
            "grant-disadvantage",
            "grant-proficiency",
            "grant-expertise",
            "allow",
            "prohibit",
          ]);
          nested("value", "scalar", true);
          nested("predicate", "predicate", true);
          field("priority", number, true);
          enumeration(
            "stacking",
            ["stack", "highest", "lowest", "replace", "unique-by-source"],
            true,
          );
          field("sourceLabel", string, true);
          break;
        case "effect":
          switch (v.kind) {
            case "damage":
              field("damageType", string);
              field("target", string);
              nested("amount", "dice-expression");
              break;
            case "heal":
              field("target", string);
              nested("amount", "dice-expression");
              field("upToMaximum", boolean, true);
              break;
            case "temporary-hit-points":
              field("target", string);
              nested("amount", "scalar");
              field("replaceOnly", boolean, true);
              break;
            case "change-resource":
              fields(["target", "resource"], string);
              nested("delta", "scalar");
              field("allowOverflow", boolean, true);
              break;
            case "set-value":
              fields(["target", "path"], string);
              nested("value", "scalar");
              break;
            case "apply-condition":
              fields(["target", "condition"], string);
              nested("duration", "duration", true);
              nested("saveEnds", "test", true);
              break;
            case "remove-condition":
              fields(["target", "condition"], string);
              break;
            case "apply-modifier":
              field("target", string);
              nested("modifier", "modifier");
              nested("duration", "duration", true);
              break;
            case "remove-effect":
              field("effectId", string);
              break;
            case "move":
              field("target", string);
              nested("distance", "distance");
              field("forced", boolean, true);
              field("direction", string, true);
              break;
            case "transit":
              fields(["target", "destination"], string);
              nested("maximumDistance", "distance", true);
              break;
            case "grant-action":
              fields(["target", "actionId"], string);
              nested("duration", "duration", true);
              break;
            case "award-profession-points":
              fields(["target", "professionId"], string);
              nested("amount", "scalar");
              field("actionId", string, true);
              break;
            case "make-test":
              field("actor", string);
              nested("test", "test");
              field("bindResultAs", string, true);
              break;
            case "repeat-save":
              field("target", string);
              nested("test", "test");
              list("onSuccess", "effect", true);
              break;
            case "choose":
              fields(["chooser", "bindAs"], string);
              nested("choice", "choice");
              break;
            case "branch":
              nested("predicate", "predicate");
              list("whenTrue", "effect");
              list("whenFalse", "effect", true);
              break;
            case "for-each":
              nested("collection", "scalar");
              field("bindAs", string);
              list("effects", "effect");
              break;
            case "deploy":
              field("definitionId", string);
              field("controller", string, true);
              nested("count", "numeric", true);
              nested("duration", "duration", true);
              break;
            case "create-object":
              field("definitionId", string);
              field("position", string, true);
              nested("duration", "duration", true);
              break;
            case "destroy-entity":
              field("target", string);
              break;
            case "emit-event":
              field("event", (v) => string(v) && (v as string).includes(":"));
              field(
                "payload",
                RuleDefinitionEntity.isJson.bind(RuleDefinitionEntity),
                true,
              );
              break;
            case "narrative":
              field("text", string);
              enumeration("visibility", ["public", "controller", "gm"], true);
              break;
          }
          break;
      }
    };
    visit(value, path, grammar);
    return issues;
  }

  /** Recursive prerequisite structure belongs to the owning rule entity; evaluation remains deferred. */
  protected prerequisiteIssues(
    prerequisites: unknown,
    concept: string,
    basePath = "components.prerequisites",
  ): ValidationIssue[] {
    if (prerequisites === undefined) return [];
    if (!Array.isArray(prerequisites))
      return [
        {
          code: `${concept.toLowerCase()}-prerequisite-invalid`,
          message: `Provide a valid ${concept} prerequisite value.`,
          path: basePath,
        },
      ];
    return prerequisites.flatMap((predicate, index) =>
      this.predicateIssues(
        predicate,
        `${basePath}[${index}]`,
        `${concept.toLowerCase()}-prerequisite`,
      ),
    );
  }

  /** Validate a single predicate at its actual owned path, without an artificial list wrapper. */
  protected predicateIssues(
    value: unknown,
    basePath: string,
    code: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const object = RuleDefinitionEntity.isObject;
    const string = (value: unknown) => typeof value === "string";
    const field = (
      owner: Record<string, unknown>,
      key: string,
      path: string,
      check: (value: unknown) => boolean,
      required = true,
    ) => {
      const value = owner[key];
      if (value === undefined && !required) return;
      if (value === undefined || !check(value))
        issues.push({
          code: value === undefined ? `${code}-unresolved` : `${code}-invalid`,
          message:
            value === undefined
              ? `Supply the prerequisite ${key} value.`
              : `Provide a valid prerequisite ${key} value.`,
          path: `${path}.${key}`,
          ...(value === undefined ? { unresolved: true } : {}),
        });
    };
    const invalid = (path: string) =>
      issues.push({
        code: `${code}-invalid`,
        message: "Provide a valid predicate value.",
        path,
      });
    const scalar = (
      owner: Record<string, unknown>,
      key: string,
      path: string,
    ) => {
      issues.push(
        ...this.scalarExpressionIssues(owner[key], `${path}.${key}`, code),
      );
    };
    const visit = (predicate: unknown, path: string): void => {
      if (!object(predicate) || !string(predicate.kind)) {
        invalid(path);
        return;
      }
      const strings = (...keys: string[]) =>
        keys.forEach((key) => field(predicate, key, path, string));
      switch (predicate.kind) {
        case "compare":
          field(predicate, "operator", path, (value) =>
            [
              "eq",
              "ne",
              "lt",
              "lte",
              "gt",
              "gte",
              "includes",
              "matches",
            ].includes(value as string),
          );
          scalar(predicate, "left", path);
          scalar(predicate, "right", path);
          break;
        case "all":
        case "any":
          field(predicate, "predicates", path, Array.isArray);
          if (Array.isArray(predicate.predicates))
            predicate.predicates.forEach((child, index) =>
              visit(child, `${path}.predicates[${index}]`),
            );
          break;
        case "not":
          field(predicate, "predicate", path, object);
          if (object(predicate.predicate))
            visit(predicate.predicate, `${path}.predicate`);
          break;
        case "has-definition":
          strings("subject", "definitionId");
          break;
        case "has-condition":
          strings("subject", "condition");
          break;
        case "has-tag":
          strings("subject", "tag");
          break;
        case "is-proficient":
          strings("subject", "proficiency");
          break;
        case "is-attuned":
          strings("subject");
          field(predicate, "item", path, string, false);
          break;
        case "is-sustaining-operation":
          strings("subject");
          break;
        case "damage-type":
          strings("damage", "damageType");
          break;
        case "within-distance":
          strings("source", "target");
          field(predicate, "distance", path, object);
          if (object(predicate.distance)) {
            field(
              predicate.distance,
              "value",
              `${path}.distance`,
              (value) => typeof value === "number" && Number.isFinite(value),
            );
            field(predicate.distance, "unit", `${path}.distance`, (value) =>
              ["foot", "mile", "square", "hex", "meter", "kilometer"].includes(
                value as string,
              ),
            );
          }
          break;
        case "visible":
          strings("observer", "target");
          break;
        case "has-cover":
          strings("observer", "target", "cover");
          break;
        case "relation":
          strings("source", "target", "relation");
          break;
        // Always/never have no fields. Custom and imported predicates remain opaque.
      }
    };
    // Payload decoding already enforces bounded, acyclic JSON before validation.
    visit(value, basePath);
    return issues;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
