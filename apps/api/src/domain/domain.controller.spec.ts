import { ConflictException } from "@nestjs/common";
import { DomainController } from "./domain.controller";

describe("DomainController legacy runtime quarantine", () => {
  it.each([
    "campaigns",
    "games",
    "sessions",
    "scenes",
    "encounters",
    "pending-decisions",
    "game-events",
  ])("rejects %s create, replace, and delete while preserving read routes", async (resource) => {
    const domain = {
      create: jest.fn(), replace: jest.fn(), remove: jest.fn(),
      list: jest.fn(), get: jest.fn(),
    };
    const controller = new DomainController(domain as never);
    expect(() => controller.create(resource, { data: {} })).toThrow(ConflictException);
    expect(() => controller.replace(resource, "legacy", { data: {} })).toThrow(ConflictException);
    await expect(controller.remove(resource, "legacy")).rejects.toBeInstanceOf(ConflictException);
    expect(domain.create).not.toHaveBeenCalled();
    expect(domain.replace).not.toHaveBeenCalled();
    expect(domain.remove).not.toHaveBeenCalled();
    await controller.list(resource, {} as never);
    await controller.get(resource, "legacy");
    expect(domain.list).toHaveBeenCalled();
    expect(domain.get).toHaveBeenCalled();
  });
});
