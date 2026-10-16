import assert from "node:assert/strict";
import test from "node:test";
import { PlacementDefinition } from "../dist/index.js";
const world = () => ({
  id: "placement",
  locationId: "location",
  source: { kind: "world-item", itemDefinitionId: "item" },
  mapPosition: { kind: "normalized-map", x: 0.2, y: 0.7 },
  extensions: { private: ["notes"] },
});
const campaign = () => ({
  ...world(),
  kind: "independent",
  plotDefinitionIds: ["plot"],
});
const context = () => ({
  scope: "campaign",
  capturedLocationIds: ["location"],
  capturedCreatureIds: ["creature"],
  capturedItemDefinitionIds: ["item"],
  capturedDefinitionIds: ["item", "creature"],
  capturedWorldPlacements: [{ id: "world-placement", locationId: "location" }],
  plotIds: ["plot"],
});
const codes = (entity) =>
  entity.state.metadata.validity.issues.map((i) => i.code);
test("Placement round trips explicit persisted variants and isolates private fields", () => {
  for (const [data, scope] of [
    [world(), "world"],
    [{ ...world(), source: { kind: "world-character", characterTemplateId: "npc" } }, "world"],
    [campaign(), "campaign"],
    [
      {
        id: "decoration",
        locationId: "location",
        kind: "world-decoration",
        capturedWorldPlacementId: "world-placement",
        plotDefinitionIds: [],
        privateFields: { notes: "secret" },
      },
      "campaign",
    ],
  ]) {
    const ctx = {
      ...context(),
      scope,
      ...(scope === "world" ? { validationMode: "shape" } : {}),
    };
    const entity = PlacementDefinition.deserializePayload(data, ctx);
    assert.equal(entity.state.metadata.validity.status, "valid");
    assert.deepEqual(
      PlacementDefinition.deserialize(
        entity.serialize(),
        ctx,
      ).serializePayload(),
      data,
    );
    const out = entity.serializePayload();
    out.locationId = "other";
    assert.equal(entity.state.data.locationId, "location");
  }
  const data = world();
  const entity = PlacementDefinition.deserializePayload(data, {
    scope: "world",
  });
  data.extensions.private.push("changed");
  assert.deepEqual(entity.state.data.extensions.private, ["notes"]);
});
test("Placement codecs reject non-JSON and do not unwrap raw author input", () => {
  const entity = PlacementDefinition.deserializePayload(world(), {
    scope: "world",
  });
  assert(
    codes(
      PlacementDefinition.deserializePayload(entity.serialize(), {
        scope: "world",
      }),
    ).includes("world-placement-invalid"),
  );
  assert.throws(
    () =>
      PlacementDefinition.deserialize(entity.serialize(), {
        scope: "campaign",
      }),
    /scope/,
  );
  assert.throws(
    () =>
      PlacementDefinition.deserialize(
        { ...entity.serialize(), schemaVersion: 2 },
        { scope: "world", validationMode: "shape" },
      ),
    /schema/,
  );
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [null, [], { value: NaN }, cyclic, new Date()])
    assert.throws(() =>
      PlacementDefinition.deserializePayload(value, {
        scope: "world",
        validationMode: "shape",
      }),
    );
});
test("World placement presentation and exact source variants remain bounded", () => {
  for (const change of [
    { scale: 101 },
    { mapPosition: { kind: "normalized-map", x: 1.1, y: 0 } },
    {
      source: {
        kind: "world-item",
        itemDefinitionId: "item",
        creatureId: "creature",
      },
    },
    { source: { kind: "actor-role", role: "guide" } },
    { notes: "x".repeat(4001) },
  ])
    assert.deepEqual(
      codes(
        PlacementDefinition.deserializePayload(
          { ...world(), ...change },
          { scope: "world", validationMode: "shape" },
        ),
      ),
      ["world-placement-invalid"],
    );
  // Campaign captures historically accept extended positions and unbounded presentation text.
  assert.deepEqual(
    codes(
      PlacementDefinition.deserializePayload(
        {
          ...campaign(),
          scale: 101,
          mapPosition: { x: 0, y: 1 },
          notes: "x".repeat(4001),
        },
        context(),
      ),
    ),
    [],
  );
});
test("Campaign placement unresolved captures and relationship diagnostics belong to state", () => {
  const entity = PlacementDefinition.deserializePayload(campaign(), {
    scope: "campaign",
  });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  const ctx = context();
  entity.validate(ctx);
  ctx.capturedLocationIds.length = 0;
  assert.equal(entity.state.metadata.validity.status, "valid");
  entity.validate(ctx);
  assert.deepEqual(codes(entity), ["location-not-captured"]);
  const bad = PlacementDefinition.deserializePayload(
    {
      ...campaign(),
      plotDefinitionIds: ["absent", "absent"],
      source: {
        kind: "actor-role",
        role: "guide",
        suggestedCreatureDefinitionId: "item",
      },
    },
    context(),
  );
  assert.deepEqual(codes(bad), [
    "placement-plot-id-duplicate",
    "placement-plot-not-found",
    "placement-plot-not-found",
    "placement-source-not-creature",
  ]);
  const decoration = {
    id: "decoration",
    locationId: "location",
    kind: "world-decoration",
    capturedWorldPlacementId: "absent",
    plotDefinitionIds: [],
  };
  assert.deepEqual(
    codes(PlacementDefinition.deserializePayload(decoration, context())),
    ["world-placement-not-captured"],
  );
  assert.deepEqual(
    codes(
      PlacementDefinition.deserializePayload(
        { ...decoration, capturedWorldPlacementId: "world-placement" },
        {
          ...context(),
          capturedWorldPlacements: [
            { id: "world-placement", locationId: "elsewhere" },
          ],
        },
      ),
    ),
    ["world-placement-location-mismatch"],
  );
});
test("Placement commands notify state before events and reject invalid replacement atomically", async () => {
  const entity = PlacementDefinition.deserializePayload(world(), {
    scope: "world",
  });
  const order = [];
  entity.state$.subscribe((s) => order.push(s.data.scale ?? 1));
  entity.events.payloadReplaced.listen(() => order.push("event"));
  const send = (payload) =>
    entity.command("replacePayload", {
      initiator: "gm",
      params: { payload },
      context: {},
    });
  assert.equal((await send({ ...world(), scale: 2 })).status, "committed");
  assert.deepEqual(order, [1, 2, "event"]);
  assert.equal((await send({ ...world(), scale: -1 })).status, "rejected");
  await assert.rejects(send({ ...world(), id: "other" }), /identity/);
  assert.equal(entity.state.data.scale, 2);
  assert.equal((await send({ ...world(), scale: 2 })).status, "unchanged");
  assert.deepEqual(order, [1, 2, "event"]);
  entity.dispose();
});
test("World placement resolves captured references and rejects stale target changes", async () => {
  const ctx = {
    scope: "world",
    capturedLocationIds: ["location"],
    capturedDefinitionIds: ["item"],
    records: [
      {
        resourceType: "definitions",
        sourceId: "item",
        payload: { kind: "item" },
      },
    ],
  };
  const entity = PlacementDefinition.deserializePayload(world(), {
    scope: "world",
  });
  assert.equal(entity.state.metadata.validity.status, "unresolved");
  entity.validate(ctx);
  assert.equal(entity.state.metadata.validity.status, "valid");
  assert.throws(() => entity.validate({ scope: "campaign" }), /scope/);
  const receipt = await entity.command("replacePayload", {
    initiator: "gm",
    params: { payload: { ...world(), locationId: "missing" } },
    context: {},
  });
  assert.equal(receipt.status, "rejected");
  assert.equal(entity.state.data.locationId, "location");
  let emitted = 0;
  entity.events.payloadReplaced.listen(() => emitted++);
  const reordered = Object.fromEntries(Object.entries(world()).reverse());
  assert.equal(
    (
      await entity.command("replacePayload", {
        initiator: "gm",
        params: { payload: reordered },
        context: {},
      })
    ).status,
    "unchanged",
  );
  assert.equal(emitted, 0);
});
