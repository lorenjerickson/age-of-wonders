import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { WorldDefinitionsController } from "./world-definitions.controller";

describe("WorldDefinitionsController", () => {
  it("delegates list and selected-lineage reads", async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      get: jest.fn().mockResolvedValue({ name: "The Glasswake" }),
    };
    const authoring = {
      create: jest.fn().mockResolvedValue({ name: "The Ember Sea" }),
      publish: jest
        .fn()
        .mockResolvedValue({ name: "The Glasswake, Second Edition" }),
    };
    const controller = new WorldDefinitionsController(
      service,
      authoring as never,
    );
    const request = {
      headers: {},
      user: { id: "gm-1", displayName: "GM", role: UserRole.GM },
    } as Request & AuthenticatedRequest;

    await expect(controller.list(request)).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(controller.get("world-lineage-1", request)).resolves.toEqual({
      name: "The Glasswake",
    });
    expect(service.list).toHaveBeenCalledWith("gm-1");
    expect(service.get).toHaveBeenCalledWith("world-lineage-1", "gm-1");

    const publication = {
      name: "The Ember Sea",
      content: { rootLocationId: "ember-port" },
      snapshotManifest: {
        formatVersion: 1,
        records: [
          {
            resourceType: "locations",
            sourceId: "ember-port",
            payload: { name: "Ember Port" },
          },
        ],
      },
    };
    await expect(controller.create(request, publication)).resolves.toEqual({
      name: "The Ember Sea",
    });
    expect(authoring.create).toHaveBeenCalledWith(publication, "gm-1");

    const revision = { expectedStorageRevision: 4 };
    await expect(
      controller.publishDraft("world-lineage-1", request, revision),
    ).resolves.toEqual({ name: "The Glasswake, Second Edition" });
    expect(authoring.publish).toHaveBeenCalledWith(
      "world-lineage-1",
      revision,
      "gm-1",
    );
  });

  it("requires the current GM guard for every endpoint", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, WorldDefinitionsController),
    ).toContain(GmGuard);
  });
});
