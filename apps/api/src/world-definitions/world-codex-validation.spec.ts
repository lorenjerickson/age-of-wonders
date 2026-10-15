import { worldCodexSnapshotIssue } from "./world-codex-validation";

const legacyItem = {
  resourceType: "definitions",
  sourceId: "item",
  payload: {
    kind: "item",
    components: { cost: { value: 50, currency: "credit" } },
  },
};
const creature = {
  resourceType: "definitions",
  sourceId: "creature",
  payload: {
    kind: "creature",
    components: { health: { current: 20, maximum: 20, temporary: 0 } },
  },
};

describe("World Codex draft mutation validation", () => {
  it("preserves untouched legacy Item fields when creating a Creature", () => {
    expect(
      worldCodexSnapshotIssue([legacyItem, creature], [legacyItem]),
    ).toBeUndefined();
    expect(worldCodexSnapshotIssue([legacyItem, creature])).toBe(
      "Choose valid Item costs.",
    );
  });
  it("preserves legacy fields during an unrelated edit on the same Item", () => {
    const edited = {
      ...legacyItem,
      payload: { ...legacyItem.payload, name: "Renamed item" },
    };
    expect(worldCodexSnapshotIssue([edited], [legacyItem])).toBeUndefined();
  });
  it.each([
    { cost: { value: 60, currency: "credit" } },
    { cost: [{ amount: -1, denomination: "credit" }] },
    { weight: null },
    { weight: { value: -1, unit: "pound" } },
  ])("rejects newly authored invalid Item fields: %j", (patch) => {
    const edited = {
      ...legacyItem,
      payload: {
        ...legacyItem.payload,
        components: { ...legacyItem.payload.components, ...patch },
      },
    };
    expect(worldCodexSnapshotIssue([edited], [legacyItem])).toBeDefined();
    expect(worldCodexSnapshotIssue([edited], [])).toBeDefined();
  });
  it("allows a legacy cost to be replaced with a canonical value", () => {
    const edited = {
      ...legacyItem,
      payload: {
        ...legacyItem.payload,
        components: { cost: [{ amount: 50, denomination: "credit" }] },
      },
    };
    expect(worldCodexSnapshotIssue([edited], [legacyItem])).toBeUndefined();
  });
  it("still rejects dangling references in unchanged Creatures", () => {
    const equipped = {
      ...creature,
      payload: { ...creature.payload, components: { equipmentPool: ["item"] } },
    };
    expect(worldCodexSnapshotIssue([equipped], [legacyItem, equipped])).toBe(
      "Choose distinct Items in this World for the equipment pool.",
    );
  });
});

it("keeps an unchanged invalid Creature scalar editable while full publication rejects it", () => {
  const prior = {
    ...creature,
    payload: {
      ...creature.payload,
      components: { health: { current: 9, maximum: 3, temporary: 0 } },
    },
  };
  const renamed = {
    ...prior,
    payload: { ...prior.payload, identity: { name: "Renamed" } },
  };
  expect(worldCodexSnapshotIssue([renamed], [prior])).toBeUndefined();
  expect(worldCodexSnapshotIssue([renamed])).toBe(
    "Choose valid Creature health values.",
  );
  const changed = {
    ...prior,
    payload: {
      ...prior.payload,
      components: { health: { current: 10, maximum: 3, temporary: 0 } },
    },
  };
  expect(worldCodexSnapshotIssue([changed], [prior])).toBe(
    "Choose valid Creature health values.",
  );
});

it("still rejects an unchanged Creature's missing granted Condition", () => {
  const prior = {
    ...creature,
    payload: {
      ...creature.payload,
      components: { grantedConditions: [{ conditionId: "missing" }] },
    },
  };
  expect(worldCodexSnapshotIssue([prior], [prior])).toBe(
    "A granted Condition is duplicated or unavailable in this World.",
  );
});
