import { describe, expect, it } from "vitest";
import {
  discoveryClaims,
  putDiscoveryClaims,
  plotClaimReferences,
  putPlotChild,
  type ChildRecord,
} from "./campaignPlotCollectionModel";

describe("Plot child identity and references", () => {
  it("keeps reference checks scoped to the owning Plot when claim IDs repeat", () => {
    const owning: ChildRecord = {
      discoveries: [
        {
          name: "Here",
          claims: [{ id: "shared", kind: "truth", statement: "Local truth" }],
        },
      ],
    };
    const other: ChildRecord = {
      discoveries: [
        {
          name: "Elsewhere",
          claims: [
            {
              id: "rumor",
              kind: "rumor",
              statement: "Other rumor",
              relatedTruthClaimId: "shared",
            },
          ],
        },
      ],
    };
    expect(plotClaimReferences(owning, new Set(["shared"]))).toEqual([]);
    expect(plotClaimReferences(other, new Set(["shared"]))).toEqual([
      "Elsewhere: Other rumor",
    ]);
  });
  it("edits and appends by identity while preserving duplicate names and rich siblings", () => {
    const first: ChildRecord = {
      id: "first",
      name: "Same",
      extensions: { secret: { nested: true } },
    };
    const second: ChildRecord = {
      id: "second",
      name: "Same",
      description: "Rich",
    };
    const result = putPlotChild([first, second], {
      ...second,
      name: "Updated",
    });
    expect(result[0]).toBe(first);
    expect(result[1]).toEqual({ ...second, name: "Updated" });
    expect(putPlotChild(result, { id: "third", name: "Same" })).toHaveLength(3);
  });
  it("blocks truth and conflict references across discoveries, ignoring claims also removed", () => {
    const plot: ChildRecord = {
      discoveries: [
        {
          id: "one",
          name: "First",
          claims: [
            { id: "truth", kind: "truth", statement: "True" },
            {
              id: "inside",
              kind: "rumor",
              relatedTruthClaimId: "truth",
              statement: "Inside",
            },
          ],
        },
        {
          id: "two",
          name: "Second",
          claims: [
            {
              id: "outside",
              kind: "belief",
              conflictsWithClaimIds: ["truth"],
              statement: "Opposes",
            },
          ],
        },
      ],
    };
    expect(plotClaimReferences(plot, new Set(["truth"]))).toEqual([
      "First: Inside",
      "Second: Opposes",
    ]);
    expect(plotClaimReferences(plot, new Set(["truth", "inside"]))).toEqual([
      "Second: Opposes",
    ]);
    expect(
      plotClaimReferences(plot, new Set(["truth", "inside", "outside"])),
    ).toEqual([]);
  });
});

describe("canonical discovery editing", () => {
  it("keeps beliefs and rumors visible while a truth is unfinished", () => {
    expect(
      discoveryClaims({
        truth: { id: "t", statement: "" },
        beliefs: [{ id: "b", statement: "Belief", relation: "supports" }],
        rumors: [],
      }),
    ).toEqual([
      { id: "b", statement: "Belief", relation: "supports", kind: "belief" },
    ]);
  });
  it("does not resurrect a deleted truth or lose the remaining facets", () => {
    const discovery = {
      truth: { id: "t", statement: "Old truth" },
      beliefs: [{ id: "b", statement: "Belief", relation: "supports" }],
      rumors: [],
      extensions: { custom: true },
    };
    const next = putDiscoveryClaims(
      discovery,
      discoveryClaims(discovery).filter((c) => c.id !== "t"),
    );
    expect(next.truth).toEqual({ id: "t", statement: "" });
    expect(discoveryClaims(next)).toHaveLength(1);
    expect(next.extensions).toEqual({ custom: true });
  });
  it("converts truth to rumor without retaining a second copy as truth", () => {
    const next = putDiscoveryClaims(
      { truth: { id: "t", statement: "Old truth" } },
      [
        {
          id: "t",
          kind: "rumor",
          statement: "Uncertain",
          relation: "contradicts",
          provenance: "Witness",
        },
      ],
    );
    expect(discoveryClaims(next)).toEqual([
      {
        id: "t",
        kind: "rumor",
        statement: "Uncertain",
        relation: "contradicts",
        provenance: "Witness",
      },
    ]);
  });
});
