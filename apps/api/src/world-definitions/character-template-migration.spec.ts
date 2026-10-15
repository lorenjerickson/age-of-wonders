import {
  worldCodexEntryIssue,
  worldCodexSnapshotIssue,
} from "./world-codex-validation";

const character = {
  id: "npc",
  name: "Guide",
  revision: 1,
  creatureDefinitionId: "creature",
  attributes: {},
  skills: {},
  health: { current: 10, maximum: 10, temporary: 0 },
  vision: { day: 30, night: 0 },
  movement: { jump: 5 },
  equipment: [],
  grantedConditions: [],
};
const records = [
  {
    resourceType: "definitions",
    sourceId: "creature",
    payload: { kind: "creature" },
  },
  ...["pack", "torch"].map((sourceId) => ({
    resourceType: "definitions",
    sourceId,
    payload: { kind: "item" },
  })),
];

describe("Character Template migration compatibility", () => {
  it.each([
    [{ ...character, name: "" }, "Provide a valid Codex name and description."],
    [
      { ...character, creatureDefinitionId: "foreign" },
      "Choose a Creature template in this World.",
    ],
    [
      { ...character, skills: { tracking: "2" } },
      "Attributes and Skills must have numeric values.",
    ],
    [
      { ...character, health: { current: 12, maximum: 10, temporary: 0 } },
      "Health must be nonnegative and current health cannot exceed maximum.",
    ],
    [
      { ...character, vision: { day: -1, night: 0 } },
      "Vision distances must be nonnegative.",
    ],
    [
      { ...character, movement: { teleport: 5 } },
      "Choose valid movement modes and nonnegative speeds.",
    ],
    [
      { ...character, images: { banner: {} } },
      "Choose valid Character artwork.",
    ],
  ])("preserves Character diagnostics: %s", (payload, message) => {
    expect(worldCodexEntryIssue("characters", payload, records)).toBe(message);
  });

  it("keeps carried slot exceptions and distinct Item references", () => {
    const equipment = [
      { slot: "carried", itemDefinitionId: "pack" },
      { slot: "carried", itemDefinitionId: "torch" },
    ];
    expect(
      worldCodexEntryIssue("characters", { ...character, equipment }, records),
    ).toBeUndefined();
    equipment[1].itemDefinitionId = "pack";
    expect(
      worldCodexEntryIssue("characters", { ...character, equipment }, records),
    ).toBe("Choose each equipment Item only once.");
  });

  it("does not unwrap an entity envelope supplied as a persisted Character resource", () => {
    const shell = {
      id: "npc",
      name: "Shell",
      revision: 1,
      type: "character-template",
      schemaVersion: 1,
      data: character,
    };
    expect(worldCodexEntryIssue("characters", shell, records)).toBe(
      "Choose a Creature template in this World.",
    );
    expect(
      worldCodexSnapshotIssue([
        ...records,
        {
          resourceType: "world-character-templates",
          sourceId: "npc",
          payload: shell,
        },
      ]),
    ).toBe("Choose a Creature template in this World.");
  });
});
