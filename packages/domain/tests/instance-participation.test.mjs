import test from "node:test";
import assert from "node:assert/strict";
import { InstanceParticipation } from "../dist/index.js";
const change = (owner, expectedStatus, status, currentSession = false) =>
  owner.command("transition", {
    initiator: "gm",
    params: { expectedStatus, status, occurredAt: "2026-10-15T04:00:00.000Z" },
    context: { currentSession },
  });
test("membership transition guards current Sessions and GM ownership, clears departed bindings atomically", async () => {
  const owner = InstanceParticipation.deserializePayload({
    kind: "human",
    role: "PLAYER",
    status: "active",
    displayName: "Ada",
    activeCharacterId: "hero",
    private: { secret: true },
  });
  const seen = [];
  owner.state$.subscribe((s) => seen.push(s.data.status));
  try {
    await assert.rejects(
      () => change(owner, "active", "inactive", true),
      /current Session/,
    );
    await assert.rejects(
      () => change(owner, "inactive", "left"),
      /status changed/,
    );
    assert.deepEqual(seen, ["active"]);
    await change(owner, "active", "banned");
    assert.equal(owner.state.data.activeCharacterId, null);
    assert.equal(owner.state.data.leftAt, null);
    await change(owner, "banned", "inactive");
    await change(owner, "inactive", "left");
    assert.equal(owner.state.data.leftAt, "2026-10-15T04:00:00.000Z");
    assert.deepEqual(owner.state.data.private, { secret: true });
    await assert.rejects(() => change(owner, "left", "active"));
    const copy = InstanceParticipation.deserialize(owner.serialize());
    assert.deepEqual(copy.serializePayload(), owner.serializePayload());
    copy.dispose();
  } finally {
    owner.dispose();
  }
  const gm = InstanceParticipation.deserializePayload({
    kind: "human",
    role: "GM",
    status: "active",
  });
  try {
    await assert.rejects(() => change(gm, "active", "left"), /ownership/);
  } finally {
    gm.dispose();
  }
});
test("Agent observation and action grants stay distinct, normalized and bounded", async () => {
  const owner = InstanceParticipation.deserializePayload({
    kind: "agent",
    status: "configured",
    private: { secret: true },
  });
  const configure = (observe, act) =>
    owner.command("configureCapabilities", {
      initiator: "gm",
      params: { observe, act },
      context: {},
    });
  try {
    await configure(
      [" aow:event-stream ", "aow:event-stream"],
      ["aow:draft-narrative"],
    );
    assert.deepEqual(owner.state.data.observeCapabilities, [
      "aow:event-stream",
    ]);
    assert.deepEqual(owner.state.data.actCapabilities, ["aow:draft-narrative"]);
    const before = owner.serializePayload();
    for (const [observe, act] of [
      [["auth:secret"], []],
      [["aow:draft-narrative"], []],
      [[], ["aow:event-stream"]],
      [["not-namespaced"], []],
    ])
      await assert.rejects(() => configure(observe, act));
    assert.deepEqual(owner.serializePayload(), before);
  } finally {
    owner.dispose();
  }
});
test("Agent lifecycle follows existing transitions, refuses stale expectations and retains grants on revocation", async () => {
  const owner = InstanceParticipation.deserializePayload({
    kind: "agent",
    status: "configured",
    observeCapabilities: ["aow:event-stream"],
    actCapabilities: [],
  });
  const seen = [];
  owner.events.transitioned.listen((e) => seen.push(e.context.to));
  try {
    await assert.rejects(() => change(owner, "configured", "paused"));
    await change(owner, "configured", "authorized");
    await assert.rejects(
      () => change(owner, "configured", "revoked"),
      /changed/,
    );
    await change(owner, "authorized", "paused");
    await change(owner, "paused", "authorized");
    await change(owner, "authorized", "revoked");
    assert.deepEqual(seen, ["authorized", "paused", "authorized", "revoked"]);
    assert.deepEqual(owner.state.data.observeCapabilities, [
      "aow:event-stream",
    ]);
    await assert.rejects(() => change(owner, "revoked", "authorized"));
  } finally {
    owner.dispose();
  }
});
