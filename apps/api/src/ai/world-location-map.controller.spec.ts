import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  WorldLocationMapController,
  GenerateLocationMapDto,
} from "./world-location-map.controller";
import { PaidAiRequestGate } from "./paid-ai-request-gate";
import type { WorldDefinitionAuthoringService } from "../world-definitions/world-definition-authoring.service";
import type { GeneratedMapService } from "./generated-map.service";
import type { GenerationAuditService } from "./generation-audit.service";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/auth.types";
const dto: GenerateLocationMapDto = {
  expectedStorageRevision: 2,
  direction: "A foggy overhead map",
  orientation: "overhead",
};
const request = { user: { id: "gm" }, ip: "local" } as Request &
  AuthenticatedRequest;
function setup(
  records: unknown[] = [
    {
      sourceId: "location",
      resourceType: "locations",
      payload: {
        name: "London",
        description: "Public",
        gmDescription: "Secret",
        discoveries: [{ statement: "Never send" }],
      },
    },
  ],
) {
  const getActiveDraft = jest
    .fn()
    .mockResolvedValue({ storageRevision: 2, records });
  const generate = jest.fn().mockResolvedValue({
    data: { image: { assetId: "map" } },
    asset: { id: "map", originalName: "London.webp", mimeType: "image/webp" },
    imageResponseId: "response",
  });
  const audit = jest.fn().mockResolvedValue({ id: "audit" });
  return {
    getActiveDraft,
    generate,
    audit,
    controller: new WorldLocationMapController(
      { getActiveDraft } as unknown as WorldDefinitionAuthoringService,
      { generate } as unknown as GeneratedMapService,
      new PaidAiRequestGate(),
      { record: audit } as unknown as GenerationAuditService,
    ),
  };
}
it("generates an owned preview once, excludes private notes, and records an audit", async () => {
  const { controller, generate, getActiveDraft, audit } = setup();
  const result = await controller.generate(
    "world",
    "location",
    request,
    "map-request-1",
    dto,
  );
  await controller.generate("world", "location", request, "map-request-1", dto);
  expect(result.image).toEqual({ assetId: "map" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(getActiveDraft).toHaveBeenCalledWith("world", "gm");
  expect(JSON.stringify(generate.mock.calls)).not.toMatch(/Secret|Never send/);
  expect((generate.mock.calls as unknown[][])[0][3]).toEqual({
    worldId: "world",
    userId: "gm",
  });
  expect(audit).toHaveBeenCalledTimes(1);
});
it("rejects stale drafts and foreign or missing Locations before charging for generation", async () => {
  const stale = setup();
  stale.getActiveDraft.mockResolvedValue({ storageRevision: 3, records: [] });
  await expect(
    stale.controller.generate(
      "world",
      "location",
      request,
      "map-request-2",
      dto,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(stale.generate).not.toHaveBeenCalled();
  const missing = setup([]);
  await expect(
    missing.controller.generate(
      "world",
      "location",
      request,
      "map-request-3",
      dto,
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(missing.generate).not.toHaveBeenCalled();
});
it("previews an unsaved Location without requiring a record or exposing private fields", async () => {
  const f = setup([]);
  const input = {
    ...dto,
    name: "New harbor",
    description: "Public coastline",
    kind: "settlement",
    gmDescription: "Hidden faction",
  };
  const result = await f.controller.generate(
    "world",
    "",
    request,
    "new-location-map",
    input,
  );
  expect(result.storageRevision).toBe(2);
  expect(f.generate).toHaveBeenCalledWith(
    {
      name: "New harbor",
      description: "Public coastline",
      kind: "settlement",
      image: { orientation: "overhead" },
    },
    ["location-map"],
    "overhead view. A foggy overhead map",
    { worldId: "world", userId: "gm" },
  );
  expect(JSON.stringify(f.generate.mock.calls)).not.toContain("Hidden faction");
  expect(f.audit).toHaveBeenCalledTimes(1);
});
