import { isObject } from "./domain-resource";
import { migrateScienceDomainData } from "./science-domain-migration";

describe("science domain migration", () => {
  it("reframes a spell definition as a discipline", () => {
    const result = migrateScienceDomainData("definitions", {
      identity: {
        id: "legacy:shield",
        name: "Shield",
        description: "A brief protective barrier.",
      },
      kind: "spell",
      components: {
        level: 1,
        school: "abjuration",
        ritual: false,
        castingTime: [{ kind: "reaction" }],
        range: "self",
        components: [{ kind: "verbal" }, { kind: "somatic" }],
        duration: { kind: "rounds", value: 1 },
        concentration: true,
        outcomes: [],
      },
    });

    expect(result.data.kind).toBe("discipline");
    expect(result.data.components).toMatchObject({
      band: 1,
      functionTags: ["protection"],
      operatingBasis: "field-effect",
      understanding: "unknown",
      observedPhenomenon: "A brief protective barrier.",
      inputs: [{ kind: "vocal-command" }, { kind: "gesture-control" }],
      sustainedOperation: true,
    });
    expect(result.exceptions).toEqual([]);
  });

  it("normalizes damage mechanisms and calls out ambiguous ones", () => {
    const result = migrateScienceDomainData("definitions", {
      identity: { id: "legacy:weapon", name: "Storm Projector" },
      kind: "item",
      components: {
        category: "wondrous-item",
        rarity: "artifact",
        magical: true,
        outcomes: [
          { kind: "damage", damageType: "lightning" },
          { kind: "damage", damageType: "thunder" },
          { kind: "damage", damageType: "force" },
        ],
      },
    });

    expect(result.data.components).toMatchObject({
      category: "device",
      rarity: "unique",
      outcomes: [
        { kind: "damage", damageType: "electrical" },
        { kind: "damage", damageType: "concussive" },
        { kind: "damage", damageType: "force" },
      ],
    });
    expect(result.exceptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requires an operating basis"),
        expect.stringContaining("force"),
      ]),
    );
    const extensions = result.data.extensions;
    expect(
      isObject(extensions) &&
        Array.isArray(extensions["aow:science-refactor-exceptions"]),
    ).toBe(true);

    const repeated = migrateScienceDomainData("definitions", result.data);
    expect(repeated.changed).toBe(false);
    expect(repeated.data).toEqual(result.data);
  });

  it("converts legacy skills, capacity, analysis, and operating state", () => {
    const result = migrateScienceDomainData("characters", {
      identity: { id: "character-1" },
      name: "Mara",
      skillProficiencies: ["arcana", "medicine"],
      skills: [{ skill: "technology", proficiency: "trained" }],
      spellSlots: [{ level: 2, current: 1, maximum: 2 }],
      spellcasting: {
        sources: [
          {
            id: "field-training",
            preparationMode: "prepared",
            attackBonus: { kind: "constant", value: 4 },
            saveDifficultyClass: { kind: "constant", value: 12 },
            spellsKnown: ["legacy:shield"],
          },
        ],
        slots: [
          {
            level: 1,
            slots: { current: 1, maximum: 2 },
            sourceIds: ["field-training"],
          },
        ],
      },
      equipment: [{ id: "item-1", identified: true, charges: 3 }],
      recentEvent: { type: "spell-cast" },
    });

    expect(result.data).toMatchObject({
      skillProficiencyIds: ["aow:skill-science", "aow:skill-medicine"],
      skills: [
        {
          skillDefinitionId: "aow:skill-technology",
          proficiency: "trained",
        },
      ],
      capacityByBand: [{ level: 2, current: 1, maximum: 2 }],
      disciplines: {
        sources: [
          {
            id: "field-training",
            accessMode: "configured",
            disciplinesLearned: ["legacy:shield"],
          },
        ],
        capacityBands: [
          {
            band: 1,
            capacity: { current: 1, maximum: 2 },
            sourceIds: ["field-training"],
          },
        ],
      },
      equipment: [{ id: "item-1", analyzed: true, capacity: 3 }],
      recentEvent: { type: "discipline-activated" },
    });
  });

  it("separates legacy creature labels from physical classification", () => {
    const result = migrateScienceDomainData("creatures", {
      identity: { id: "creature-1" },
      name: "Ash Walker",
      creatureType: "fey",
      telepathy: 60,
      senses: [{ sense: "truesight", range: { value: 30, unit: "foot" } }],
      conditions: ["charmed", "petrified"],
      damageAdjustments: [
        {
          damageType: "fire",
          response: "resistance",
          bypassedBy: ["silvered weapon", "blessed source"],
        },
      ],
    });

    expect(result.data).toMatchObject({
      classification: {
        nature: "unknown",
        aliases: [{ label: "fey", context: "legacy classification" }],
      },
      communicationCapabilities: [
        {
          medium: "unknown",
          directionality: "bidirectional",
          range: { value: 60, unit: "foot" },
          operatingBasis: "unknown",
          understanding: "unknown",
        },
      ],
      senses: [{ sense: "unresolved-advanced-sensing" }],
      conditions: ["influenced", "immobilized-transformed"],
      damageAdjustments: [
        {
          damageType: "fire",
          response: "resistance",
          extensions: {
            "aow:legacy-bypass-labels": ["silvered weapon", "blessed source"],
          },
        },
      ],
    });
    expect(result.exceptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fey"),
        expect.stringContaining("telepathy"),
        expect.stringContaining("truesight"),
        expect.stringContaining("bypass"),
      ]),
    );
  });

  it("preserves an unresolved portal with physical review metadata", () => {
    const result = migrateScienceDomainData("location-connections", {
      identity: { id: "connection-1" },
      kind: "portal",
      notes: "A mirrored arch links two observatories.",
    });

    expect(result.data).toMatchObject({
      kind: "portal",
      mechanism: {
        operatingBasis: "unknown",
        understanding: "unknown",
        observedOperation: "A mirrored arch links two observatories.",
      },
    });
    expect(result.exceptions).toEqual([
      expect.stringContaining("portal connection"),
    ]);
  });

  it("preserves a legacy plane as an unresolved physical environment", () => {
    const result = migrateScienceDomainData("locations", {
      identity: { id: "location-1" },
      name: "The Glass Elsewhere",
      description: "Gravity bends toward a luminous central reef.",
      kind: "plane",
    });

    expect(result.data).toMatchObject({
      kind: "plane",
      physicalEnvironment: {
        kind: "unknown",
        understanding: "unknown",
        observedProperties: ["Gravity bends toward a luminous central reef."],
      },
    });
    expect(result.exceptions).toEqual([
      expect.stringContaining("physical environment"),
    ]);
  });
});
