import { createEditableCoreModelSeed } from "../model-registry/editable-core-model-seed";
import { compileModelSchemaRelease } from "../model-registry/model-registry-compiler";
import { assertGovernedRecordConformance } from "./world-definition-authoring.service";
import { canonicalWorldRecordIssue } from "./world-authored-record";
import { validateWorldDefinitionDraft } from "./world-definition-draft-validator";

describe("Skill entity compatibility adapters", () => {
  it("retains canonical modifier and association diagnostics", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "skill", {
        kind: "skill",
        components: { associatedProfessionIds: ["profession", "profession"] },
      }),
    ).toBe(
      "Associated Professions must be a bounded list of distinct references.",
    );
    expect(
      canonicalWorldRecordIssue("definitions", "skill", {
        kind: "skill",
        components: { modifierGrants: [{}] },
      }),
    ).toBe(
      "A Skill modifier grant has an invalid target, stacking mode, or dice recipe.",
    );
    expect(
      canonicalWorldRecordIssue("definitions", "skill", { kind: "skill" }),
    ).toBeUndefined();
  });

  it("checks association declarations without requiring complete Profession state", () => {
    const skill = {
      resourceType: "definitions",
      sourceId: "skill",
      payload: {
        kind: "skill",
        identity: { name: "Pilot" },
        components: { associatedProfessionIds: ["profession"] },
      },
    };
    const profession = {
      resourceType: "definitions",
      sourceId: "profession",
      payload: { kind: "profession" },
    };
    const content = {
      definitionIds: ["skill", "profession"],
      locationIds: [],
      schemaDefinitionIds: [],
      worldPlacementDefinitionIds: [],
      modelSchemaReleaseIds: ["release"],
    };
    const valid = validateWorldDefinitionDraft(content, [skill, profession]);
    expect(
      valid.issues.filter((issue) => issue.code === "skill-profession-missing"),
    ).toEqual([]);
    const undeclared = validateWorldDefinitionDraft(
      { ...content, definitionIds: ["skill"] },
      [skill, profession],
    );
    expect(
      undeclared.issues.filter(
        (issue) => issue.code === "skill-profession-missing",
      ),
    ).toEqual([
      {
        code: "skill-profession-missing",
        subject: "Pilot",
        detail: "An associated Profession is unavailable in this World.",
      },
    ]);
  });
});

const compiled = compileModelSchemaRelease(createEditableCoreModelSeed());
const skillConcept = compiled.elements.find(
  ({ lineage }) => lineage.semanticRole === "aow:skill",
)!.lineage.id;
const payload = {
  kind: "skill",
  conformance: {
    modelSchemaReleaseIds: [compiled.releaseId],
    conceptId: skillConcept,
  },
  components: { defaultAttribute: "aow:attribute-wisdom" },
};
function check(value: unknown) {
  return assertGovernedRecordConformance(
    [{ resourceType: "definitions", sourceId: "skill", payload: value }],
    [compiled.releaseId],
    compiled.elements,
  );
}
describe("Skill Model adapters", () => {
  it("preserves adopted Attribute selection without requiring legacy identity fields", () => {
    expect(() => check(payload)).not.toThrow();
  });
  it.each([
    [
      { kind: payload.kind, components: payload.components },
      "missing Model Schema conformance",
    ],
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
      { ...payload, components: { defaultAttribute: "custom:missing" } },
      "available default Attribute",
    ],
  ])("preserves governed validation diagnostics", (value, message) => {
    expect(() => check(value)).toThrow(message);
  });
  it("rejects invalid outer grant data even when resource extensions resemble an entity envelope", () => {
    expect(
      canonicalWorldRecordIssue("definitions", "skill", {
        ...payload,
        type: "skill-definition",
        schemaVersion: 1,
        data: payload,
        components: {
          modifierGrants: [
            {
              type: "modifier",
              schemaVersion: 1,
              data: {
                id: "grant",
                label: "Might",
                kind: "rolled-flat",
                stacking: "add",
                target: { kind: "health-maximum" },
                dice: [{ count: 1, sides: 4 }],
              },
            },
          ],
        },
      }),
    ).toContain("Skill modifier grant has an invalid");
  });
});
