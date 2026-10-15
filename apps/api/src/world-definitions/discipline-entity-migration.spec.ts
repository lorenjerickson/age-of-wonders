import { DisciplineDefinition } from "@aow/domain";
import { migrateScienceDomainData } from "../domain/science-domain-migration";
import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { worldCodexSnapshotIssue } from "./world-codex-validation";

const record = (payload: unknown) => ({
  resourceType: "definitions",
  sourceId: "signal",
  payload,
});
const discipline = (grantedConditions: unknown) =>
  record({ kind: "discipline", components: { grantedConditions } });
const condition = {
  resourceType: "world-conditions",
  sourceId: "rested",
  payload: { id: "rested", name: "Rested", revision: 1, effects: [] },
};

describe("Discipline entity adapters", () => {
  it("round-trips converted spell captures without losing scientific or private data", () => {
    const migrated = migrateScienceDomainData("definitions", {
      identity: {
        id: "signal",
        name: "Shield",
        description: "Protective barrier",
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
        privateNotes: { secret: "GM" },
      },
    });
    const entity = DisciplineDefinition.deserializePayload(migrated.data);
    try {
      expect(entity.serializePayload()).toEqual(migrated.data);
      expect(
        worldCodexSnapshotIssue([record(entity.serializePayload())]),
      ).toBeUndefined();
    } finally {
      entity.dispose();
    }
  });

  it("retains generic checks for optional supplied Model conformance", () => {
    const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
    const conceptId = compiled.elements.find(
      ({ lineage }) => lineage.semanticRole === "aow:background",
    )!.lineage.id;
    const payload = {
      kind: "discipline",
      conformance: { modelSchemaReleaseIds: [compiled.releaseId], conceptId },
    };
    const check = (value: unknown) =>
      assertGovernedRecordConformance(
        [record(value)],
        [compiled.releaseId],
        compiled.elements,
      );
    expect(() => check(payload)).not.toThrow();
    expect(() => check({ kind: "discipline", modelValues: {} })).toThrow(
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
  it("uses entity state and disposes temporary Discipline instances", () => {
    const dispose = jest.spyOn(DisciplineDefinition.prototype, "dispose");
    try {
      expect(
        worldCodexSnapshotIssue([
          discipline([{ conditionId: "rested" }]),
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
      { kind: "discipline" },
      { kind: "discipline", components: {} },
    ]) {
      expect(
        canonicalWorldRecordIssue("definitions", "signal", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
      expect(() =>
        assertGovernedRecordConformance([record(payload)], [], []),
      ).not.toThrow();
    }
  });

  it("does not turn new structural diagnostics into a stricter generic World save contract", () => {
    const payload = {
      kind: "discipline",
      components: { inputs: "legacy" },
    };
    const entity = DisciplineDefinition.deserializePayload(payload);
    try {
      expect(
        entity.state.metadata.validity.issues.some((issue) =>
          issue.code.startsWith("discipline-components-"),
        ),
      ).toBe(true);
      expect(
        canonicalWorldRecordIssue("definitions", "signal", payload),
      ).toBeUndefined();
      expect(worldCodexSnapshotIssue([record(payload)])).toBeUndefined();
    } finally {
      entity.dispose();
    }
  });

  it("preserves Condition capture membership, list bounds, and duplicate diagnostics", () => {
    expect(worldCodexSnapshotIssue([discipline("rested")])).toBe(
      "Choose a valid granted Condition list.",
    );
    expect(
      worldCodexSnapshotIssue([
        discipline(
          Array.from({ length: 201 }, () => ({ conditionId: "rested" })),
        ),
        condition,
      ]),
    ).toBe("Choose a valid granted Condition list.");
    expect(
      worldCodexSnapshotIssue([discipline([{ conditionId: "missing" }])]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
    expect(
      worldCodexSnapshotIssue([
        discipline([{ conditionId: "rested" }, { conditionId: "rested" }]),
        condition,
      ]),
    ).toBe("A granted Condition is duplicated or unavailable in this World.");
  });

  it("checks outer raw Discipline state when extension fields resemble an entity envelope", () => {
    expect(
      worldCodexSnapshotIssue([
        record({
          kind: "discipline",
          type: "discipline-definition",
          schemaVersion: 1,
          data: { kind: "discipline", components: {} },
          components: { grantedConditions: "invalid" },
        }),
      ]),
    ).toBe("Choose a valid granted Condition list.");
  });

  it("reports invalid JSON safely", () => {
    const payload: Record<string, unknown> = {
      kind: "discipline",
      components: {},
    };
    payload.self = payload;
    expect(worldCodexSnapshotIssue([record(payload)])).toBe(
      "The Discipline Definition must be a bounded JSON object.",
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
