import { TraitDefinition } from "@aow/domain";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const record = (payload: unknown) => ({
  resourceType: "definitions",
  sourceId: "steadfast",
  payload,
});
const trait = (grantedConditions: unknown) =>
  record({ kind: "trait", components: { grantedConditions } });
const condition = {
  resourceType: "world-conditions",
  sourceId: "rested",
  payload: { id: "rested", name: "Rested", revision: 1, effects: [] },
};

describe("Trait entity adapters", () => {
  it("retains generic checks for optional supplied Model conformance", () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const conceptId = compiled.elements.find(
      ({ lineage }) => lineage.semanticRole === "aow:background",
    )!.lineage.id;
    const payload = {
      kind: "trait",
      conformance: { modelSchemaReleaseIds: [compiled.releaseId], conceptId },
    };
    const check = (value: unknown) =>
      assertGovernedRecordConformance(
        [record(value)],
        [compiled.releaseId],
        compiled.elements,
      );
    expect(() => check(payload)).not.toThrow();
    expect(() => check({ kind: "trait", modelValues: {} })).toThrow(
      "missing Model Schema conformance",
    );
    expect(() =>
      check({
        ...payload,
        conformance: { ...payload.conformance, modelSchemaReleaseIds: [] },
      }),
    ).toThrow("exact Model Schema releases");
    expect(() =>
      check({
        ...payload,
        conformance: { ...payload.conformance, conceptId: "missing" },
      }),
    ).toThrow("unavailable Model concept");
  });
  it("uses entity state and disposes temporary Trait instances", () => {
    const dispose = jest.spyOn(TraitDefinition.prototype, "dispose");
    try {
      expect(
        worldCodexSnapshotIssue([
          trait([{ conditionId: "rested" }]),
          condition,
        ]),
      ).toBeUndefined();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
    }
  });

  it("retains sparse legacy capture compatibility and optional Model conformance", () => {
    for (const payload of [
      { kind: "trait" },
      { kind: "trait", components: {} },
    ]) {
      expect(
        canonicalWorldRecordIssue("definitions", "steadfast", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(() =>
        assertGovernedRecordConformance([record(payload)], [], []),
      ).not.toThrow();
    }
  });

  it("does not turn new structural diagnostics into a stricter generic World save contract", () => {
    const payload = {
      kind: "trait",
      components: { triggers: "legacy" },
    };
    const entity = TraitDefinition.deserializePayload(payload);
    try {
      expect(
        entity.state.metadata.validity.issues.some((issue) =>
          issue.code === "trait-trigger-invalid" &&
          issue.path === "components.triggers",
        ),
      ).toBe(true);
      expect(
        canonicalWorldRecordIssue("definitions", "steadfast", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
    } finally {
      entity.dispose();
    }
  });

  it("preserves Condition capture membership, list bounds, and duplicate diagnostics", () => {
    expect(worldCodexSnapshotIssue([trait("rested")])).toBe(
      "Choose a valid granted Condition list.",
    );
    expect(
      worldCodexSnapshotIssue([
        trait(Array.from({ length: 201 }, () => ({ conditionId: "rested" }))),
        condition,
      ]),
    ).toBe("Choose a valid granted Condition list.");
    expect(worldCodexSnapshotIssue([trait([{ conditionId: "missing" }])])).toBe(
      "A granted Condition is duplicated or unavailable in this World.",
    );
    expect(
      worldCodexSnapshotIssue([
        trait([{ conditionId: "rested" }, { conditionId: "rested" }]),
        condition,
      ]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
  });

  it("checks outer raw Trait state when extension fields resemble an entity envelope", () => {
    expect(
      worldCodexSnapshotIssue([
        record({
          kind: "trait",
          type: "trait-definition",
          schemaVersion: 1,
          data: { kind: "trait", components: {} },
          components: { grantedConditions: "invalid" },
        }),
      ]),
    ).toBe("Choose a valid granted Condition list.");
  });

  it("reports invalid JSON safely", () => {
    const payload: Record<string, unknown> = {
      kind: "trait",
      components: {},
    };
    payload.self = payload;
    expect(worldCodexSnapshotIssue([record(payload)])).toBe(
      "The Trait Definition must be a bounded JSON object.",
    );
  });

  it("preserves generic grants validation for other unmigrated Definition concepts", () => {
    expect(
      worldCodexSnapshotIssue([
        record({
          kind: "language",
          components: { grantedConditions: "invalid" },
        }),
      ]),
    ).toBe("Choose a valid granted Condition list.");
  });
});
