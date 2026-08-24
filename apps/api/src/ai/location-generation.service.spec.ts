import { BadGatewayException } from "@nestjs/common";
import { DomainService } from "../domain/domain.service";
import { MediaService } from "../media/media.service";
import { AiPromptService } from "./ai-prompt.service";
import { GeneratedMapService } from "./generated-map.service";
import { LocationGenerationService } from "./location-generation.service";
import { OpenAiService } from "./openai.service";

describe("LocationGenerationService", () => {
  function serviceFor(output: Record<string, unknown>) {
    const create = jest.fn((resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ resource, data }),
    );
    const domain = {
      get: jest.fn(() =>
        Promise.resolve({
          data: {
            identity: { id: "parent-1" },
            name: "Parent",
            kind: "region",
          },
        }),
      ),
      create,
    } as unknown as DomainService;
    const service = new LocationGenerationService(
      {
        read: jest.fn((fileName: string) => Promise.resolve(`# ${fileName}`)),
      } as unknown as AiPromptService,
      {
        respond: jest.fn(() =>
          Promise.resolve({
            output: JSON.stringify(output),
            responseId: "response-1",
          }),
        ),
      } as unknown as OpenAiService,
      {
        generate: jest.fn((data: Record<string, unknown>) =>
          Promise.resolve({
            data,
            asset: { id: "asset-1" },
            imageResponseId: "image-response-1",
          }),
        ),
      } as unknown as GeneratedMapService,
      { remove: jest.fn() } as unknown as MediaService,
      domain,
    );
    return { service, create };
  }

  it("preserves a generated plane with an observed physical environment", async () => {
    const { service, create } = serviceFor({
      name: "The Pressure Fold",
      kind: "plane",
      physicalEnvironment: {
        kind: "field-contained-region",
        understanding: "hypothesized",
        observedProperties: ["Atmospheric pressure cycles every eleven hours."],
      },
    });

    await service.create("parent-1", "A nearby anomalous region.");

    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0]?.[1];
    expect(created?.kind).toBe("plane");
    expect(created?.physicalEnvironment).toEqual({
      kind: "field-contained-region",
      understanding: "hypothesized",
      observedProperties: ["Atmospheric pressure cycles every eleven hours."],
    });
  });

  it("rejects a generated plane without observed physical properties", async () => {
    const { service, create } = serviceFor({
      name: "The Unmeasured Elsewhere",
      kind: "plane",
      physicalEnvironment: {
        kind: "unknown",
        understanding: "unknown",
        observedProperties: [],
      },
    });

    await expect(
      service.create("parent-1", "An unknown place."),
    ).rejects.toThrow(BadGatewayException);
    expect(create).not.toHaveBeenCalled();
  });
});
