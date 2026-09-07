import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateWorldDraftDto } from "./world-definition-authoring.dto";

describe("World draft authoring DTOs", () => {
  it("rejects caller-supplied content and records during World creation", async () => {
    const dto = plainToInstance(CreateWorldDraftDto, {
      name: "The Glasswake",
      content: { definitionIds: ["foreign-item"] },
      records: [
        {
          resourceType: "definitions",
          sourceId: "foreign-item",
          payload: { kind: "item" },
        },
      ],
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property).sort()).toEqual([
      "content",
      "records",
    ]);
  });
});
