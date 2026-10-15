import { BackgroundDefinition } from "@aow/domain";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
const conceptId = compiled.elements.find(
  ({ lineage }) => lineage.semanticRole === "aow:background",
)!.lineage.id;
const payload = {
  kind: "background",
  conformance: { modelSchemaReleaseIds: [compiled.releaseId], conceptId },
  components: {},
};
const record = (value: unknown) => ({
  resourceType: "definitions",
  sourceId: "background",
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

describe("Background entity adapters", () => {
  it("disposes temporary entities after all three validation adapters", () => {
    const dispose = jest.spyOn(BackgroundDefinition.prototype, "dispose");
    try {
      canonicalWorldRecordIssue("definitions", "background", payload);
      worldCodexSnapshotIssue([record(payload)]);
      checkModel(payload);
      expect(dispose).toHaveBeenCalledTimes(3);
    } finally {
      dispose.mockRestore();
    }
  });
  it("retains sparse legacy Background payloads without imposing Model checks on canonical validation", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "background", {
        kind: "background",
      }),
    ).toBeUndefined();
    expect(
      canonicalWorldRecordIssue("definitions", "background", {
        kind: "background",
        components: {},
      }),
    ).toBeUndefined();
  });
  it("retains grant diagnostics", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "background", {
        ...payload,
        components: { modifierGrants: [grant, grant] },
      }),
    ).toBe(
      "Background modifier grant names must be unique across expertise tiers.",
    );
    expect(
      canonicalWorldRecordIssue("definitions", "background", {
        ...payload,
        components: { modifierGrants: "invalid" },
      }),
    ).toBe("Background modifier grants must be a bounded list.");
  });
  it("validates raw outer state when extension fields resemble an entity envelope", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "background", {
        ...payload,
        type: "background-definition",
        schemaVersion: 1,
        data: payload,
        components: {
          modifierGrants: [{ ...grant, dice: [] }],
        },
      }),
    ).toBe(
      "A Background modifier grant has an invalid target, stacking mode, or dice recipe.",
    );
  });
  it("reports bounded payload failures safely", () => {
    const cyclic: Record<string, unknown> = { kind: "background" };
    cyclic.self = cyclic;
    expect(canonicalWorldRecordIssue("definitions", "background", cyclic)).toBe(
      "The Background Definition must be a bounded JSON object.",
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
    [{ kind: "background" }, "missing Model Schema conformance"],
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
      {
        ...payload,
        conformance: {
          ...payload.conformance,
          conceptId: compiled.elements.find(
            ({ lineage }) => lineage.semanticRole === "aow:skill",
          )!.lineage.id,
        },
      },
      "wrong Model concept",
    ],
  ])("preserves Model diagnostics", (value, message) => {
    expect(() => checkModel(value)).toThrow(message);
  });
  it("skips undeclared records when checking a captured World closure", () => {
    expect(() =>
      assertGovernedRecordConformance(
        [record({ kind: "background" })],
        [compiled.releaseId],
        compiled.elements,
        new Set(),
      ),
    ).not.toThrow();
  });
});
