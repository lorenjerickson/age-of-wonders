import test from "node:test";
import assert from "node:assert/strict";
import { Observable } from "rxjs";
import { RuleExecution } from "../dist/index.js";

const input = () => ({
  rules: [],
  event: {
    formatVersion: 1,
    id: "event",
    rootEventId: "event",
    idempotencyKey: "once",
    type: "aow:test",
    version: 1,
    source: "gm",
    context: {},
  },
  state: { runtime: {}, captured: {}, schema: {} },
});

for (const outcome of ["committed", "rejected", "thrown"]) {
  test(`execution scope observes published results and tears down when ${outcome}`, async (t) => {
    const owner = RuleExecution.create(input());
    const stream = owner.state$;
    const order = [];
    let active = 0;
    owner.state$ = new Observable((subscriber) => {
      active += 1;
      const subscription = stream.subscribe((state) => {
        if (state.data.result !== undefined) order.push("published");
        subscriber.next(state);
      });
      return () => {
        active -= 1;
        subscription.unsubscribe();
        order.push("unsubscribed");
      };
    });
    const command = owner.command.bind(owner);
    const dispose = owner.dispose.bind(owner);
    t.mock.method(owner, "dispose", () => {
      order.push("disposed");
      dispose();
    });
    t.mock.method(owner, "command", async (...args) => {
      assert.equal(active, 1, "observation starts before execution");
      if (outcome === "thrown") throw new Error("interpreter failed");
      if (outcome === "rejected")
        return { status: "rejected", reason: "invalid input", revision: 0 };
      const receipt = await command(...args);
      assert.deepEqual(
        order,
        ["published"],
        "published state precedes command completion",
      );
      order.push("receipt");
      return receipt;
    });
    t.mock.method(RuleExecution, "create", () => owner);
    if (outcome === "committed") {
      const result = await RuleExecution.run(input());
      assert.equal(result.status, "no-op");
      assert.deepEqual(order, [
        "published",
        "receipt",
        "unsubscribed",
        "disposed",
      ]);
      result.status = "caller-owned";
      assert.equal(owner.state.data.result.status, "no-op");
    } else {
      await assert.rejects(
        RuleExecution.run(input()),
        outcome === "thrown" ? /interpreter failed/ : /invalid input/,
      );
      assert.deepEqual(order, ["unsubscribed", "disposed"]);
      assert.equal(owner.state.data.result, undefined);
    }
    assert.equal(active, 0);
    await assert.rejects(
      command("evaluate", { initiator: "gm", params: {}, context: {} }),
      /disposed/,
    );
  });
}
