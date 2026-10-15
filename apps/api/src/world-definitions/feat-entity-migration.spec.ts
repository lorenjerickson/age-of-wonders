import { FeatDefinition } from "@aow/domain";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const record = (payload: unknown) => ({
  resourceType: "definitions",
  sourceId: "alert",
  payload,
});
const feat = (grantedConditions: unknown) =>
  record({ kind: "feat", components: { grantedConditions } });
const condition = {
  resourceType: "world-conditions",
  sourceId: "rested",
  payload: { id: "rested", name: "Rested", revision: 1, effects: [] },
};

describe("Feat entity adapters", () => {
  it("retains generic checks for optional supplied Model conformance", () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const conceptId = compiled.elements.find(
      ({ lineage }) => lineage.semanticRole === "aow:background",
    )!.lineage.id;
    const payload = {
      kind: "feat",
      conformance: { modelSchemaReleaseIds: [compiled.releaseId], conceptId },
    };
    const check = (value: unknown) =>
      assertGovernedRecordConformance(
        [record(value)],
        [compiled.releaseId],
        compiled.elements,
      );
    expect(() => check(payload)).not.toThrow();
    expect(() => check({ kind: "feat", modelValues: {} })).toThrow(
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
  it("uses entity state and disposes temporary Feat instances", () => {
    const dispose = jest.spyOn(FeatDefinition.prototype, "dispose");
    try {
      expect(
        worldCodexSnapshotIssue([feat([{ conditionId: "rested" }]), condition]),
      ).toBeUndefined();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
    }
  });

  it("retains sparse legacy capture compatibility and optional Model conformance", () => {
    for (const payload of [
      { kind: "feat" },
      { kind: "feat", components: {} },
    ]) {
      expect(
        canonicalWorldRecordIssue("definitions", "alert", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(() =>
        assertGovernedRecordConformance([record(payload)], [], []),
      ).not.toThrow();
    }
  });

  it("does not turn new structural diagnostics into a stricter generic World save contract", () => {
    const payload = {
      kind: "feat",
      components: { traits: "legacy" },
    };
    const entity = FeatDefinition.deserializePayload(payload);
    try {
      expect(
        entity.state.metadata.validity.issues.some((issue) =>
          issue.code.startsWith("feat-components-"),
        ),
      ).toBe(true);
      expect(
        canonicalWorldRecordIssue("definitions", "alert", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
    } finally {
      entity.dispose();
    }
  });

  it("preserves Condition capture membership, list bounds, and duplicate diagnostics", () => {
    expect(worldCodexSnapshotIssue([feat("rested")])).toBe(
      "Choose a valid granted Condition list.",
    );
    expect(
      worldCodexSnapshotIssue([
        feat(Array.from({ length: 201 }, () => ({ conditionId: "rested" }))),
        condition,
      ]),
    ).toBe("Choose a valid granted Condition list.");
    expect(worldCodexSnapshotIssue([feat([{ conditionId: "missing" }])])).toBe(
      "A granted Condition is duplicated or unavailable in this World.",
    );
    expect(
      worldCodexSnapshotIssue([
        feat([{ conditionId: "rested" }, { conditionId: "rested" }]),
        condition,
      ]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
  });

  it("checks outer raw Feat state when extension fields resemble an entity envelope", () => {
    expect(
      worldCodexSnapshotIssue([
        record({
          kind: "feat",
          type: "feat-definition",
          schemaVersion: 1,
          data: { kind: "feat", components: {} },
          components: { grantedConditions: "invalid" },
        }),
      ]),
    ).toBe("Choose a valid granted Condition list.");
  });

  it("reports invalid JSON safely", () => {
    const payload: Record<string, unknown> = {
      kind: "feat",
      components: {},
    };
    payload.self = payload;
    expect(worldCodexSnapshotIssue([record(payload)])).toBe(
      "The Feat Definition must be a bounded JSON object.",
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
