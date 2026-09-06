import { OpenAiService } from "./openai.service";
import type { HostedConfigurationService } from "../settings/hosted-configuration.service";

describe("OpenAiService", () => {
  it("always sends an explicit bounded text output budget", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "response",
      output_text: "result",
    });
    const service = new OpenAiService({} as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });

    await service.respond({ input: "prompt", maxOutputTokens: 2_000 });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_output_tokens: 2_000 }),
    );
  });
});
