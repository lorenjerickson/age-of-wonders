import { canonicalEquipmentSlotKey } from "@aow/common";
import {
  WORLD_CODEX_RESOURCES,
  type ModelConformance,
  type WorldItemDefinition,
} from "@aow/common";
import {
  type DeepReadonly,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
  type EntityOptions,
} from "./entity";

import { RuleDefinitionEntity } from "./rule-definition-entity";
import { TraitDefinition } from "./trait-definition";
import { ActionDefinition } from "./action-definition";

type JsonObject = Record<string, unknown>;
/** Structurally decoded authoring state; incomplete legacy fields stay unknown until validated. */
export interface ItemDefinitionState extends JsonObject {
  readonly kind: "item";
}
export interface ItemDefinitionValidationContext {
  readonly mode?: "draft" | "publication" | "runtime";
  readonly sourceId?: string;
  readonly baseline?: unknown;
  /** Immutable capture supplied by the authorized application workflow. */
  readonly records?: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  }[];
  readonly definitionIds?: readonly string[];
  /** Effective Model projection loaded and authorized by the application. */
  readonly model?: {
    readonly releaseIds: readonly string[];
    readonly elements: readonly {
      readonly key: string;
      readonly id: string;
      readonly kind: string;
      readonly semanticRole?: string;
      readonly valueMetadata?: unknown;
    }[];
  };
}

export type ItemDefinitionCommands = {
  rename: { params: { name: string }; context: Record<string, never> };
};
export type ItemDefinitionEvents = { renamed: { name: string } };

export class ItemDefinition extends RuleDefinitionEntity<
  ItemDefinitionState,
  ItemDefinitionValidationContext
