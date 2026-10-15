import assert from "node:assert/strict";
import test from "node:test";
import { SkillDefinition } from "../dist/index.js";

const model = {
  releaseIds: ["release"],
  elements: [
    {
      id: "concept",
      key: "aow:skill",
      kind: "concept",
      semanticRole: "aow:skill",
    },
    {
      id: "attribute",
      key: "aow:attribute-agility",
      kind: "vocabulary",
      semanticRole: "aow:attribute",
    },
  ],
};
const payload = () => ({
  kind: "skill",
  identity: { id: "skill", name: "Pilot" },
  conformance: { conceptId: "concept", modelSchemaReleaseIds: ["release"] },
  components: { defaultAttribute: "aow:attribute-agility" },
  extensions: { "test:extra": { value: 1 } },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((i) => i.code);

test("Skill codecs retain extensions, isolate state, and distinguish raw resources from envelopes", () => {
  const input = payload();
  const skill = SkillDefinition.deserializePayload(input, { model });
  input.extensions["test:extra"].value = 99;
  assert.equal(skill.state.data.extensions["test:extra"].value, 1);
  assert.deepEqual(
    SkillDefinition.deserialize(skill.serialize(), {
      model,
    }).serializePayload(),
    payload(),
  );
  assert.throws(
    () => SkillDefinition.deserializePayload(skill.serialize()),
    /Skill kind/,
  );
  assert.throws(
    () =>
      SkillDefinition.deserialize({ ...skill.serialize(), schemaVersion: 2 }),
    /schema version/,
  );
  assert.throws(
    () => SkillDefinition.deserializePayload({ kind: "skill", bad: NaN }),
    /JSON/,
  );
  assert.deepEqual(codes(skill), []);
});

test("Skill validates association shape and delegates bounded modifier recipes", () => {
  const grant = {
    id: "bonus",
    label: "Bonus",
    stacking: "add",
    kind: "rolled-flat",
    target: { kind: "health-maximum" },
    dice: [{ count: 1, sides: 6 }],
  };
  for (const components of [
    { associatedProfessionIds: ["profession", "profession"] },
    { modifierGrants: [grant, grant] },
    { modifierGrants: [{ ...grant, dice: [{ count: 0, sides: 6 }] }] },
  ]) {
    const skill = SkillDefinition.deserializePayload(
      { ...payload(), components },
      { model },
    );
    assert.ok(codes(skill).includes("skill-canonical-components"));
  }
  assert.deepEqual(
    codes(
      SkillDefinition.deserializePayload(
        { ...payload(), components: { modifierGrants: [grant] } },
        { model },
      ),
    ),
    [],
  );
  assert.deepEqual(
    codes(
      SkillDefinition.deserializePayload({ kind: "skill" }, { model }),
    ).filter((c) => c.startsWith("skill-canonical")),
    [],
  );
});

test("Skill associations require a declared Profession in the captured World", () => {
  const data = {
    ...payload(),
    components: { associatedProfessionIds: ["profession"] },
  };
  assert.ok(
    codes(SkillDefinition.deserializePayload(data)).includes(
      "skill-references-unresolved",
    ),
  );
  const records = [
    {
      resourceType: "definitions",
      sourceId: "profession",
      payload: { kind: "profession" },
    },
  ];
  assert.deepEqual(
    codes(
      SkillDefinition.deserializePayload(data, {
        model,
        records,
        definitionIds: ["profession"],
      }),
    ),
    [],
  );
  assert.ok(
    codes(
      SkillDefinition.deserializePayload(data, {
        model,
        records,
        definitionIds: [],
      }),
    ).includes("skill-profession-missing"),
  );
  assert.ok(
    codes(
      SkillDefinition.deserializePayload(data, {
        model,
        records: [],
        definitionIds: ["profession"],
      }),
    ).includes("skill-profession-missing"),
  );
});

test("Skill conformance checks exact releases, concept role, and default Attribute", () => {
  for (const data of [
    { ...payload(), conformance: undefined },
    {
      ...payload(),
      conformance: { conceptId: "concept", modelSchemaReleaseIds: ["other"] },
    },
    {
      ...payload(),
      conformance: { conceptId: "missing", modelSchemaReleaseIds: ["release"] },
    },
    { ...payload(), components: { defaultAttribute: "missing" } },
  ]) {
    if (data.conformance === undefined) delete data.conformance;
    assert.ok(
      codes(SkillDefinition.deserializePayload(data, { model })).includes(
        "skill-model-invalid",
      ),
    );
  }
  assert.ok(
    codes(
      SkillDefinition.deserializePayload(payload(), {
        model: {
          ...model,
          elements: [{ ...model.elements[0], semanticRole: "aow:item" }],
        },
      }),
    ).includes("skill-model-invalid"),
  );
  assert.ok(
    codes(SkillDefinition.deserializePayload(payload())).includes(
      "skill-model-unresolved",
    ),
  );
});

test("Skill rename publishes nested identity before the event and suppresses no-ops", async () => {
  const skill = SkillDefinition.deserializePayload(payload(), { model });
  const seen = [];
  skill.state$.subscribe((state) => seen.push(state.data.identity.name));
  skill.events.renamed.listen((event) =>
    seen.push(`event:${event.context.name}:${skill.state.data.identity.name}`),
  );
  await skill.command("rename", {
    initiator: "author",
    params: { name: "  Navigator  " },
    context: {},
  });
  await skill.command("rename", {
    initiator: "author",
    params: { name: "Navigator" },
    context: {},
  });
  assert.deepEqual(seen, ["Pilot", "Navigator", "event:Navigator:Navigator"]);
  assert.equal(skill.serializePayload().name, undefined);
  await assert.rejects(
    () =>
      skill.command("rename", {
        initiator: "author",
        params: { name: " " },
        context: {},
      }),
    /Skill name/,
  );
});
