import test from "node:test";
import assert from "node:assert/strict";
import { CampaignSession } from "../dist/index.js";
const time = "2026-10-15T03:00:00.000Z";
const invoke = (owner, action, extra = {}) =>
  owner.command("transition", {
    initiator: "gm",
    params: Object.fromEntries(
      Object.entries({
        action,
        expectedMetadataRevision: owner.state.data.metadataRevision,
        occurredAt: time,
        runtime: { snapshotId: "capture", revision: 7 },
        reason: " Weather cancellation ",
        ...extra,
      }).filter(([, value]) => value !== undefined),
    ),
    context: {},
  });
test("Session lifecycle preserves current transition matrix, including action aliases", async () => {
  for (const status of [
    "planned",
    "lobby",
    "active",
    "paused",
    "concluded",
    "cancelled",
  ])
    for (const action of [
      "open-lobby",
      "close-lobby",
      "start",
      "pause",
      "resume",
      "conclude",
      "cancel",
    ]) {
      const owner = CampaignSession.deserializePayload({
        status,
        metadataRevision: 2,
        privateSession: { secret: true },
      });
      try {
        if (
          CampaignSession.canTransition(
            status,
            CampaignSession.target(action),
          )
        ) {
          assert.equal((await invoke(owner, action)).status, "committed");
          assert.equal(owner.state.data.status, CampaignSession.target(action));
          assert.equal(owner.state.data.metadataRevision, 3);
          assert.deepEqual(owner.state.data.privateSession, { secret: true });
        } else {
          await assert.rejects(() => invoke(owner, action));
          assert.equal(owner.state.data.status, status);
        }
      } finally {
        owner.dispose();
      }
    }
});
test("Session emits immutable state before event, captures boundaries, and retains replay idempotency", async () => {
  const owner = CampaignSession.deserializePayload({
    status: "lobby",
    metadataRevision: 2,
    lastEventSequence: 4,
    privateSession: { secret: true },
  });
  const seen = [];
  owner.state$.subscribe((s) => seen.push(s.data.status));
  owner.events.transitioned.listen((e) => seen.push(e.context.action));
  try {
    await invoke(owner, "start");
    assert.deepEqual(seen, ["lobby", "active", "start"]);
    assert.equal(owner.state.data.firstEventSequence, 5);
    assert.equal(owner.state.data.startSnapshotId, "capture");
    assert.equal(owner.state.data.startedAt, time);
    assert.equal(
      (await invoke(owner, "start", { expectedMetadataRevision: 2 })).status,
      "unchanged",
    );
    assert.equal(seen.length, 3);
    await invoke(owner, "pause");
    await invoke(owner, "resume", {
      runtime: { snapshotId: "new-capture", revision: 10 },
    });
    await invoke(owner, "conclude", {
      runtime: { snapshotId: "new-capture", revision: 11 },
    });
    assert.equal(owner.state.data.endSnapshotId, "new-capture");
    assert.equal(owner.state.data.endRuntimeRevision, 11);
    assert.equal(owner.state.data.startSnapshotId, "capture");
    assert.equal(owner.state.data.summaryStatus, "draft");
    assert.equal(owner.state.data.currentSummaryRevision, 1);
    const copy = CampaignSession.deserialize(owner.serialize());
    assert.deepEqual(copy.serializePayload(), owner.serializePayload());
    copy.dispose();
  } finally {
    owner.dispose();
  }
});
test("Session rejects stale revisions and missing runtime/reason atomically", async () => {
  const owner = CampaignSession.deserializePayload({
    status: "lobby",
    metadataRevision: 2,
  });
  try {
    const before = owner.serializePayload();
    await assert.rejects(
      () => invoke(owner, "start", { runtime: undefined }),
      /runtime boundary/,
    );
    await assert.rejects(
      () => invoke(owner, "cancel", { reason: " " }),
      /reason is required/,
    );
    await assert.rejects(
      () => invoke(owner, "start", { expectedMetadataRevision: 1 }),
      /state changed/,
    );
    assert.deepEqual(owner.serializePayload(), before);
    await invoke(owner, "cancel");
    assert.equal(owner.state.data.cancellationReason, "Weather cancellation");
  } finally {
    owner.dispose();
  }
});
test("Session readiness preserves ordered blockers and GM-controlled participant policy", () => {
  const gm = {
    id: "gm",
    participantName: "Keeper",
    role: "GM",
    response: "ACCEPTED",
    required: true,
    humanMembership: { status: "ACTIVE" },
    presenceLeases: [{}],
  };
  const player = {
    id: "player",
    participantName: "Ada",
    role: "PLAYER",
    response: "PENDING",
    required: true,
    humanMembership: {
      status: "ACTIVE",
      activeCharacter: { status: "ACTIVE" },
    },
    presenceLeases: [],
  };
  const agent = {
    id: "agent",
    participantName: "Narrator",
    role: "AGENT",
    response: "ACCEPTED",
    required: true,
    agentParticipation: { status: "PAUSED" },
    presenceLeases: [],
  };
  const input = {
    instanceStatus: "PREPARING",
    hasCapturedRuntime: true,
    session: {
      status: "LOBBY",
      gmControlsPlayers: true,
      participations: [gm, player, agent],
    },
  };
  const ready = CampaignSession.readiness(input);
  assert.deepEqual(
    ready.map((c) => c.key),
    [
      "lobby",
      "runtime",
      "installation-session",
      "participant-gm",
      "participant-player",
      "participant-agent",
      "participant-limit",
    ],
  );
  assert.ok(ready.every((c) => c.status === "ready"));
  assert.equal(
    ready.find((c) => c.key === "participant-player").detail,
    "Ada is controlled by the GM.",
  );
  const blocked = CampaignSession.readiness({
    ...input,
    instanceStatus: "ACTIVE",
    runtimeIssue: "Captured runtime changed.",
    conflictingSessionName: "Other table",
    session: {
      ...input.session,
      participations: [
        { ...gm, presenceLeases: [] },
        player,
        { ...agent, agentParticipation: { status: "REVOKED" } },
      ],
    },
  });
  assert.equal(
    blocked.find((c) => c.key === "runtime").detail,
    "Captured runtime changed.",
  );
  assert.equal(
    blocked.find((c) => c.key === "installation-session").status,
    "blocked",
  );
  assert.equal(
    blocked.find((c) => c.key === "participant-player").status,
    "blocked",
  );
  assert.equal(
    blocked.find((c) => c.key === "participant-agent").status,
    "blocked",
  );
});
test("Session presence uses existing eligibility, lease and attendance policy with injected timestamps", () => {
  for (const status of ["LOBBY", "ACTIVE", "PAUSED"])
    assert.doesNotThrow(() =>
      CampaignSession.assertPresence("ACCEPTED", status),
    );
  assert.throws(
    () => CampaignSession.assertPresence("PENDING", "ACTIVE"),
    /Accept the Session invitation/,
  );
  assert.throws(
    () => CampaignSession.assertPresence("ACCEPTED", "CONCLUDED"),
    /not accepting participants/,
  );
  assert.deepEqual(CampaignSession.presenceWindow(100_000), {
    expiresAt: 190_000,
    renewHeartbeatThrough: 95_000,
  });
  assert.equal(CampaignSession.presenceSeconds(100_000, 190_000, 200_000), 90);
  assert.equal(CampaignSession.presenceSeconds(100_000, 190_000, 101_999), 1);
  assert.equal(CampaignSession.presenceSeconds(100_000, 190_000, 90_000), 0);
  assert.equal(CampaignSession.presencePhase("PAUSED"), "LOBBY");
  assert.equal(CampaignSession.attendanceOnJoin("LOBBY"), undefined);
  assert.equal(CampaignSession.attendanceOnJoin("ACTIVE"), "ATTENDED");
  assert.deepEqual(CampaignSession.lifecyclePresence("pause"), {
    phase: "LOBBY",
    attended: false,
  });
  assert.deepEqual(CampaignSession.lifecyclePresence("resume"), {
    phase: "PLAY",
    attended: true,
  });
});
