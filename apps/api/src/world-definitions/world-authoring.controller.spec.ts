import { NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { WorldAuthoringController } from "./world-authoring.controller";

const request = {
  user: { id: "gm-1", displayName: "Game Master" },
} as Request & AuthenticatedRequest;

describe("WorldAuthoringController", () => {
  it("bounds the canonical World library and preserves its deterministic order", async () => {
    const worlds = {
      list: jest.fn().mockResolvedValue({
        items: [{ name: "A" }, { name: "B" }, { name: "C" }],
        total: 3,
      }),
      get: jest.fn(),
    };
    const subject = new WorldAuthoringController(
      worlds,
      {} as never,
      {} as never,
    );

    await expect(subject.list(request, "1", "1")).resolves.toEqual({
      items: [{ name: "B" }],
      total: 3,
      limit: 1,
      offset: 1,
    });
    expect(worlds.list).toHaveBeenCalledWith("gm-1");
  });

  it("scopes revision and library records through the selected World", async () => {
    const worlds = {
      list: jest.fn(),
      get: jest.fn().mockResolvedValue({ revisions: [{ id: "revision-1" }] }),
    };
    const authoring = {
      getDraft: jest.fn().mockResolvedValue({
        records: [
          {
            resourceType: "definitions",
            sourceId: "creature-1",
            payload: { kind: "creature", name: "Bell Keeper" },
          },
        ],
      }),
    };
    const subject = new WorldAuthoringController(
      worlds,
      authoring as never,
      {} as never,
    );

    await expect(
      subject.revision("world-1", "revision-1", request),
    ).resolves.toEqual({ id: "revision-1" });
    await expect(
      subject.creature("world-1", "creature-1", request),
    ).resolves.toEqual(expect.objectContaining({ sourceId: "creature-1" }));
    expect(worlds.get).toHaveBeenCalledWith("world-1", "gm-1");
    expect(authoring.getDraft).toHaveBeenCalledWith("world-1", "gm-1");
  });

  it("returns a neutral miss when a real child is not in the selected World", async () => {
    const worlds = {
      list: jest.fn(),
      get: jest
        .fn()
        .mockResolvedValue({ revisions: [{ id: "revision-other" }] }),
    };
    const subject = new WorldAuthoringController(
      worlds,
      {} as never,
      {} as never,
    );

    await expect(
      subject.revision("world-1", "revision-1", request),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("resolves model adoption beneath the owning World", async () => {
    const modelRegistries = { effective: jest.fn().mockResolvedValue({}) };
    const subject = new WorldAuthoringController(
      {} as never,
      {} as never,
      modelRegistries as never,
    );

    await subject.modelAdoptions("world-1", request);

    expect(modelRegistries.effective).toHaveBeenCalledWith("world-1", "gm-1");
  });
});
