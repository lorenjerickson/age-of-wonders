import assert from "node:assert/strict";
import test from "node:test";
import { Entity, EntityScope } from "../dist/index.js";

const invoke = (params = {}, context = {}) => ({
  initiator: { id: "actor" },
  params,
  context,
});
class Door extends Entity {
  constructor(data = { open: false, tags: ["original"] }, options = {}) {
    super("door", data, ["opened", "closed"], { mode: "runtime" }, options);
    this.validate({ mode: "runtime" });
  }
  validateState(data) {
    return typeof data.open === "boolean"
      ? []
      : [
          {
            code: "open.invalid",
            message: "Open must be a boolean.",
            blocking: true,
          },
        ];
  }
  handleCommand(name, invocation) {
    const data = { ...this.state.data, tags: [...this.state.data.tags] };
    if (name === "invalid") return { data: { ...data, open: "invalid" } };
    if (name === "noop") return { data };
    data.open = name === "open";
    return {
      data,
      events: [
        {
          name: data.open ? "opened" : "closed",
          context: { locationId: invocation.context.locationId ?? "hall" },
        },
      ],
    };
  }
  static deserialize(input, options) {
    if (
      !input ||
      input.type !== "door" ||
      input.schemaVersion !== 1 ||
      typeof input.data?.open !== "boolean" ||
      !Array.isArray(input.data.tags)
    )
      throw new Error("Invalid door snapshot");
    return new Door(input.data, options);
  }
}
class Trap extends Entity {
  constructor(options = {}) {
    super(
      "trap",
      { activations: 0, locations: [] },
      ["activated"],
      { mode: "runtime" },
      options,
    );
    this.validate({ mode: "runtime" });
  }
  validateState() {
    return [];
  }
  handleCommand(name, invocation) {
    return {
      data: {
        activations: this.state.data.activations + 1,
        locations: [
          ...this.state.data.locations,
          invocation.context.locationId,
        ],
      },
      events: [
        {
          name: "activated",
          context: { locationId: invocation.context.locationId },
        },
      ],
    };
  }
}

test("state snapshots detach input, freeze nested values, and support shared current-value subscriptions", async () => {
  const input = { open: false, tags: ["original"] };
  const door = new Door(input);
  input.tags.push("outside");
  assert.deepEqual(door.state.data.tags, ["original"]);
  assert.throws(() => door.state.data.tags.push("inside"), TypeError);
  const first = [],
    second = [];
  const a = door.state$.subscribe((state) => {
    assert.equal(door.state, state);
    first.push(state);
  });
  const b = door.state$.subscribe((state) => second.push(state));
  assert.equal(first.length, 1);
  assert.equal(first[0], second[0]);
  assert.equal(door.state$.next, undefined);
  await door.command("open", invoke());
  assert.equal(first.length, 2);
  assert.equal(first[1], second[1]);
  assert.equal(first[0].data.open, false);
  assert.equal(first[1].data.open, true);
  assert.equal(first[1].metadata.revision, first[0].metadata.revision + 1);
  a.unsubscribe();
  b.unsubscribe();
});

test("validation publishes metadata changes without durable revision changes and suppresses identical results", async () => {
  const door = new Door();
  const seen = [];
  door.state$.subscribe((state) => seen.push(state));
  const revision = door.state.metadata.revision;
  door.validate({ mode: "publication" });
  assert.equal(seen.length, 2);
  assert.equal(door.state.metadata.validity.mode, "publication");
  assert.equal(door.state.metadata.revision, revision);
  door.validate({ mode: "publication" });
  assert.equal(seen.length, 2);
  await door.command("noop", invoke());
  assert.equal(seen.length, 2);
});

test("invalid command candidates cannot replace data or emit successful events", async () => {
  const door = new Door();
  const previous = door.state;
  let observations = 0,
    events = 0;
  door.state$.subscribe(() => observations++);
  door.events.opened.listen(() => events++);
  const result = await door.command("invalid", invoke());
  assert.equal(result.status, "rejected");
  assert.equal(door.state, previous);
  assert.equal(observations, 1);
  assert.equal(events, 0);
});

test("publication precedes events and observer-issued commands wait for all current observers and events", async () => {
  const door = new Door();
  const order = [];
  door.state$.subscribe((state) => {
    order.push(`first:${state.data.open}`);
    if (state.data.open) void door.command("close", invoke());
  });
  door.state$.subscribe((state) => order.push(`second:${state.data.open}`));
  door.events.opened.listen(() => order.push("opened"));
  door.events.closed.listen(() => order.push("closed"));
  order.length = 0;
  await door.command("open", invoke());
  assert.deepEqual(order, [
    "first:true",
    "second:true",
    "opened",
    "first:false",
    "second:false",
    "closed",
  ]);
});

