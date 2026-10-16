import { ProfessionDefinition } from "@aow/domain";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
const conceptId = compiled.elements.find(
  ({ lineage }) => lineage.semanticRole === "aow:profession",
)!.lineage.id;
const rank = "aow:profession-rank-novice";
const payload = {
  kind: "profession",
  conformance: { modelSchemaReleaseIds: [compiled.releaseId], conceptId },
  components: {
    expertiseOrder: [rank],
    expertiseLevels: [{ tier: rank, benefits: {} }],
    acquisition: [{ kind: "character-creation", startingExpertise: rank }],
    actions: [
      {
        actionId: "craft",
        unlocksAt: rank,
        improvements: [{ atExpertise: rank }],
      },
    ],
  },
};
const record = (value: unknown) => ({
  resourceType: "definitions",
  sourceId: "profession",
  payload: value,
});
const checkModel = (value: unknown) =>
  assertGovernedRecordConformance(
    [record(value)],
    [compiled.releaseId],
    compiled.elements,
  );
const grant = {
  id: "strength",
  label: "Strength",
  kind: "rolled-flat",
  stacking: "add",
  target: { kind: "health-maximum" },
  dice: [{ count: 1, sides: 4 }],
};

describe("Profession entity adapters", () => {
  it("disposes temporary entities after all three validation adapters", () => {
    const dispose = jest.spyOn(ProfessionDefinition.prototype, "dispose");
    try {
      canonicalWorldRecordIssue("definitions", "profession", payload);
      worldCodexSnapshotIssue([record(payload)]);
      checkModel(payload);
      expect(dispose).toHaveBeenCalledTimes(3);
    } finally {
      dispose.mockRestore();
    }
  });
  it("retains sparse legacy Profession payloads without imposing Model checks on canonical validation", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "profession", {
        kind: "profession",
      }),
    ).toBeUndefined();
    expect(
      canonicalWorldRecordIssue("definitions", "profession", {
        kind: "profession",
        components: { expertiseLevels: [{ benefits: {} }] },
      }),
    ).toBeUndefined();
  });
  it("retains cross-tier grant diagnostics", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "profession", {
        ...payload,
        components: {
          expertiseLevels: [
            { benefits: { modifierGrants: [grant] } },
            { benefits: { modifierGrants: [grant] } },
          ],
        },
      }),
    ).toBe(
      "Profession modifier grant names must be unique across expertise tiers.",
    );
  });
  it("validates raw outer state when extension fields resemble an entity envelope", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "profession", {
        ...payload,
        type: "profession-definition",
        schemaVersion: 1,
        data: payload,
        components: {
          expertiseLevels: [
            { benefits: { modifierGrants: [{ ...grant, dice: [] }] } },
          ],
        },
      }),
    ).toBe(
      "A Profession modifier grant has an invalid target, stacking mode, or dice recipe.",
    );
  });
  it("reports bounded payload failures safely", () => {
    const cyclic: Record<string, unknown> = { kind: "profession" };
    cyclic.self = cyclic;
    expect(canonicalWorldRecordIssue("definitions", "profession", cyclic)).toBe(
      "The Profession Definition must be a bounded JSON object.",
    );
  });
  it("retains granted Condition membership and duplicate diagnostics", () => {
    const withConditions = (grantedConditions: unknown) =>
      record({
        ...payload,
        components: { ...payload.components, grantedConditions },
      });
    const condition = {
      resourceType: "world-conditions",
      sourceId: "rested",
      payload: { id: "rested", name: "Rested", revision: 1, effects: [] },
    };
    expect(
      worldCodexSnapshotIssue([withConditions([{ conditionId: "missing" }])]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
    expect(
      worldCodexSnapshotIssue([
        withConditions([{ conditionId: "rested" }, { conditionId: "rested" }]),
        condition,
      ]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
    expect(worldCodexSnapshotIssue([withConditions("rested")])).toBe(
      "Choose a valid granted Condition list.",
    );
    expect(
      worldCodexSnapshotIssue([
        withConditions([{ conditionId: "rested" }]),
        condition,
      ]),
    ).toBeUndefined();
  });
  it("retains the adopted Model selection without requiring newer identity fields", () => {
    expect(() => checkModel(payload)).not.toThrow();
  });
  it.each([
    [{ kind: "profession" }, "missing Model Schema conformance"],
    [
      {
        ...payload,
        conformance: { ...payload.conformance, modelSchemaReleaseIds: [] },
      },
      "exact Model Schema releases",
    ],
    [
      {
        ...payload,
        conformance: { ...payload.conformance, conceptId: "missing" },
      },
      "unavailable Model concept",
    ],
    [
      { ...payload, components: { ...payload.components, expertiseOrder: [] } },
      "available Profession Ranks",
    ],
    [
      {
        ...payload,
        components: {
          ...payload.components,
          expertiseLevels: [{ tier: "missing", benefits: {} }],
        },
      },
      "available Profession Ranks",
    ],
    [
      {
        ...payload,
        components: {
          ...payload.components,
          acquisition: [{ startingExpertise: "missing" }],
        },
      },
      "available Profession Ranks",
    ],
    [
      {
        ...payload,
        components: {
          ...payload.components,
          actions: [{ unlocksAt: "missing" }],
        },
      },
      "available Profession Ranks",
    ],
    [
      {
        ...payload,
        components: {
          ...payload.components,
          actions: [
            { unlocksAt: rank, improvements: [{ atExpertise: "missing" }] },
          ],
        },
      },
      "available Profession Ranks",
    ],
  ])("preserves Model diagnostics", (value, message) => {
    expect(() => checkModel(value)).toThrow(message);
  });
  it("skips undeclared records when checking a captured World closure", () => {
    expect(() =>
      assertGovernedRecordConformance(
        [record({ kind: "profession" })],
        [compiled.releaseId],
        compiled.elements,
        new Set(),
      ),
    ).not.toThrow();
  });
});

it("permits zero-cost empty Profession drafts while preserving publication rank checks", () => {
  const draft = {
    ...payload,
    components: {
      expertiseOrder: [],
      expertiseLevels: [],
      acquisition: [],
      actions: [],
    },
  };
  expect(() =>
    assertGovernedRecordConformance(
      [record(draft)],
      [compiled.releaseId],
      compiled.elements,
      undefined,
      "draft",
    ),
  ).not.toThrow();
  expect(worldCodexSnapshotIssue([record(draft)], [])).toBeUndefined();
  expect(() => checkModel(draft)).toThrow("available Profession Ranks");
  const entity = ProfessionDefinition.deserializePayload(draft);
  expect(
    entity.state.metadata.validity.issues.some(
      (issue) =>
        issue.unresolved && issue.path === "components.expertiseLevels",
    ),
  ).toBe(true);
  entity.dispose();
});

describe("Profession authored Effect references", () => {
  const effect = {
    resourceType: "world-effects",
    sourceId: "blessing",
    payload: {
      id: "blessing",
      name: "Blessing",
      revision: 1,
      modifiers: [
        {
          id: "health",
          propertyPath: "health.maximum",
          operation: "add",
          value: 1,
          allowConditionOverride: false,
        },
      ],
      duration: { kind: "permanent" },
    },
  };
  const withEffects = (grantedEffects: unknown) =>
    record({
      ...payload,
      components: { ...payload.components, grantedEffects },
    });
  it("accepts same-World associations and prevents dangling references after deletion", () => {
    const owner = withEffects([{ effectId: "blessing" }]);
    expect(worldCodexSnapshotIssue([owner, effect])).toBeUndefined();
    expect(worldCodexSnapshotIssue([owner], [owner, effect])).toBe(
      "A granted Effect is duplicated or unavailable in this World.",
    );
    expect(
      worldCodexSnapshotIssue([
        withEffects([{ effectId: "blessing" }, { effectId: "blessing" }]),
        effect,
      ]),
    ).toBe("A granted Effect is duplicated or unavailable in this World.");
    expect(worldCodexSnapshotIssue([withEffects("invalid"), effect])).toBe(
      "Choose a valid granted Effect list.",
    );
  });
});
