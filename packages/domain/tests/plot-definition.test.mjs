import assert from "node:assert/strict";
import test from "node:test";
import { PlotDefinition } from "../dist/index.js";
const payload = (id = "plot") => ({
  id,
  campaignDefinitionId: "campaign",
  name: "Missing heir",
  parent: { kind: "root" },
  objectives: [],
  pressures: [],
  resistances: [],
  discoveries: [],
  locationContexts: [],
});
const scope = (plots = [payload()], extra = {}) => ({
  campaignDefinitionId: "campaign",
  plots,
  placements: [],
  capturedLocationIds: ["town"],
  ...extra,
});
const hydrate = (data = payload(), context = scope([data])) =>
  PlotDefinition.deserializePayload(data, context);
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((issue) => issue.code);
const discovery = (id, claims) => ({ id, name: "Clue", claims });
test("Plot codecs retain extensions and private authored data without aliases", () => {
  const data = {
    ...payload(),
    extensions: { private: [1] },
    privateFields: { notes: "Hidden" },
  };
  const entity = hydrate(data);
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.deepEqual(
    PlotDefinition.deserialize(
      entity.serialize(),
      scope([data]),
    ).serializePayload(),
    data,
  );
  data.extensions.private.push(2);
  const output = entity.serializePayload();
  output.extensions.private.push(3);
  assert.deepEqual(entity.state.data.extensions.private, [1]);
  assert(codes(hydrate(entity.serialize())).includes("plot-invalid"));
  assert.throws(() =>
    PlotDefinition.deserialize({ ...entity.serialize(), schemaVersion: 2 }),
  );
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [null, [], new Date(), { bad: NaN }, cyclic])
    assert.throws(() => hydrate(value));
});
test("Plot shape mode separates malformed records from unresolved capture checks", () => {
  assert.equal(
    hydrate(payload(), {}).state.metadata.validity.status,
    "unresolved",
  );
  assert.equal(
    hydrate(payload(), { validationMode: "shape" }).state.metadata.validity
      .status,
    "valid",
  );
  assert.deepEqual(codes(hydrate(payload(), { sourceId: "different" })), [
    "plot-invalid",
  ]);
  for (const data of [
    { ...payload(), name: " " },
    { ...payload(), objectives: [{ id: "x" }] },
    {
      ...payload(),
      locationContexts: [
        { id: "ctx", locationId: "town", actorPlacements: [{}] },
      ],
    },
  ])
    assert.deepEqual(codes(hydrate(data)), ["plot-invalid"]);
});
test("Plot owns member identities and delegates exact claim diagnostics to Discovery state", () => {
  const data = {
    ...payload(),
    objectives: [
      { id: "o", name: "One" },
      { id: "o", name: "Two" },
    ],
    discoveries: [
      discovery("first", [
        { id: "truth", kind: "truth", statement: "Fact" },
        {
          id: "belief",
          kind: "belief",
          statement: "Belief",
          conflictsWithClaimIds: ["missing", "missing", "belief"],
        },
      ]),
      discovery("second", [
        { id: "truth", kind: "truth", statement: "Other" },
        {
          id: "rumor",
          kind: "rumor",
          statement: "Rumor",
          relatedTruthClaimId: "unknown",
        },
      ]),
    ],
  };
  assert.deepEqual(
    codes(hydrate(data)).sort(),
    [
      "plot-objective-id-duplicate",
      "plot-claim-id-duplicate",
      "claim-conflict-id-duplicate",
      "claim-conflict-not-found",
      "claim-self-conflict",
      "claim-related-truth-not-found",
    ].sort(),
  );
  const valid = {
    ...payload(),
    discoveries: [
      discovery("a", [{ id: "truth", kind: "truth", statement: "Fact" }]),
      discovery("b", [
        {
          id: "rumor",
          kind: "rumor",
          statement: "Rumor",
          relatedTruthClaimId: "truth",
        },
      ]),
    ],
  };
  assert.equal(hydrate(valid).state.metadata.validity.status, "valid");
});
test("Plot hierarchy distinguishes missing parents, Campaign ownership and cross-branch relationships", () => {
  const root = payload("root"),
    child = {
      ...payload("child"),
      parent: { kind: "subplot", parentPlotDefinitionId: "root" },
      dependencies: [{ plotDefinitionId: "root" }],
    };
  assert.equal(
    hydrate(child, scope([root, child])).state.metadata.validity.status,
    "valid",
  );
  assert(
    codes(hydrate(child, scope([child]))).includes("plot-parent-not-found"),
  );
  assert(
    codes(
      hydrate(
        child,
        scope([{ ...root, campaignDefinitionId: "other" }, child]),
      ),
    ).includes("plot-parent-crosses-campaign-definition"),
  );
  assert(
    codes(
      hydrate(
        { ...root, dependencies: [{ plotDefinitionId: "child" }] },
        scope([root, child]),
      ),
    ).includes("plot-cross-branch-relationship-unexplained"),
  );
  assert(
    codes(hydrate({ ...root, campaignDefinitionId: "other" })).includes(
      "plot-campaign-mismatch",
    ),
  );
});
test("Plot checks reciprocal placement and captured Location context", () => {
  const data = {
    ...payload(),
    locationContexts: [
      { id: "ctx", locationId: "town", placementDefinitionIds: ["actor"] },
    ],
  };
  assert(codes(hydrate(data)).includes("plot-context-placement-not-found"));
  const placement = {
    id: "actor",
    kind: "independent",
    locationId: "town",
    plotDefinitionIds: ["plot"],
    source: { kind: "actor-role", role: "Witness" },
  };
  assert.equal(
    hydrate(data, scope([data], { placements: [placement] })).state.metadata
      .validity.status,
    "valid",
  );
  assert(
    codes(
      hydrate(
        data,
        scope([data], {
          placements: [{ ...placement, locationId: "elsewhere" }],
        }),
      ),
    ).includes("plot-context-placement-mismatch"),
  );
  assert(
    codes(hydrate(data, scope([data], { capturedLocationIds: [] }))).includes(
      "location-not-captured",
    ),
  );
});
test("Plot commands publish state before events and reject invalid identity changes atomically", async () => {
  const entity = hydrate();
  const observed = [];
  entity.state$.subscribe((state) => observed.push(state.data.name));
  entity.events.renamed.listen((event) =>
    observed.push(event.context.name + " event"),
  );
  assert.equal(
    (
      await entity.command("rename", {
        initiator: "gm",
        params: { name: " Found heir " },
        context: {},
      })
    ).status,
    "committed",
  );
  assert.deepEqual(observed, [
    "Missing heir",
    "Found heir",
    "Found heir event",
  ]);
  const before = entity.serializePayload();
  await assert.rejects(
    entity.command("replaceContent", {
      initiator: "gm",
      params: { content: { ...before, id: "new" } },
      context: {},
    }),
    /identity and Campaign ownership/,
  );
  assert.deepEqual(entity.serializePayload(), before);
  assert.equal(
    (
      await entity.command("replaceContent", {
        initiator: "gm",
        params: { content: before },
        context: {},
      })
    ).status,
    "unchanged",
  );
});
test("Plot candidate graph changes cannot hide a cycle reported against another node", async () => {
  const root = payload("a"),
    child = {
      ...payload("b"),
      parent: { kind: "subplot", parentPlotDefinitionId: "a" },
    };
  const entity = hydrate(root, scope([root, child]));
  const receipt = await entity.command("replaceContent", {
    initiator: "gm",
    params: {
      content: {
        ...root,
        parent: { kind: "subplot", parentPlotDefinitionId: "b" },
      },
    },
    context: {},
  });
  assert.equal(receipt.status, "rejected");
  assert.equal(entity.state.data.parent.kind, "root");
});
test("Plot validation captures detach caller state and can revalidate resolved references", () => {
  const data = {
    ...payload(),
    locationContexts: [{ id: "ctx", locationId: "town" }],
  };
  const context = scope([data]);
  const entity = hydrate(data, context);
  context.capturedLocationIds.length = 0;
  assert.equal(entity.state.metadata.validity.status, "valid");
  entity.validate(context);
  assert(codes(entity).includes("location-not-captured"));
});
test("Plot graph validity exposes cycles to every participant without traversal-order false positives", () => {
  const first = {
    ...payload("a"),
    parent: { kind: "subplot", parentPlotDefinitionId: "b" },
  };
  const second = {
    ...payload("b"),
    parent: { kind: "subplot", parentPlotDefinitionId: "a" },
  };
  for (const data of [first, second]) {
    const entity = hydrate(data, scope([first, second]));
    assert.equal(entity.state.metadata.validity.status, "invalid");
    assert.equal(
      entity.state.metadata.validity.issues.find(
        (issue) => issue.code === "plot-parent-cycle",
      ).path,
      "hierarchy",
    );
  }
});
