import { BadRequestException } from "@nestjs/common";
import { assertDomainResource, readResourceMetadata } from "./domain-resource";

describe("domain resource registry", () => {
  it("extracts definition metadata", () => {
    expect(
      readResourceMetadata("definitions", {
        identity: {
          id: "core:plasma-projection",
          name: "Directed Plasma Projection",
        },
        kind: "discipline",
      }),
    ).toEqual({
      id: "core:plasma-projection",
      kind: "discipline",
      name: "Directed Plasma Projection",
    });
  });

  it("uses the campaign ID for a game snapshot", () => {
    expect(
      readResourceMetadata("games", {
        campaign: {
          identity: { id: "campaign-1" },
          name: "The Long Night",
        },
      }),
    ).toEqual({
      id: "campaign-1",
      kind: "game-state",
      name: "The Long Night",
    });
  });

  it("extracts campaign definition metadata", () => {
    expect(
      readResourceMetadata("campaigns", {
        identity: { id: "campaign-1" },
        name: "The Hound of Greybridge",
        worldId: "greybridge",
      }),
    ).toEqual({
      id: "campaign-1",
      name: "The Hound of Greybridge",
    });
  });

  it("rejects a state without its canonical ID", () => {
    expect(() =>
      readResourceMetadata("characters", {
        identity: {},
        name: "Ada",
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects unknown resources", () => {
    expect(() => assertDomainResource("widgets")).toThrow(BadRequestException);
  });
});
