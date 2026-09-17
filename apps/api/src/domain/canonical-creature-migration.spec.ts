import { canonicalCreatureMigrationSources } from "./canonical-creature-migration";

describe("canonical Creature migration comparison", () => {
  const legacy = {
    resourceType: "creatures",
    sourceId: "same-creature",
    payload: { identity: { name: "Original name" } },
    contentHash: "original",
  };
  const canonical = {
    resourceType: "definitions",
    sourceId: "same-creature",
    payload: { kind: "creature", identity: { name: "Renamed creature" } },
    contentHash: "successor",
  };
  it("recognizes only an exact identity-preserving canonical successor without mutating snapshots", () => {
    const source = JSON.stringify(legacy);
    expect(
      canonicalCreatureMigrationSources([legacy], [canonical])[0],
    ).toMatchObject({
      resourceType: "definitions",
      sourceId: "same-creature",
      payload: { kind: "creature" },
      contentHash: "original",
    });
    expect(JSON.stringify(legacy)).toBe(source);
  });
  it("retains conflicts for different identities, wrong kinds, and ambiguous duplicate records", () => {
    for (const target of [
      [{ ...canonical, sourceId: "different-creature" }],
      [{ ...canonical, payload: { kind: "item" } }],
      [legacy, canonical],
    ])
      expect(canonicalCreatureMigrationSources([legacy], target)[0]).toBe(
        legacy,
      );
    expect(
      canonicalCreatureMigrationSources([legacy, canonical], [canonical])[0],
    ).toBe(legacy);
  });
});
