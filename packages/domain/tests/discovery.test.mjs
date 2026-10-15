import assert from "node:assert/strict";
import test from "node:test";
import { Discovery } from "../dist/index.js";
const payload = () => ({
  id: "discovery",
  name: "The heir",
  truth: {
    id: "truth",
    statement: "The heir survives",
    provenance: "GM notes",
    extensions: { "custom:secret": true },
  },
  beliefs: [
    { id: "belief", statement: "The heir died", relation: "contradicts" },
  ],
  rumors: [],
  private: { notes: "Hidden" },
  extensions: { "custom:clue": [1, 2] },
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
test("Discovery codecs preserve facets, private metadata, unknown fields and detached immutable state", () => {
  const input = payload();
  const entity = Discovery.deserializePayload(input);
  assert.equal(entity.state.metadata.validity.status, "valid");
  input.private.notes = "mutated";
  assert.equal(entity.state.data.private.notes, "Hidden");
  const restored = Discovery.deserialize(entity.serialize());
  assert.deepEqual(restored.serializePayload(), payload());
  assert.ok(Object.isFrozen(entity.state.data.truth.extensions));
  entity.dispose();
  restored.dispose();
});
test("Discovery reads legacy claims losslessly and requires canonical facets for new authored format", () => {
  const legacy = {
    id: "d",
    name: "Legacy",
    claims: [{ id: "t", kind: "truth", statement: "A fact" }],
    private: { detail: "secret" },
  };
  const entity = Discovery.deserializePayload(legacy);
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.deepEqual(entity.serializePayload(), legacy);
  entity.validate({ format: "canonical" });
  assert.deepEqual(codes(entity), ["discovery-invalid"]);
  entity.dispose();
});
test("Discovery owns reference integrity with explicit other-Discovery scope", () => {
  const legacy = {
    id: "d",
    name: "Legacy",
    claims: [
      {
        id: "r",
        kind: "rumor",
        statement: "They say",
        conflictsWithClaimIds: ["t"],
        relatedTruthClaimId: "t",
      },
    ],
  };
  const entity = Discovery.deserializePayload(legacy);
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  entity.validate({
    otherClaims: [{ id: "t", kind: "truth", statement: "A fact" }],
  });
  assert.equal(entity.state.metadata.validity.status, "valid");
  entity.validate({ otherClaims: [] });
  assert.deepEqual(codes(entity), [
    "claim-conflict-not-found",
    "claim-related-truth-not-found",
  ]);
  entity.dispose();
});
test("Discovery reports duplicate identities, duplicate conflict references and self conflict in state", () => {
  const entity = Discovery.deserializePayload(
    {
      id: "d",
      name: "Clue",
      claims: [
        {
          id: "b",
          kind: "belief",
          statement: "A",
          conflictsWithClaimIds: ["b", "b"],
        },
      ],
    },
    { otherClaims: [{ id: "b", kind: "truth", statement: "B" }] },
  );
  assert.deepEqual(codes(entity), [
    "plot-claim-id-duplicate",
    "claim-conflict-id-duplicate",
    "claim-self-conflict",
  ]);
  entity.dispose();
});
test("Discovery canonical facet command retains private data, removes legacy claims and emits after observable state", async () => {
  const entity = Discovery.deserializePayload(
    { ...payload(), claims: [{ id: "old", kind: "truth", statement: "Old" }] },
    { otherClaims: [] },
  );
  const seen = [];
  entity.state$.subscribe((state) => seen.push(state.data.truth.id));
  entity.events.facetsReplaced.listen(() => seen.push("event"));
  const facets = payload();
  facets.truth.id = "new";
  await entity.command("replaceFacets")({
    initiator: "gm",
    params: {
      truth: facets.truth,
      beliefs: facets.beliefs,
      rumors: facets.rumors,
    },
    context: {},
  });
  assert.deepEqual(seen, ["truth", "new", "event"]);
  assert.equal(entity.state.data.claims, undefined);
  assert.deepEqual(entity.state.data.private, payload().private);
  assert.equal(entity.state.metadata.validity.status, "valid");
  entity.dispose();
});
test("Discovery rejects malformed JSON and preserves raw envelope-shaped extensions", () => {
  const input = {
    ...payload(),
    type: "discovery",
    schemaVersion: 42,
    data: { custom: true },
  };
  const entity = Discovery.deserializePayload(input);
  assert.deepEqual(entity.serializePayload(), input);
  assert.throws(() => Discovery.deserialize(input), /schema version/);
  const cyclic = payload();
  cyclic.self = cyclic;
  assert.throws(() => Discovery.deserializePayload(cyclic), /cycles/);
  entity.dispose();
});
test("Discovery diagnoses malformed reference fields on canonical facets without throwing", () => {
  const input = payload();
  input.beliefs[0].conflictsWithClaimIds = 42;
  const entity = Discovery.deserializePayload(input, { otherClaims: [] });
  assert.deepEqual(codes(entity), ["discovery-invalid"]);
  assert.deepEqual(entity.serializePayload(), input);
  entity.dispose();
});
test("Discovery no-op commands preserve revision and emit no events", async () => {
  const entity = Discovery.deserializePayload(payload());
  const seen = [];
  entity.state$.subscribe(() => seen.push("state"));
  entity.events.renamed.listen(() => seen.push("rename"));
  entity.events.facetsReplaced.listen(() => seen.push("facets"));
  const rename = await entity.command("rename")({
    initiator: "gm",
    params: { name: " The heir " },
    context: {},
  });
  const value = payload();
  const facets = await entity.command("replaceFacets")({
    initiator: "gm",
    params: {
      truth: value.truth,
      beliefs: value.beliefs,
      rumors: value.rumors,
    },
    context: {},
  });
  assert.equal(rename.status, "unchanged");
  assert.equal(facets.status, "unchanged");
  assert.deepEqual(seen, ["state"]);
  entity.dispose();
});

test("authoring facets retain canonical precedence and unrelated data", () => {
  const discovery = { id: "d", name: "Secret", private: { kept: true }, truth: { id: "truth", statement: "Actual", private: 1 }, beliefs: [], rumors: [{ id: "r", statement: "Rumor", relatedTruthClaimId: "truth" }], claims: [{ id: "old", kind: "truth", statement: "Legacy" }] };
  const claims = Discovery.authoringClaims(discovery);
  assert.equal(claims[0].statement, "Actual");
  const saved = Discovery.withAuthoredClaims(discovery, claims);
  assert.equal(saved.claims, undefined);
  assert.deepEqual(saved.private, { kept: true });
  assert.deepEqual(saved.truth, { id: "truth", statement: "Actual", private: 1 });
  assert.equal(discovery.claims[0].id, "old");
});

test("authoring reference projections stay within supplied Plot scope", () => {
  const first = { name: "First", claims: [{ id: "t", kind: "truth", statement: "Truth" }] };
  const second = { name: "Second", claims: [{ id: "r", kind: "rumor", statement: "Rumor", relatedTruthClaimId: "t" }] };
  assert.deepEqual(Discovery.authoringClaimReferences([first], new Set(["t"])), []);
  assert.equal(Discovery.authoringClaimReferences([first, second], new Set(["t"]))[0].claim.id, "r");
  assert.deepEqual(Discovery.authoringClaimReferences([first, second], new Set(["t", "r"])), []);
});
