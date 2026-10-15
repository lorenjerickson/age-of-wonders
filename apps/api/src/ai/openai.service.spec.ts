import OpenAI from "openai";
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
    const service = new OpenAiService({
      openAiImageModel: () => "configured-image-model",
    } as HostedConfigurationService);
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
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const service = new OpenAiService({
      openAiImageModel: () => "configured-image-model",
    } as HostedConfigurationService);
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

  it("allows high-quality image generation to finish after the text client's two-minute limit", async () => {
    jest.useFakeTimers();
    const create = jest.fn(
      (_body: unknown, options: { signal: AbortSignal; timeout: number }) =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: "image-response",
                output: [
                  {
                    type: "image_generation_call",
                    result: Buffer.from("image").toString("base64"),
                  },
                ],
              }),
            180_000,
          );
          expect(options.timeout).toBe(240_000);
        }),
    );
    const service = new OpenAiService({
      openAiImageModel: () => "configured-image-model",
    } as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });
    const result = service.generateImage("Strict overhead token", {
      size: "1024x1024",
      background: "transparent",
    });
    await jest.advanceTimersByTimeAsync(120_000);
    expect(create.mock.calls[0][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(60_000);
    await expect(result).resolves.toMatchObject({
      width: 1024,
      height: 1024,
      responseId: "image-response",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test",
        tools: [
          expect.objectContaining({
            model: "configured-image-model",
            quality: "high",
            background: "transparent",
            size: "1024x1024",
            output_format: "webp",
          }),
        ],
      }),
      expect.objectContaining({ timeout: 240_000, maxRetries: 0 }),
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it("aborts images at four minutes and reports a gateway timeout without retrying", async () => {
    jest.useFakeTimers();
    const create = jest.fn(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const service = new OpenAiService({
      openAiImageModel: () => "configured-image-model",
    } as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });
    const result = service.generateImage("image");
    const rejection = expect(result).rejects.toMatchObject({ status: 504 });
    await jest.advanceTimersByTimeAsync(240_000);
    await rejection;
    expect(create).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("translates an SDK image timeout into a gateway timeout", async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new OpenAI.APIConnectionTimeoutError());
    const service = new OpenAiService({
      openAiImageModel: () => "configured-image-model",
    } as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });
    await expect(service.generateImage("image")).rejects.toMatchObject({
      status: 504,
    });
  });

  it("honors caller cancellation independently of the deadline", async () => {
    const controller = new AbortController();
    const create = jest.fn(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const service = new OpenAiService({
      openAiImageModel: () => "configured-image-model",
    } as HostedConfigurationService);
    Object.defineProperty(service, "connection", {
      value: jest.fn().mockResolvedValue({
        client: { responses: { create } },
        model: "gpt-test",
      }),
    });

    const response = service.respond({
      input: "prompt",
      signal: controller.signal,
    });
    controller.abort();

    await expect(response).rejects.toMatchObject({ status: 408 });
  });
});
