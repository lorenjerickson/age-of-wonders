import {
  worldCodexEntryIssue,
  worldCodexSnapshotIssue,
} from "./world-codex-validation";

const modifier = {
  id: "speed",
  propertyPath: "movement.walk",
  operation: "add",
  value: 5,
  allowConditionOverride: true,
};
const effect = {
  id: "effect",
  name: "Haste",
  revision: 1,
  modifiers: [modifier],
  duration: { kind: "permanent" },
};
const condition = {
  id: "condition",
  name: "Quick",
  revision: 1,
  effects: [{ effectId: "effect", modifierOverrides: { speed: 10 } }],
};
const effectRecord = (payload: unknown = effect) => ({
  resourceType: "world-effects",
  sourceId: "effect",
  payload,
});
const conditionRecord = {
  resourceType: "world-conditions",
  sourceId: "condition",
  payload: condition,
};

describe("Effect and Condition entity adapter compatibility", () => {
  it("validates raw outer records instead of accepting nested entity envelopes", () => {
    const wrappedEffect = {
      id: "effect",
      name: "Shell",
      revision: 1,
      type: "effect-definition",
      schemaVersion: 1,
      data: effect,
    };
    const wrappedCondition = {
      id: "condition",
      name: "Shell",
      revision: 1,
      type: "condition-definition",
      schemaVersion: 1,
      data: condition,
    };
    expect(worldCodexEntryIssue("effects", wrappedEffect, [])).toBe(
      "Add at least one numeric property modifier.",
    );
    expect(
      worldCodexEntryIssue("conditions", wrappedCondition, [effectRecord()]),
    ).toBe("Choose the Effects granted by this Condition.");
    expect(
      worldCodexEntryIssue("conditions", condition, [
        effectRecord(wrappedEffect),
      ]),
    ).toBe("An Effect is unavailable in this World.");
  });
  it.each([
    [{ ...effect, name: "" }, "Provide a valid Codex name and description."],
    [
      { ...effect, modifiers: [] },
      "Add at least one numeric property modifier.",
    ],
    [
      {
        ...effect,
        modifiers: [
          { ...modifier, propertyPath: "attributes.__proto__.value" },
        ],
      },
      "Each modifier needs a unique key, numeric property, operation and finite value.",
    ],
    [
      {
        ...effect,
        modifiers: [{ ...modifier, propertyPath: "skills.foreign.value" }],
      },
      "Choose an available numeric Character property in this World.",
    ],
    [
      {
        ...effect,
        modifiers: [
          {
            ...modifier,
            duration: { kind: "timed", amount: 0, unit: "rounds" },
          },
        ],
      },
      "Choose a permanent or positive timed duration for each modifier.",
    ],
    [
      { ...effect, duration: { kind: "timed", amount: 0, unit: "rounds" } },
      "Choose a permanent or positive timed duration.",
    ],
  ])("preserves the first Effect diagnostic: %s", (payload, message) => {
    expect(worldCodexEntryIssue("effects", payload, [])).toBe(message);
  });

  it("retains partial referenced Effect compatibility at the Condition check boundary", () => {
    const partial = effectRecord({
      modifiers: [{ id: "speed", allowConditionOverride: true }],
    });
    expect(
      worldCodexEntryIssue("conditions", condition, [partial]),
    ).toBeUndefined();
    expect(worldCodexSnapshotIssue([partial, conditionRecord])).toBeDefined();
  });

  it("revalidates existing Condition overrides against the replacement Effect", () => {
    expect(
      worldCodexSnapshotIssue([effectRecord(), conditionRecord]),
    ).toBeUndefined();
    const changed = effectRecord({
      ...effect,
      modifiers: [{ ...modifier, allowConditionOverride: false }],
    });
    expect(
      worldCodexSnapshotIssue(
        [changed, conditionRecord],
        [effectRecord(), conditionRecord],
      ),
    ).toBe("This Effect modifier does not allow a Condition override.");
    expect(
      worldCodexSnapshotIssue(
        [conditionRecord],
        [effectRecord(), conditionRecord],
      ),
    ).toBe("An Effect is unavailable in this World.");
  });

  it("uses only the supplied World vocabulary for dynamic numeric properties", () => {
    const payload = {
      ...effect,
      modifiers: [{ ...modifier, propertyPath: "skills.world:tracking.value" }],
    };
    const skill = {
      resourceType: "definitions",
      sourceId: "skill",
      payload: { kind: "skill", identity: { key: "world:tracking" } },
    };
    expect(worldCodexEntryIssue("effects", payload, [skill])).toBeUndefined();
    expect(worldCodexEntryIssue("effects", payload, [])).toBe(
      "Choose an available numeric Character property in this World.",
    );
  });

  it("preserves snapshot identity and malformed JSON diagnostics", () => {
    expect(
      worldCodexSnapshotIssue([effectRecord({ ...effect, id: "other" })]),
    ).toBe("The Codex identity does not match its snapshot record.");
    expect(
      worldCodexEntryIssue("effects", { ...effect, duration: undefined }, []),
    ).toBe("Provide a valid Codex name and description.");
    expect(
      worldCodexEntryIssue("conditions", { ...condition, effects: [] }, []),
    ).toBeUndefined();
  });
});