> {
  private constructor(
    data: ItemDefinitionState,
    context: ItemDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super("item-definition", data, ["renamed"], context, options);
    this.validate(context);
  }

  static imageDimensionsIssue(
    width: number,
    height: number,
  ): string | undefined {
    return width === height
      ? undefined
      : "Item images must have equal width and height.";
  }

  static deserialize(
    value: unknown,
    context: ItemDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ItemDefinition {
    let payload = value;
    if (ItemDefinition.isObject(value) && value.type === "item-definition") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Item Definition schema version.");
      payload = value.data;
    }
    return this.deserializePayload(payload, context, options);
  }

  /** Hydrate raw resource JSON without interpreting its fields as an entity envelope. */
  static deserializePayload(
    payload: unknown,
    context: ItemDefinitionValidationContext = {},
    options?: EntityOptions,
  ): ItemDefinition {
    if (
      !ItemDefinition.isObject(payload) ||
      payload.kind !== "item" ||
      !ItemDefinition.isItemJson(payload)
    )
      throw new TypeError(
        "An Item Definition requires a JSON object with Item kind.",
      );
    return new ItemDefinition(payload as ItemDefinitionState, context, options);
  }

  /** Compatibility adapter: the existing captured resource payload is unchanged. */
  serializePayload(): ItemDefinitionState {
    return this.serialize().data;
  }

  protected handleCommand<K extends keyof ItemDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<ItemDefinitionCommands[K]>,
  ): EntityTransition<ItemDefinitionState, ItemDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Item Definition command.");
    if (!ItemDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Item name.");
    const nextName = invocation.params.name.trim();
    const identity = ItemDefinition.object(this.state.data.identity);
    if (identity.name === nextName) return { data: this.serializePayload() };
    return {
      data: {
        ...this.serializePayload(),
        identity: { ...identity, name: nextName },
      },
      events: [{ name: "renamed", context: { name: nextName } }],
    };
  }

  /** Decode external authoring selections against an authorized Model vocabulary. */
  static decodeAuthoringSelection(
    value: Record<string, unknown>,
    vocabulary: {
      readonly itemFamilies: readonly string[];
      readonly equipmentSlots: readonly string[];
    },
  ): {
    itemFamilyKey: string;
    category: string;
    quality: "ramshackle" | "standard" | "fine" | "exquisite";
    compatibleEquipmentSlotSets: string[][];
  } {
    const required = (
      value: unknown,
      maximum: number,
      label: string,
    ): string => {
      if (value === undefined || value === null || value === "")
        throw new TypeError(`omitted ${label}.`);
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > maximum
      )
        throw new TypeError(`contains an invalid ${label}.`);
      return value.trim();
    };
    const itemFamilyKey = required(value.itemFamilyKey, 240, "Item family");
    if (!vocabulary.itemFamilies.includes(itemFamilyKey))
      throw new TypeError("selected an unavailable Item family.");
    const quality = required(value.quality, 20, "quality");
    if (!ItemDefinition.validQuality(quality))
      throw new TypeError("selected an invalid quality.");
    const category = required(value.category, 120, "category");
    const sets = value.compatibleEquipmentSlotSets;
    if (!Array.isArray(sets) || sets.length > 200)
      throw new TypeError("contains invalid Equipment Slot selections.");
    const compatibleEquipmentSlotSets: string[][] = [];
    for (const entry of sets) {
      if (!Array.isArray(entry) || entry.length === 0 || entry.length > 20)
        throw new TypeError("contains invalid Equipment Slot selections.");
      const slots = entry.filter(
        (slot): slot is string => typeof slot === "string",
      );
      if (
        slots.length !== entry.length ||
        slots.some((slot) => !vocabulary.equipmentSlots.includes(slot))
      )
        throw new TypeError("selected an unavailable Equipment Slot.");
      if (new Set(slots).size !== slots.length)
        throw new TypeError("contains duplicate Equipment Slot selections.");
      compatibleEquipmentSlotSets.push(slots);
    }
    return { itemFamilyKey, category, quality, compatibleEquipmentSlotSets };
  }

  private static validQuality(
    value: unknown,
  ): value is "ramshackle" | "standard" | "fine" | "exquisite" {
    return ["ramshackle", "standard", "fine", "exquisite"].includes(
      String(value),
    );
  }

  protected validateState(
    data: DeepReadonly<ItemDefinitionState>,
    context: ItemDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const p = data as JsonObject;
    const c = ItemDefinition.object(p.components);
    const issues: ValidationIssue[] = [];
    const add = (
      code: string,
      message: string,
      path?: string,
      blocking = true,
    ) => issues.push({ code, message, ...(path ? { path } : {}), blocking });
    if (
      !ItemDefinition.validDefinitionIdentity(
        p.identity,
        context.sourceId ?? String(ItemDefinition.object(p.identity).id ?? ""),
      ) ||
      !ItemDefinition.validConformance(p.conformance)
    )
      add(
        "item-canonical-identity",
        "The Item Definition identity or Model conformance is invalid.",
      );
    if (
      !ItemDefinition.namespaced(
        ItemDefinition.object(p.modelValues)["aow:item-family"],
      ) ||
      !ItemDefinition.nonEmpty(c.category) ||
      !ItemDefinition.validQuality(c.quality) ||
      !ItemDefinition.validCompatibleSlotSets(c.equippable) ||
      (p.image !== undefined && !ItemDefinition.validImage(p.image))
    )
      add(
        "item-canonical-components",
        "The Item Definition components, family, or image are invalid.",
      );
    if (context.model)
      issues.push(...ItemDefinition.modelIssues(p, context.model));
    else
      issues.push({
        code: "item-model-unresolved",
        message:
          "Item Model conformance has not been checked against the effective Model Schema.",
        unresolved: true,
      });
    const prior = ItemDefinition.object(context.baseline);
    const baseline =
      context.mode === "draft" &&
      prior.kind === "item" &&
      ItemDefinition.isObject(prior.components)
        ? prior.components
        : undefined;
    const blocking = (field: string) =>
      !baseline ||
      !Object.hasOwn(baseline, field) ||
      ItemDefinition.canonical(c[field] ?? null) !==
        ItemDefinition.canonical(baseline[field] ?? null);
    if (
      c.slottedContainer !== undefined &&
      !ItemDefinition.validStorage(c.slottedContainer)
    )
      add(
        "item-codex-storage-invalid",
        "Author distinct quality and optional rarity capacities using nonnegative whole slot counts.",
        "components.slottedContainer",
        blocking("slottedContainer"),
      );
    if (
      c.beltSlotCategory !== undefined &&
      !ItemDefinition.text(c.beltSlotCategory, 120)
    )
      add(
        "item-codex-belt-category-invalid",
        "Choose a Belt storage category.",
        "components.beltSlotCategory",
        blocking("beltSlotCategory"),
      );
    if (c.rarity !== undefined && !ItemDefinition.text(c.rarity, 120))
      add(
        "item-codex-rarity-invalid",
        "Choose an Item rarity.",
        "components.rarity",
        blocking("rarity"),
      );
    if (
      c.weight !== undefined &&
      (!ItemDefinition.isObject(c.weight) ||
        !ItemDefinition.nonnegative(c.weight.value) ||
        !["pound", "ounce", "kilogram"].includes(String(c.weight.unit)))
    )
      add(
        "item-codex-weight",
        "Choose a nonnegative Item weight.",
        "components.weight",
        blocking("weight"),
      );
    if (
      c.cost !== undefined &&
      (!ItemDefinition.array(c.cost) ||
        c.cost.some(
          (amount) =>
            !ItemDefinition.isObject(amount) ||
            !ItemDefinition.nonnegative(amount.amount) ||
            !ItemDefinition.text(amount.denomination, 80),
        ))
    )
      add(
        "item-codex-cost",
        "Choose valid Item costs.",
        "components.cost",
        blocking("cost"),
      );
    if (
      c.notes !== undefined &&
      (typeof c.notes !== "string" || c.notes.length > 20000)
    )
      add(
        "item-codex-notes",
        "Item notes are too long.",
        "components.notes",
        blocking("notes"),
      );
    issues.push(...this.mechanicsIssues(c));
    // Embedded Traits own their validation; child metadata is never persisted.
    if (c.traits !== undefined && !Array.isArray(c.traits))
      add(
        "item-traits-invalid",
        "Provide a valid Item Trait list.",
        "components.traits",
      );
    if (Array.isArray(c.traits)) {
      for (const [index, value] of c.traits.entries()) {
        const path = `components.traits[${index}]`;
        if (!ItemDefinition.isObject(value) || value.kind !== "trait") {
          add("item-traits-invalid", "Provide a valid Item Trait.", path);
          continue;
        }
        let child: TraitDefinition;
        try {
          child = TraitDefinition.deserializePayload(value, {
            mode: context.mode,
            records: context.records,
          });
        } catch (error) {
          // The child codec can have a tighter JSON bound than the Item codec.
          if (!(error instanceof TypeError)) throw error;
          add("item-traits-invalid", "Provide a valid Item Trait.", path);
          continue;
        }
        try {
          for (const issue of child.state.metadata.validity.issues)
            issues.push({
              ...issue,
              code: `item-traits-${issue.code}`,
              path: `${path}.${issue.path ?? "components"}`,
            });
        } finally {
          child.dispose();
        }
      }
    }
    issues.push(
      ...ItemDefinition.actionIssues(
        c.actions,
        "components.actions",
        "item-actions",
        context,
      ),
    );
    if (c.vehicle !== undefined) {
      if (!ItemDefinition.isObject(c.vehicle))
        add(
          "item-vehicle-actions-invalid",
          "Provide a valid Item Vehicle object for its Actions.",
          "components.vehicle",
        );
      else {
        issues.push(...ItemDefinition.vehicleIssues(c.vehicle, context));
        issues.push(
          ...ItemDefinition.actionIssues(
            c.vehicle.actions,
            "components.vehicle.actions",
            "item-vehicle-actions",
            context,
          ),
        );
      }
    }
    if (!context.records) {
      issues.push({
        code: "item-references-unresolved",
        message:
          "Item references have not been checked against a World capture.",
        unresolved: true,
      });
      return issues;
    }
    const grants = c.grantedConditions;
    if (grants !== undefined) {
      if (!ItemDefinition.array(grants))
        add("item-codex-conditions", "Choose a valid granted Condition list.");
      else {
        const ids = new Set<string>();
        for (const link of grants) {
          if (
            !ItemDefinition.isObject(link) ||
            !ItemDefinition.text(link.conditionId) ||
            ids.has(link.conditionId) ||
            !context.records.find(
              (r) =>
                r.resourceType === WORLD_CODEX_RESOURCES.conditions &&
                r.sourceId === link.conditionId,
            )?.payload
          ) {
            add(
              "item-codex-conditions",
              "A granted Condition is duplicated or unavailable in this World.",
            );
            break;
          }
          ids.add(link.conditionId);
        }
      }
    }
    return issues;
  }

  /** Item-owned rule values use the same grammar as Actions and Traits. */
  private mechanicsIssues(c: JsonObject): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const object = ItemDefinition.isObject;
    const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    const string = (v: unknown) => typeof v === "string";
    const boolean = (v: unknown) => typeof v === "boolean";
    const check = (
      v: unknown,
      path: string,
      valid: (v: unknown) => boolean,
    ) => {
      if (v === undefined || !valid(v))
        issues.push({
          code: `item-mechanics-${v === undefined ? "unresolved" : "invalid"}`,
          message: "Provide a valid Item mechanics value.",
          path,
          ...(v === undefined ? { unresolved: true } : {}),
        });
    };
    const list = (
      v: unknown,
      path: string,
      visit: (v: unknown, path: string) => void,
    ) => {
      if (v === undefined) return;
      check(v, path, Array.isArray);
      if (Array.isArray(v))
        v.forEach((child, i) => visit(child, `${path}[${i}]`));
    };
    const rule = (v: unknown, path: string, grammar: string) =>
      issues.push(...this.ruleValueIssues(v, path, "item-mechanics", grammar));
    list(c.prerequisites, "components.prerequisites", (v, p) =>
      rule(v, p, "predicate"),
    );
    list(c.modifiers, "components.modifiers", (v, p) => rule(v, p, "modifier"));
    if (c.attunement !== undefined) {
      const p = "components.attunement";
      check(c.attunement, p, object);
      if (object(c.attunement)) {
        check(c.attunement.required, `${p}.required`, boolean);
        if (c.attunement.countsAgainstLimit !== undefined)
          check(
            c.attunement.countsAgainstLimit,
            `${p}.countsAgainstLimit`,
            boolean,
          );
        list(c.attunement.prerequisites, `${p}.prerequisites`, (v, p) =>
          rule(v, p, "predicate"),
        );
      }
    }
    if (c.capacity !== undefined) {
      const p = "components.capacity";
      check(c.capacity, p, object);
      if (object(c.capacity)) {
        rule(c.capacity.maximum, `${p}.maximum`, "numeric");
        if (c.capacity.destroyedWhenEmpty !== undefined)
          check(
            c.capacity.destroyedWhenEmpty,
            `${p}.destroyedWhenEmpty`,
            boolean,
          );
        if (c.capacity.recharge !== undefined) {
          const r = c.capacity.recharge;
          check(r, `${p}.recharge`, object);
          if (object(r)) {
            check(r.timing, `${p}.recharge.timing`, (v) =>
              ["dawn", "dusk", "short-rest", "long-rest", "custom"].includes(
                String(v),
              ),
            );
            rule(
              r.amount,
              `${p}.recharge.amount`,
              object(r.amount) && !Object.hasOwn(r.amount, "kind")
                ? "dice-expression"
                : "numeric",
            );
          }
        }
      }
    }
    if (c.crafting !== undefined) {
      const p = "components.crafting",
        recipe = c.crafting;
      check(recipe, p, object);
      if (object(recipe)) {
        rule(recipe.time, `${p}.time`, "numeric");
        list(recipe.cost, `${p}.cost`, (v, p) => {
          check(v, p, object);
          if (object(v)) {
            check(v.amount, `${p}.amount`, number);
            check(v.denomination, `${p}.denomination`, string);
          }
        });
        list(recipe.ingredients, `${p}.ingredients`, (v, p) => {
          check(v, p, object);
          if (object(v)) {
            for (const key of ["itemId", "tag"])
              if (v[key] !== undefined) check(v[key], `${p}.${key}`, string);
            rule(v.quantity, `${p}.quantity`, "scalar");
            check(v.consumed, `${p}.consumed`, boolean);
          }
        });
        list(recipe.toolProficiencies, `${p}.toolProficiencies`, (v, p) =>
          check(v, p, string),
        );
        if (recipe.check !== undefined)
          check(recipe.check, `${p}.check`, string);
        check(recipe.produces, `${p}.produces`, Array.isArray);
        list(recipe.produces, `${p}.produces`, (v, p) => {
          check(v, p, object);
          if (object(v)) {
            check(v.itemId, `${p}.itemId`, string);
            rule(v.quantity, `${p}.quantity`, "numeric");
          }
        });
      }
    }
    return issues;
  }

  /** Vehicle component targets resolve against the authorized World capture. */
  private static vehicleIssues(
    vehicle: JsonObject,
    context: ItemDefinitionValidationContext,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const check = (
      value: unknown,
      path: string,
      valid: (value: unknown) => boolean,
      expected: string,
    ) => {
      if (value === undefined)
        issues.push({
          code: "item-vehicle-unresolved",
          message: `Provide ${expected} for this Vehicle.`,
          path,
          unresolved: true,
        });
      else if (!valid(value))
        issues.push({
          code: "item-vehicle-invalid",
          message: `Provide ${expected} for this Vehicle.`,
          path,
          blocking: true,
        });
    };
    const number = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value);
    const string = (value: unknown) => typeof value === "string";
    for (const field of ["vehicleType", "size"])
      check(vehicle[field], `components.vehicle.${field}`, string, "a string");
    for (const field of ["armorClass", "hitPoints"])
      check(
        vehicle[field],
        `components.vehicle.${field}`,
        number,
        "a finite number",
      );
    for (const field of ["damageThreshold", "crew", "passengers"])
      if (vehicle[field] !== undefined)
        check(
          vehicle[field],
          `components.vehicle.${field}`,
          number,
          "a finite number",
        );
    const quantity = (
      value: unknown,
      path: string,
      units: readonly string[],
    ) => {
      check(value, path, ItemDefinition.isObject, "a quantity object");
      if (!ItemDefinition.isObject(value)) return;
      check(value.value, `${path}.value`, number, "a finite quantity value");
      check(
        value.unit,
        `${path}.unit`,
        (unit) => typeof unit === "string" && units.includes(unit),
        "a supported quantity unit",
      );
    };
    if (vehicle.cargoCapacity !== undefined)
      quantity(vehicle.cargoCapacity, "components.vehicle.cargoCapacity", [
        "pound",
        "ounce",
        "kilogram",
      ]);
    check(
      vehicle.speeds,
      "components.vehicle.speeds",
      ItemDefinition.isObject,
      "a speed map",
    );
    if (ItemDefinition.isObject(vehicle.speeds))
      for (const [mode, distance] of Object.entries(vehicle.speeds))
        quantity(
          distance,
          `components.vehicle.speeds[${JSON.stringify(mode)}]`,
          ["foot", "mile", "square", "hex", "meter", "kilometer"],
        );
    if (vehicle.components !== undefined) {
      check(
        vehicle.components,
        "components.vehicle.components",
        Array.isArray,
        "a component reference list",
      );
      if (Array.isArray(vehicle.components))
        for (const [index, reference] of vehicle.components.entries()) {
          const path = `components.vehicle.components[${index}]`;
          check(reference, path, string, "a component reference string");
          if (typeof reference !== "string") continue;
          const target = context.records?.find(
            (record) =>
              record.resourceType === "definitions" &&
              record.sourceId === reference,
          );
          if (
            !context.records ||
            !target ||
            (context.definitionIds &&
              !context.definitionIds.includes(reference))
          )
            issues.push({
              code: "item-vehicle-component-reference-unresolved",
              message:
                "Choose a Vehicle component available in this World's Definitions.",
              path,
              unresolved: true,
              blocking: context.mode === "publication" && !!context.records,
            });
        }
    }
    return issues;
  }

  /** Both authored Action lists belong to this Item; runtime execution is separate. */
  private static actionIssues(
    actions: unknown,
    path: string,
    prefix: "item-actions" | "item-vehicle-actions",
    context: ItemDefinitionValidationContext,
  ): ValidationIssue[] {
    if (actions === undefined) return [];
    const invalid = (path: string): ValidationIssue => ({
      code: `${prefix}-invalid`,
      message: "Provide a valid Item Action or Action list.",
      path,
      blocking: true,
    });
    if (!Array.isArray(actions)) return [invalid(path)];
    const issues: ValidationIssue[] = [];
    for (const [index, value] of actions.entries()) {
      const childPath = `${path}[${index}]`;
      if (!ItemDefinition.isObject(value) || value.kind !== "action") {
        issues.push(invalid(childPath));
        continue;
      }
      let child: ActionDefinition;
      try {
        child = ActionDefinition.deserializePayload(value, {
          mode: context.mode,
          records: context.records,
        });
      } catch (error) {
        // Preserve deeper legacy JSON that the more restrictive child codec rejects.
        if (!(error instanceof TypeError)) throw error;
        issues.push(invalid(childPath));
        continue;
      }
      try {
        for (const issue of child.state.metadata.validity.issues)
          issues.push({
            ...issue,
            code: `${prefix}-${issue.code}`,
            path: `${childPath}.${issue.path ?? "components"}`,
          });
      } finally {
        child.dispose();
      }
    }
    return issues;
  }

  private static modelIssues(
    p: JsonObject,
    model: NonNullable<ItemDefinitionValidationContext["model"]>,
  ): ValidationIssue[] {
    const issue = (message: string): ValidationIssue[] => [
      { code: "item-model-invalid", message },
    ];
    const conformance = p.conformance;
    if (!ItemDefinition.isObject(conformance))
      return issue(
        "A governed authored resource is missing Model Schema conformance.",
      );
    const selected = conformance.modelSchemaReleaseIds;
    if (
      !Array.isArray(selected) ||
      selected.length !== model.releaseIds.length ||
      selected.some((id, index) => id !== model.releaseIds[index])
    )
      return issue(
        "A governed authored resource does not conform to the draft's exact Model Schema releases.",
      );
    const concepts = model.elements.filter(
      (element) => element.kind === "concept",
    );
    if (
      typeof conformance.conceptId !== "string" ||
      !concepts.some((element) => element.id === conformance.conceptId)
    )
      return issue(
        "A governed authored resource references an unavailable Model concept.",
      );
    if (
      !concepts.some(
        (element) =>
          element.id === conformance.conceptId &&
          element.semanticRole === "aow:item",
      )
    )
      return issue(
        "A governed authored resource uses the wrong Model concept.",
      );
    const components = ItemDefinition.isObject(p.components) ? p.components : p;
    const equippable = ItemDefinition.object(components.equippable);
    const slots = Array.isArray(equippable.compatibleSlotSets)
      ? equippable.compatibleSlotSets.flatMap((group) =>
          Array.isArray(group) ? group : [],
        )
      : Array.isArray(p.compatibleEquipmentSlots)
        ? p.compatibleEquipmentSlots
        : [];
    const byKey = new Map(
      model.elements.map((element) => [element.key, element]),
    );
    if (
      new Set(slots).size !== slots.length ||
      slots.some(
        (key) =>
          typeof key !== "string" ||
          !model.elements.some(
            (element) =>
              element.semanticRole === "aow:equipment-slot" &&
              canonicalEquipmentSlotKey(element.key) ===
                canonicalEquipmentSlotKey(key),
          ),
      )
    )
      return issue(
        "A governed Definition references an unavailable Model option.",
      );
    const family =
      ItemDefinition.object(p.modelValues)["aow:item-family"] ??
      p.itemFamilyKey;
    if (
      typeof family !== "string" ||
      byKey.get(family)?.semanticRole !== "aow:item-family"
    )
      return issue("An Item Definition must select an available Item family.");
    return [];
  }

  private static canonical(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((v) => ItemDefinition.canonical(v)).join(",")}]`;
    if (ItemDefinition.isObject(value))
      return `{${Object.keys(value)
        .sort()
        .map(
          (k) => `${JSON.stringify(k)}:${ItemDefinition.canonical(value[k])}`,
        )
        .join(",")}}`;
    return JSON.stringify(value) ?? "null";
  }
  private static isItemJson(
    value: unknown,
    seen = new Set<object>(),
    depth = 0,
  ): boolean {
    if (depth > 100) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || value === null || seen.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    seen.add(value);
    const valid = Object.values(value).every((v) =>
      ItemDefinition.isItemJson(v, seen, depth + 1),
    );
    seen.delete(value);
    return valid;
  }
  private static text(v: unknown, max = 240): v is string {
    return typeof v === "string" && !!v.trim() && v.length <= max;
  }
  private static nonnegative(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
  }
  private static array(v: unknown): v is unknown[] {
    return Array.isArray(v) && v.length <= 200;
  }
  static validStorage(value: unknown): boolean {
    if (
      !ItemDefinition.isObject(value) ||
      !["belt", "pack", "bag"].includes(String(value.kind)) ||
      value.accepts !==
        (value.kind === "belt" ? "belt-compatible-items" : "any-item") ||
      !Array.isArray(value.capacityByQuality) ||
      !value.capacityByQuality.length ||
      value.capacityByQuality.length > 200
    )
      return false;
    const seen = new Set<string>();
    return value.capacityByQuality.every((row) => {
      if (
        !ItemDefinition.isObject(row) ||
        !ItemDefinition.validQuality(row.quality) ||
        !Number.isSafeInteger(row.slots) ||
        Number(row.slots) < 0 ||
        (row.rarity !== undefined && !ItemDefinition.text(row.rarity, 120))
      )
        return false;
      const key = JSON.stringify([row.quality, row.rarity ?? null]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  static authorPayload(
    id: string,
    input: {
      name: string;
      description?: string;
      traits?: readonly import("@aow/common").TraitDefinition[];
      actions?: readonly import("@aow/common").ActionDefinition[];
      vehicle?: import("@aow/common").VehicleDefinition | null;
      itemFamilyKey: string;
      grantedConditions?: import("@aow/common").WorldGrantedCondition[];
      weight?: import("@aow/common").Weight;
      cost?: import("@aow/common").CurrencyAmount[];
      notes?: string;
      category: string;
      quality: "ramshackle" | "standard" | "fine" | "exquisite";
      compatibleEquipmentSlotSets: string[][];
      slottedContainer?:
        import("@aow/common").SlottedContainerDefinition | null;
      beltSlotCategory?: import("@aow/common").BeltSlotCategory | null;
      rarity?: import("@aow/common").ItemRarity | null;
      image?: Record<string, unknown>;
    },
    conformance: ModelConformance,
    previous?: unknown,
  ): WorldItemDefinition {
    const prior = ItemDefinition.object(previous);
    const preservedComponents = ItemDefinition.withoutKeys(
      ItemDefinition.object(prior.components),
      "equippable",
      ...(input.vehicle === null ? ["vehicle"] : []),
      ...(["slottedContainer", "beltSlotCategory", "rarity"] as const).filter(
        (key) => input[key] === null,
      ),
    );
    const equippableExtensions = ItemDefinition.withoutKeys(
      ItemDefinition.object(ItemDefinition.object(prior.components).equippable),
      "compatibleSlotSets",
    );
    if (
      !input.compatibleEquipmentSlotSets.length &&
      Object.keys(equippableExtensions).length
    )
      throw new TypeError(
        "Keep at least one equipment slot assignment while this Item has additional equipment settings. Those settings have been preserved.",
      );
    const priorExtensions = ItemDefinition.object(prior.extensions);
    const legacyItem =
      Object.keys(prior).length > 0 &&
      !ItemDefinition.isCanonicalItemPayload(prior)
        ? { "aow:legacy-item": prior }
        : {};
    return {
      ...(ItemDefinition.isCanonicalItemPayload(prior) ? prior : {}),
      identity: ItemDefinition.definitionIdentity(
        id,
        input.name,
        input.description,
        prior,
      ),
      kind: "item",
      components: {
        ...preservedComponents,
        ...Object.fromEntries(
          ["grantedConditions", "weight", "cost", "notes", "traits", "actions"]
            .filter((key) => input[key as keyof typeof input] !== undefined)
            .map((key) => [key, input[key as keyof typeof input]]),
        ),
        ...(input.vehicle != null ? { vehicle: input.vehicle } : {}),
        ...Object.fromEntries(
          (["slottedContainer", "beltSlotCategory", "rarity"] as const)
            .filter((key) => input[key] != null)
            .map((key) => [key, input[key]]),
        ),
        category: input.category,
        quality: input.quality,
        ...(input.compatibleEquipmentSlotSets.length
          ? {
              equippable: {
                ...ItemDefinition.object(
                  ItemDefinition.object(prior.components).equippable,
                ),
                compatibleSlotSets: input.compatibleEquipmentSlotSets as never,
              },
            }
          : {}),
      },
      ...((input.image ?? prior.image)
        ? {
            image: (input.image ??
              prior.image) as unknown as WorldItemDefinition["image"],
          }
        : {}),
      conformance,
      modelValues: {
        ...(ItemDefinition.isObject(prior.modelValues)
          ? prior.modelValues
          : {}),
        "aow:item-family": input.itemFamilyKey,
      },
      ...(Object.keys(priorExtensions).length || Object.keys(legacyItem).length
        ? { extensions: { ...priorExtensions, ...legacyItem } as never }
        : {}),
    };
  }

  private static definitionIdentity(
    id: string,
    name: string,
    description: string | undefined,
    prior: JsonObject,
  ) {
    const identity = ItemDefinition.object(prior.identity);
    return {
      ...ItemDefinition.withoutKeys(identity, "description"),
      id: id as never,
      key: (typeof identity.key === "string"
        ? identity.key
        : typeof prior.key === "string"
          ? prior.key
          : `world:${id}`) as never,
      name: name.trim(),
      ...(description?.trim() ? { description: description.trim() } : {}),
      source: ItemDefinition.isObject(identity.source)
        ? (identity.source as never)
        : ItemDefinition.isObject(prior.source)
          ? (prior.source as never)
          : ({ namespace: "world", edition: "1" } as never),
    };
  }
  private static object(value: unknown): JsonObject {
    return ItemDefinition.isObject(value) ? value : {};
  }
  private static withoutKeys(
    value: JsonObject,
    ...keys: readonly string[]
  ): JsonObject {
    const excluded = new Set(keys);
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !excluded.has(key)),
    );
  }
  protected static isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
  private static namespaced(value: unknown): value is string {
    return ItemDefinition.nonEmpty(value) && value.includes(":");
  }
  private static validDefinitionIdentity(
    value: unknown,
    sourceId: string,
  ): boolean {
    return (
      ItemDefinition.isObject(value) &&
      value.id === sourceId &&
      ItemDefinition.namespaced(value.key) &&
      ItemDefinition.nonEmpty(value.name) &&
      ItemDefinition.isObject(value.source)
    );
  }
  private static validConformance(value: unknown): boolean {
    return (
      ItemDefinition.isObject(value) &&
      ItemDefinition.nonEmpty(value.conceptId) &&
      Array.isArray(value.modelSchemaReleaseIds) &&
      value.modelSchemaReleaseIds.length > 0 &&
      value.modelSchemaReleaseIds.every(ItemDefinition.nonEmpty)
    );
  }
  private static validImage(value: unknown): boolean {
    const image = ItemDefinition.object(value);
    return (
      ItemDefinition.nonEmpty(image.assetId) &&
      ItemDefinition.nonEmpty(image.altText) &&
      typeof image.width === "number" &&
      image.width > 0 &&
      typeof image.height === "number" &&
      image.height > 0 &&
      image.width === image.height &&
      typeof image.mimeType === "string" &&
      image.mimeType.startsWith("image/")
    );
  }

  private static validCompatibleSlotSets(value: unknown): boolean {
    if (value === undefined) return true;
    if (
      !ItemDefinition.isObject(value) ||
      !Array.isArray(value.compatibleSlotSets) ||
      !value.compatibleSlotSets.length ||
      value.compatibleSlotSets.length > 200
    )
      return false;
    return value.compatibleSlotSets.every(
      (set) =>
        Array.isArray(set) &&
        set.length > 0 &&
        set.length <= 20 &&
        set.every(ItemDefinition.namespaced),
    );
  }

  private static isCanonicalItemPayload(value: JsonObject): boolean {
    const identity = ItemDefinition.object(value.identity);
    return (
      value.kind === "item" &&
      ItemDefinition.nonEmpty(identity.id) &&
      ItemDefinition.namespaced(identity.key) &&
      ItemDefinition.isObject(value.components)
    );
  }
}
