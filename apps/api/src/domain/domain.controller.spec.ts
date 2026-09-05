import { ConflictException } from "@nestjs/common";
import { DomainController } from "./domain.controller";

describe("DomainController legacy Campaign quarantine", () => {
  it("rejects create, replace, and delete while preserving read routes", async () => {
    const domain = {
      create: jest.fn(), replace: jest.fn(), remove: jest.fn(),
      list: jest.fn(), get: jest.fn(),
    };
    const controller = new DomainController(domain as never);
    expect(() => controller.create("campaigns", { data: {} })).toThrow(ConflictException);
    expect(() => controller.replace("campaigns", "legacy", { data: {} })).toThrow(ConflictException);
    await expect(controller.remove("campaigns", "legacy")).rejects.toBeInstanceOf(ConflictException);
    expect(domain.create).not.toHaveBeenCalled();
    expect(domain.replace).not.toHaveBeenCalled();
    expect(domain.remove).not.toHaveBeenCalled();
    await controller.list("campaigns", {} as never);
    await controller.get("campaigns", "legacy");
    expect(domain.list).toHaveBeenCalled();
    expect(domain.get).toHaveBeenCalled();
  });
});