test("binding maps context at delivery, retains causal source, and permits awaiting queued endpoints", async () => {
  const scope = new EntityScope();
  const door = new Door(undefined, { scope });
  const trap = new Trap({ scope });
  let destination = "initial";
  const activate = trap.command("activate").bind({
    map: (event) =>
      invoke(
        { from: event.source.instanceId },
        { locationId: `${event.context.locationId}:${destination}` },
      ),
  });
  assert.equal(trap.state.data.activations, 0);
  const order = [],
    opened = [],
    activated = [];
  const unsubscribe = door.events.opened.listen(async (event) => {
    opened.push(event);
    order.push("first");
    await activate(event);
    order.push("queued");
  });
  door.events.opened.listen(() => order.push("second"));
  trap.events.activated.listen((event) => {
    activated.push(event);
    order.push("activated");
  });
  destination = "delivery";
  await door.command("open", invoke({}, { locationId: "hall" }));
  assert.deepEqual(order, ["first", "queued", "second", "activated"]);
  assert.deepEqual(trap.state.data.locations, ["hall:delivery"]);
  assert.equal(opened[0].name, "door.events.opened");
  assert.equal(activated[0].causalParentId, opened[0].eventId);
  assert.equal(activated[0].source.type, "trap");
  assert.deepEqual(activated[0].initiator, { id: "actor" });
  unsubscribe();
  await door.command("open", invoke());
  assert.equal(trap.state.data.activations, 1);
});

test("event payloads are immutable and listener failure stops remaining delivery without rolling back commit", async () => {
  const door = new Door();
  let later = false;
  door.events.opened.listen((event) => {
    assert.throws(() => {
      event.context.locationId = "corrupt";
    }, TypeError);
    throw new Error("mapping failed");
  });
  door.events.opened.listen(() => {
    later = true;
  });
  await assert.rejects(door.command("open", invoke()), /mapping failed/);
  assert.equal(later, false);
  assert.equal(door.state.data.open, true);
});

test("bounded causal dispatch terminates cycles and allows a later independent command", async () => {
  const scope = new EntityScope({ maxWork: 12 });
  const door = new Door(undefined, { scope });
  const stop = door.events.opened.listen(() => door.command("open", invoke()));
  await assert.rejects(door.command("open", invoke()));
  stop();
  await door.command("close", invoke());
  assert.equal(door.state.data.open, false);
});

test("observer failures reach the host reporter without interrupting publication", async () => {
  const { config } = await import("rxjs");
  const originalReporter = config.onUnhandledError;
  const errors = [],
    states = [];
  config.onUnhandledError = (error) => errors.push(error);
  try {
    const door = new Door();
    let events = 0;
    door.state$.subscribe(() => {
      throw new Error("observer failed");
    });
    door.state$.subscribe((state) => states.push(state));
    door.events.opened.listen(() => events++);
    await door.command("open", invoke());
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(errors.length, 2);
    assert.equal(states.length, 2);
    assert.equal(events, 1);
  } finally {
    config.onUnhandledError = originalReporter;
  }
});

test("disposal completes observers, detaches events, rejects commands, and late subscriptions only complete", async () => {
  const door = new Door();
  let completed = 0,
    lateValues = 0;
  const subscription = door.state$.subscribe({ complete: () => completed++ });
  door.dispose();
  door.dispose();
  assert.equal(completed, 1);
  assert.equal(subscription.closed, true);
  door.state$.subscribe({
    next: () => lateValues++,
    complete: () => completed++,
  });
  assert.equal(lateValues, 0);
  assert.equal(completed, 2);
  await assert.rejects(door.command("open", invoke()));
});

test("serialization round trips isolated durable data and starts a fresh observable lifecycle", async () => {
  const door = new Door({
    open: false,
    tags: ["kept"],
    extensions: { "example:custom": { enabled: true } },
  });
  await door.command("open", invoke());
  const serialized = door.serialize();
  assert.equal(serialized.type, "door");
  assert.equal(serialized.schemaVersion, 1);
  assert.equal(serialized.state$, undefined);
  const restored = Door.deserialize(JSON.parse(JSON.stringify(serialized)));
  assert.deepEqual(restored.state.data, door.state.data);
  const states = [];
  restored.state$.subscribe((state) => states.push(state));
  assert.equal(states.length, 1);
  assert.equal(restored.state.metadata.validity.status, "valid");
  assert.throws(
    () => Door.deserialize({ ...serialized, schemaVersion: 999 }),
    /Invalid/,
  );
  assert.throws(
    () => Door.deserialize({ ...serialized, data: { open: "yes" } }),
    /Invalid/,
  );
});

