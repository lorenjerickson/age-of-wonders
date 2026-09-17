import { describe, expect, it } from "vitest";
import {
  chooseSessionMapActor,
  movementMapIsCoherent,
} from "./sessionMovementMapModel";
describe("Session map actor focus", () => {
  const actors = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("selects across the eligible actors and preserves a valid focus without rerolling", () => {
    expect(chooseSessionMapActor(actors, undefined, () => 0)).toBe("a");
    expect(chooseSessionMapActor(actors, undefined, () => 0.5)).toBe("b");
    expect(chooseSessionMapActor(actors, undefined, () => 0.99)).toBe("c");
    expect(
      chooseSessionMapActor(actors, "b", () => {
        throw new Error("Focus must not reroll");
      }),
    ).toBe("b");
  });
  it("replaces a removed actor from current-map candidates and never invents an empty-map actor", () => {
    expect(chooseSessionMapActor([{ id: "c" }], "a", () => 0.4)).toBe("c");
    expect(chooseSessionMapActor([], "a")).toBeUndefined();
  });
});
describe("Session map revision coherence", () => {
  it("requires matching captured snapshot and authoritative runtime before interaction", () => {
    expect(
      movementMapIsCoherent({ snapshotNumber: 2, runtimeRevision: 7 }, 7, 2),
    ).toBe(true);
    expect(
      movementMapIsCoherent({ snapshotNumber: 1, runtimeRevision: 7 }, 7, 2),
    ).toBe(false);
    expect(
      movementMapIsCoherent({ snapshotNumber: 2, runtimeRevision: 6 }, 7, 2),
    ).toBe(false);
    expect(movementMapIsCoherent(undefined, 7, 2)).toBe(false);
    expect(
      movementMapIsCoherent({ snapshotNumber: 2, runtimeRevision: 7 }),
    ).toBe(false);
  });
});
