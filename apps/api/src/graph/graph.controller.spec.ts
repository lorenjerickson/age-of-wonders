import { ConflictException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { SystemAdministratorGuard } from "../auth/auth.guard";
import { GraphController } from "./graph.controller";

describe("GraphController operational boundary", () => {
  it("requires System Administrator authority", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GraphController)).toContain(
      SystemAdministratorGuard,
    );
  });

  it("rejects direct tuple mutation", () => {
    const graph = { put: jest.fn(), remove: jest.fn() };
    const controller = new GraphController(graph as never);

    expect(() =>
      controller.create({
        triples: [{ subject: "a", predicate: "b", object: "c" }],
      }),
    ).toThrow(ConflictException);
    expect(() =>
      controller.remove({ pattern: { subject: "a", limit: 10 } }),
    ).toThrow(ConflictException);
    expect(graph.put).not.toHaveBeenCalled();
    expect(graph.remove).not.toHaveBeenCalled();
  });
});
