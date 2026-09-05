import { ConfigService } from "@nestjs/config";
import { OpenAiService } from "./openai.service";

describe("OpenAiService", () => {
  it("always sends an explicit bounded text output budget", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "response",
      output_text: "result",
    });
    const service = new OpenAiService({
      get: jest.fn((_name: string, fallback?: string) => fallback),
    } as unknown as ConfigService);
    Object.defineProperty(service, "client", {
      value: { responses: { create } },
    });

    await service.respond({ input: "prompt", maxOutputTokens: 2_000 });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_output_tokens: 2_000 }),
    );
  });
});
