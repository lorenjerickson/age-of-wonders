import { OpenAiService } from "./openai.service";
import type { HostedConfigurationService } from "../settings/hosted-configuration.service";

describe("OpenAiService", () => {
  afterEach(() => jest.useRealTimers());

  it("always sends an explicit bounded text output budget", async () => {
    const create = jest
      .fn<
        Promise<{ id: string; output_text: string }>,
        [Record<string, unknown>, { signal: AbortSignal }]
      >()
      .mockResolvedValue({
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
      expect.objectContaining({}),
    );
    expect(create.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts provider work at the explicit deadline", async () => {
    jest.useFakeTimers();
    const create = jest.fn(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const service = new OpenAiService({} as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });

    const response = service.respond({ input: "prompt", deadlineMs: 25 });
    const rejection = expect(response).rejects.toMatchObject({ status: 504 });
    await jest.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it("honors caller cancellation independently of the deadline", async () => {
    const controller = new AbortController();
    const create = jest.fn(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const service = new OpenAiService({} as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });

    const response = service.respond({ input: "prompt", signal: controller.signal });
    controller.abort();

    await expect(response).rejects.toMatchObject({ status: 408 });
  });
});
