import { isObject, type DomainResource } from "./domain-resource";

type JsonObject = Record<string, unknown>;

export const SCIENCE_DOMAIN_MIGRATION_VERSION =
  "2026-08-23-science-and-technology-v1";

export interface ScienceDomainMigration {
  data: JsonObject;
  changed: boolean;
  exceptions: readonly string[];
}

const DAMAGE_TYPE_RENAMES: Readonly<Record<string, string>> = {
  lightning: "electrical",
  thunder: "concussive",
  psychic: "neurological",
};

const CONDITION_RENAMES: Readonly<Record<string, string>> = {
  charmed: "influenced",
  petrified: "immobilized-transformed",
};

const LEGACY_CREATURE_CLASSIFICATIONS: Readonly<
  Record<
    string,
    { nature: string; morphology?: string; requiresReview?: boolean }
  >
> = {
  beast: { nature: "organism", morphology: "animal" },
  construct: { nature: "machine", morphology: "modular" },
  humanoid: { nature: "organism", morphology: "humanoid" },
  plant: { nature: "organism", morphology: "plant" },
  ooze: { nature: "organism", morphology: "amorphous" },
  giant: { nature: "organism", morphology: "humanoid" },
  dragon: {
    nature: "organism",
    morphology: "animal",
    requiresReview: true,
  },
  aberration: { nature: "unknown", requiresReview: true },
  celestial: { nature: "unknown", requiresReview: true },
  elemental: { nature: "unknown", requiresReview: true },
  fey: { nature: "unknown", requiresReview: true },
  fiend: { nature: "unknown", requiresReview: true },
  monstrosity: { nature: "unknown", requiresReview: true },
  undead: { nature: "unknown", requiresReview: true },
};

const ITEM_CATEGORY_RENAMES: Readonly<Record<string, string>> = {
  "spellcasting-focus": "control-interface",
  potion: "compound",
  scroll: "procedure-record",
  "wondrous-item": "device",
};

const ACCESS_MODE_RENAMES: Readonly<Record<string, string>> = {
  known: "trained",
  prepared: "configured",
  "always-prepared": "standard-configuration",
  spellbook: "manual",
  innate: "integrated",
};

const SCHOOL_DEFAULTS: Readonly<
  Record<string, { functionTag: string; operatingBasis: string }>
> = {
  abjuration: { functionTag: "protection", operatingBasis: "field-effect" },
  conjuration: { functionTag: "deployment", operatingBasis: "unknown" },
  divination: { functionTag: "sensing", operatingBasis: "optical" },
  enchantment: {
    functionTag: "behavioral-influence",
    operatingBasis: "neurological",
  },
  evocation: {
    functionTag: "energy-projection",
    operatingBasis: "field-effect",
  },
  illusion: {
    functionTag: "sensory-manipulation",
    operatingBasis: "optical",
  },
  necromancy: {
    functionTag: "tissue-manipulation",
    operatingBasis: "biological",
  },
  transmutation: {
    functionTag: "material-transformation",
    operatingBasis: "materials",
  },
};