test("commands detach queued invocation aliases before asynchronous execution", async () => {
  const door = new Door();
  const context = { locationId: "original" };
  const initiator = { id: "actor" };
  let delivered;
  door.events.opened.listen((event) => {
    delivered = event;
  });
  const pending = door.command("open", { initiator, params: {}, context });
  context.locationId = "changed";
  initiator.id = "changed";
  await pending;
  assert.equal(delivered.context.locationId, "original");
  assert.equal(delivered.initiator.id, "actor");
  const serialized = door.serialize();
  serialized.data.tags.push("outside");
  assert.deepEqual(door.state.data.tags, ["original"]);
});

test("a rejected queued bound command fails its causal scope instead of silently succeeding", async () => {
  const scope = new EntityScope();
  const source = new Door(undefined, { scope });
  const target = new Door(undefined, { scope });
  source.events.opened.listen(
    target.command("invalid").bind({ map: () => invoke() }),
  );
  await assert.rejects(source.command("open", invoke()), /invariant|reject/i);
  assert.equal(source.state.data.open, true);
  assert.equal(target.state.data.open, false);
});

test("an explicit owned subscription is released when its listening entity is disposed", async () => {
  class ListeningTrap extends Trap {
    attach(door) {
      this.ownSubscription(
        door.events.opened.listen(
          this.command("activate").bind({
            map: (event) => invoke({}, event.context),
          }),
        ),
      );
    }
  }
  const scope = new EntityScope();
  const door = new Door(undefined, { scope });
  const trap = new ListeningTrap({ scope });
  trap.attach(door);
  trap.dispose();
  await door.command("open", invoke());
  assert.equal(trap.state.data.activations, 0);
});

test("derived observable observer errors stay isolated and reach the host reporter", async () => {
  const { config, map } = await import("rxjs");
  const originalReporter = config.onUnhandledError;
  const globalErrors = [],
    healthy = [];
  config.onUnhandledError = (error) => globalErrors.push(error);
  try {
    const door = new Door();
    door.state$.pipe(map((state) => state.data.open)).subscribe(() => {
      throw new Error("derived observer failed");
    });
    door.state$.subscribe((state) => healthy.push(state.data.open));
    await door.command("open", invoke());
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(healthy, [false, true]);
    assert.equal(globalErrors.length, 2);
  } finally {
    config.onUnhandledError = originalReporter;
  }
});

test("observer-issued validation is queued so later subscribers never receive stale metadata", async () => {
  const door = new Door();
  const seen = [];
  door.state$.subscribe((state) => {
    if (state.data.open && state.metadata.validity.mode === "runtime")
      door.validate({ mode: "publication" });
  });
  door.state$.subscribe((state) =>
    seen.push([state.data.open, state.metadata.validity.mode]),
  );
  seen.length = 0;
  await door.command("open", invoke());
  assert.deepEqual(seen, [
    [true, "runtime"],
    [true, "publication"],
  ]);
  assert.equal(door.state.metadata.validity.mode, "publication");
});

test("caller mutation of validation context cannot weaken later command validation", async () => {
  class ContextDoor extends Door {
    validateState(data, context) {
      return [
        ...super.validateState(data),
        ...(data.open && context.denyOpen
          ? [{ code: "denied", message: "Cannot open.", blocking: true }]
          : []),
      ];
    }
  }
  const door = new ContextDoor();
  const context = { mode: "runtime", denyOpen: true };
  door.validate(context);
  context.denyOpen = false;
  const result = await door.command("open", invoke());
  assert.equal(result.status, "rejected");
  assert.equal(door.state.data.open, false);
});

test("bound event reactions require an explicit shared entity execution scope", async () => {
  const door = new Door();
  const trap = new Trap();
  door.events.opened.listen(
    trap
      .command("activate")
      .bind({ map: (event) => invoke({}, event.context) }),
  );
  await assert.rejects(door.command("open", invoke()), /scope/i);
  assert.equal(trap.state.data.activations, 0);
});

test("unsubscribing during delivery prevents a removed listener from firing", async () => {
  const door = new Door();
  const order = [];
  let removeSecond;
  door.events.opened.listen(() => {
    order.push("first");
    removeSecond();
  });
  removeSecond = door.events.opened.listen(() => order.push("second"));
  await door.command("open", invoke());
  assert.deepEqual(order, ["first"]);
});

test("non-JSON state cannot introduce mutable objects or executable payloads", () => {
  for (const extension of [
    new Date(),
    new Map(),
    () => {},
    Number.NaN,
    Infinity,
  ]) {
    assert.throws(() => new Door({ open: false, tags: [], extension }));
  }
  const cyclic = { open: false, tags: [] };
  cyclic.self = cyclic;
  assert.throws(() => new Door(cyclic), /cycle/i);
});
