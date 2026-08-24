import { tuplesForDomainResource } from "./graph-tuples";

describe("domain graph tuple generation", () => {
  it("creates metadata and reference tuples", () => {
    const tuples = tuplesForDomainResource(
      "locations",
      "location:inn",
      {
        identity: { id: "location:inn" },
        placement: {
          kind: "within-parent",
          parentLocationId: "location:town",
        },
        sceneIds: ["scene:common-room", "scene:cellar"],
        profile: {
          culture: { heritageCandidateIds: ["heritage:local"] },
        },
      },
      "site",
      "The Silver Stag",
    );

    expect(tuples).toEqual(
      expect.arrayContaining([
        {
          subject: "location:inn",
          predicate: "aow:resource",
          object: "locations",
        },
        {
          subject: "location:inn",
          predicate: "aow:parentLocation",
          object: "location:town",
        },
        {
          subject: "location:inn",
          predicate: "aow:scene",
          object: "scene:cellar",
        },
        {
          subject: "location:inn",
          predicate: "aow:heritageCandidate",
          object: "heritage:local",
        },
      ]),
    );
  });

  it("deduplicates repeated references", () => {
    const tuples = tuplesForDomainResource("scenes", "scene:one", {
      identity: { id: "scene:one" },
      name: "One",
      entityIds: ["entity:a", "entity:a"],
    });

    expect(
      tuples.filter(
        ({ predicate, object }) =>
          predicate === "aow:entity" && object === "entity:a",
      ),
    ).toHaveLength(1);
  });
});