function legacySkillDefinitionId(value: string) {
  const key = value === "arcana" ? "science" : value;
  return `aow:skill-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function migrateInput(value: unknown): unknown {
  if (!isObject(value)) return value;
  if (value.kind === "verbal") return { ...value, kind: "vocal-command" };
  if (value.kind === "somatic") return { ...value, kind: "gesture-control" };
  if (value.kind === "material") {
    const { itemId, ...rest } = value;
    return {
      ...rest,
      kind: value.consumed === true ? "consumable" : "material",
      ...(typeof itemId === "string" ? { itemDefinitionId: itemId } : {}),
    };
  }
  return value;
}

export function migrateScienceDomainData(
  resource: DomainResource,
  source: JsonObject,
): ScienceDomainMigration {
  let changed = false;
  const exceptions = new Set<string>();

  const migrateCreatureClassification = (value: unknown): JsonObject => {
    const label = typeof value === "string" ? value : "Unclassified creature";
    const mapped =
      typeof value === "string"
        ? LEGACY_CREATURE_CLASSIFICATIONS[value]
        : undefined;
    if (!mapped || mapped.requiresReview) {
      exceptions.add(
        `Creature classification “${label}” requires physical taxonomy review.`,
      );
    }
    changed = true;
    return {
      nature: mapped?.nature ?? "unknown",
      ...(mapped?.morphology ? { morphology: mapped.morphology } : {}),
      aliases: [{ label, context: "legacy classification" }],
    };
  };

  const migrateValue = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value))
      return value.map((item) => migrateValue(item, key));
    if (!isObject(value)) {
      if (key === "damageType" && typeof value === "string") {
        const replacement = DAMAGE_TYPE_RENAMES[value];
        if (replacement) {
          changed = true;
          return replacement;
        }
        if (["force", "necrotic", "radiant"].includes(value)) {
          exceptions.add(
            `Damage labeled “${value}” requires a physical injury mechanism.`,
          );
        }
      }
      if (key === "category" && typeof value === "string") {
        const replacement = ITEM_CATEGORY_RENAMES[value];
        if (replacement) {
          changed = true;
          return replacement;
        }
      }
      if (key === "rarity" && value === "artifact") {
        changed = true;
        return "unique";
      }
      if ((key === "event" || key === "type") && value === "spell-cast") {
        changed = true;
        return "discipline-activated";
      }
      if (
        (key === "condition" ||
          key === "conditions" ||
          key === "conditionImmunities") &&
        typeof value === "string" &&
        CONDITION_RENAMES[value]
      ) {
        changed = true;
        return CONDITION_RENAMES[value];
      }
      if (key === "sense" && value === "truesight") {
        changed = true;
        exceptions.add(
          "A truesight sense requires measurable sensing and discrimination mechanisms.",
        );
        return "unresolved-advanced-sensing";
      }
      return value;
    }

    if (key === "spellcasting") return migrateDisciplineState(value);

    const result: JsonObject = {};
    let legacyBypassLabels: readonly unknown[] | undefined;
    for (const [property, child] of Object.entries(value)) {
      if (property === "magical") {
        changed = true;
        if (child === true) {
          exceptions.add(
            "An item or damage effect labeled magical requires an operating basis or physical mechanism.",
          );
        }
        continue;
      }

      if (property === "bypassedBy" && Array.isArray(child)) {
        legacyBypassLabels = child;
        exceptions.add(
          "A damage defense with legacy bypass labels requires a structured bypass predicate.",
        );
        changed = true;
        continue;
      }

      const renamedProperty =
        property === "dispellable"
          ? "neutralizable"
          : property === "concentration"
            ? "sustainedOperation"
            : property === "concentrationOwner"
              ? "sustainingEntityId"
              : property === "concentratingOn"
                ? "sustainingOperations"
                : property === "identified"
                  ? "analyzed"
                  : property === "charges"
                    ? "capacity"
                    : property === "spellcastingProgression"
                      ? "disciplineProgression"
                      : property === "spellSlots"
                        ? "capacityByBand"
                        : property === "spellcasting"
                          ? "disciplines"
                          : property === "skillProficiencies"
                            ? "skillProficiencyIds"
                            : property === "skill"
                              ? "skillDefinitionId"
                              : property === "creatureType"
                                ? "classification"
                                : property === "telepathy"
                                  ? "communicationCapabilities"
                                  : property;
      if (renamedProperty !== property) changed = true;

      if (child === undefined) {
        changed = true;
        continue;
      }

      let migratedChild = child;
      if (property === "creatureType") {
        migratedChild = migrateCreatureClassification(child);
      } else if (property === "telepathy" && typeof child === "number") {
        exceptions.add(
          "A legacy telepathy range requires a measurable communication medium and operating basis.",
        );
        migratedChild = [
          {
            medium: "unknown",
            directionality: "bidirectional",
            range: { value: child, unit: "foot" },
            operatingBasis: "unknown",
            understanding: "unknown",
            description: "Observed direct communication capability.",
          },
        ];
      } else if (
        (property === "skill" || property === "skillProficiencies") &&
        typeof child === "string"
      ) {
        migratedChild = legacySkillDefinitionId(child);
      } else if (property === "skillProficiencies" && Array.isArray(child)) {
        migratedChild = (child as readonly unknown[]).map((skill) =>
          typeof skill === "string" ? legacySkillDefinitionId(skill) : skill,
        );
      }
      const migratedValue = migrateValue(migratedChild, property);
      if (migratedValue !== undefined) result[renamedProperty] = migratedValue;
    }

    if (legacyBypassLabels) {
      const previousExtensions = isObject(result.extensions)
        ? result.extensions
        : {};
      result.extensions = {
        ...previousExtensions,
        "aow:legacy-bypass-labels": legacyBypassLabels,
      };
    }

    if (result.kind === "is-concentrating") {
      result.kind = "is-sustaining-operation";
      changed = true;
    } else if (result.kind === "spell-slot") {
      result.kind = "capacity";
      if ("level" in result) {
        result.band = result.level;
        delete result.level;
      }
      if (result.pact === true) {
        exceptions.add(
          "A pact capacity cost requires a concrete contributing source.",
        );
      }
      delete result.pact;
      changed = true;
    } else if (result.kind === "teleport") {
      result.kind = "transit";
      changed = true;
    } else if (result.kind === "summon") {
      result.kind = "deploy";
      changed = true;
    }

    return result;
  };

  const migrateDisciplineState = (state: JsonObject): JsonObject => {
    changed = true;
    const sources = Array.isArray(state.sources)
      ? (state.sources as readonly unknown[]).map((entry) => {
          if (!isObject(entry)) return entry;
          const mode =
            typeof entry.preparationMode === "string"
              ? entry.preparationMode
              : "configured";
          if (mode === "pact") {
            exceptions.add(
              "A pact discipline source requires a physical provider or connection.",
            );
          }
          return migrateValue({
            ...entry,
            accessMode: ACCESS_MODE_RENAMES[mode] ?? mode,
            targetingBonus: entry.attackBonus,
            resistanceDifficulty: entry.saveDifficultyClass,
            disciplinesLearned: entry.spellsKnown,
            disciplinesConfigured: entry.spellsPrepared,
            procedureLibrary: entry.spellbook,
            controlInterfaceItemId: entry.focusItemId,
            extendedProcedureAccess: entry.ritualCasting,
            bypassesInputs: entry.ignoresComponents,
            preparationMode: undefined,
            attackBonus: undefined,
            saveDifficultyClass: undefined,
            spellsKnown: undefined,
            spellsPrepared: undefined,
            spellbook: undefined,
            focusItemId: undefined,
            ritualCasting: undefined,
            ignoresComponents: undefined,
          });
        })
      : [];
    const capacityBands = Array.isArray(state.slots)
      ? (state.slots as readonly unknown[]).map((entry) => {
          if (!isObject(entry)) return entry;
          return {
            band: entry.level,
            capacity: entry.slots,
            sourceIds: entry.sourceIds,
          };
        })
      : [];
    if (Array.isArray(state.pactSlots) && state.pactSlots.length > 0) {
      exceptions.add(
        "Pact capacity requires review before joining the universal capacity pool.",
      );
      for (const entry of state.pactSlots) {
        if (!isObject(entry)) continue;
        capacityBands.push({
          band: entry.slotLevel,
          capacity: entry.slots,
          sourceIds: typeof entry.sourceId === "string" ? [entry.sourceId] : [],
        });
      }
    }
    return {
      sources,
      capacityBands,
      ...(isObject(state.innateUses)
        ? { integratedUses: migrateValue(state.innateUses) }
        : {}),
      ...(typeof state.currentlyCasting === "string"
        ? { currentlyActivating: state.currentlyCasting }
        : {}),
    };
  };

  const migrateDisciplineDefinition = (definition: JsonObject): JsonObject => {
    const components = isObject(definition.components)
      ? definition.components
      : {};
    const school =
      typeof components.school === "string" ? components.school : "unknown";
    const defaults = SCHOOL_DEFAULTS[school] ?? {
      functionTag: school,
      operatingBasis: "unknown",
    };
    if (!SCHOOL_DEFAULTS[school]) {
      exceptions.add(
        `Legacy school “${school}” requires function and operating-basis review.`,
      );
    }
    const identity = isObject(definition.identity) ? definition.identity : {};
    const description =
      typeof identity.description === "string"
        ? identity.description
        : typeof identity.name === "string"
          ? identity.name
          : "Observed discipline effect";
    changed = true;
    return migrateValue({
      ...definition,
      kind: "discipline",
      components: {
        band: components.level,
        functionTags: [defaults.functionTag],
        operatingBasis: defaults.operatingBasis,
        understanding: "unknown",
        observedPhenomenon: description,
        extendedProcedure: components.ritual,
        activationTime: components.castingTime,
        reactionTrigger: components.reactionTrigger,
        range: components.range,
        targets: components.targets,
        inputs: Array.isArray(components.components)
          ? components.components.map(migrateInput)
          : [],
        duration: components.duration,
        sustainedOperation: components.concentration,
        prerequisites: components.prerequisites,
        outcomes: components.outcomes,
        scaling: Array.isArray(components.scaling)
          ? (components.scaling as readonly unknown[]).map((entry) => {
              if (!isObject(entry)) return entry;
              return {
                ...entry,
                mode:
                  entry.mode === "slot-level" ? "capacity-band" : entry.mode,
                baseBand: entry.baseLevel,
                baseLevel: undefined,
              };
            })
          : undefined,
        trainingProgramIds: components.classLists,
      },
    }) as JsonObject;
  };

  let data =
    resource === "definitions" && source.kind === "spell"
      ? migrateDisciplineDefinition(source)
      : (migrateValue(source) as JsonObject);

  if (
    resource === "creatures" &&
    !Array.isArray(data.communicationCapabilities)
  ) {
    data = { ...data, communicationCapabilities: [] };
    changed = true;
  }

  if (
    resource === "locations" &&
    data.kind === "plane" &&
    !isObject(data.physicalEnvironment)
  ) {
    exceptions.add(
      "A plane location requires physical environment and boundary review.",
    );
    data = {
      ...data,
      physicalEnvironment: {
        kind: "unknown",
        understanding: "unknown",
        observedProperties: [
          typeof data.description === "string" && data.description.trim()
            ? data.description.trim()
            : "A distinct traversable environment is observed.",
        ],
      },
    };
    changed = true;
  }

  if (
    resource === "location-connections" &&
    data.kind === "portal" &&
    !isObject(data.mechanism)
  ) {
    exceptions.add(
      "A portal connection requires infrastructure, activation, and physical mechanism review.",
    );
    data = {
      ...data,
      mechanism: {
        operatingBasis: "unknown",
        understanding: "unknown",
        observedOperation:
          typeof data.notes === "string"
            ? data.notes
            : "Traversal between two recorded locations.",
      },
    };
    changed = true;
  }

  if (exceptions.size > 0) {
    const previousExtensions = isObject(data.extensions) ? data.extensions : {};
    const previousExceptions = Array.isArray(
      previousExtensions["aow:science-refactor-exceptions"],
    )
      ? previousExtensions["aow:science-refactor-exceptions"].filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const combinedExceptions = Array.from(
      new Set([...previousExceptions, ...exceptions]),
    );
    if (
      combinedExceptions.length !== previousExceptions.length ||
      combinedExceptions.some(
        (exception, index) => exception !== previousExceptions[index],
      )
    ) {
      data = {
        ...data,
        extensions: {
          ...previousExtensions,
          "aow:science-refactor-exceptions": combinedExceptions,
        },
      };
      changed = true;
    }
  }

  return { data, changed, exceptions: Array.from(exceptions) };
}
