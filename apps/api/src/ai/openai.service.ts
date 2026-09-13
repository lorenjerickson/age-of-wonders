import {
  GatewayTimeoutException,
  Injectable,
  RequestTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import OpenAI from "openai";
import { HostedConfigurationService } from "../settings/hosted-configuration.service";

interface RespondInput {
  input: string;
  instructions?: string;
  maxOutputTokens?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_PROVIDER_DEADLINE_MS = 60_000;
const MAX_PROVIDER_DEADLINE_MS = 120_000;
// High-quality images need more time than text. Keep this below the web proxy's
// five-minute upstream header timeout, leaving room for upload and persistence.
const IMAGE_PROVIDER_DEADLINE_MS = 240_000;

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  responseId: string;
}

export interface GenerateImageOptions {
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  background?: "transparent" | "opaque" | "auto";
}

@Injectable()
export class OpenAiService {
  constructor(private readonly configuration: HostedConfigurationService) {}

  async respond(request: RespondInput) {
    const { input, instructions, maxOutputTokens, deadlineMs, signal } =
      request;
    const { client, model } = await this.connection();
    if (!client) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured on the API service.",
      );
    }

    const boundary = providerBoundary(signal, deadlineMs);
    try {
      boundary.rethrowIfAborted();
      const response = await client.responses.create(
        {
          model,
          input,
          instructions,
          max_output_tokens: maxOutputTokens ?? 8_000,
        },
        { signal: boundary.signal },
      );
      return { output: response.output_text, responseId: response.id, model };
    } catch (error) {
      boundary.rethrowIfAborted();
      throw error;
    } finally {
      boundary.dispose();
    }
  }

  async generateImage(
    prompt: string,
    options: GenerateImageOptions = {},
  ): Promise<GeneratedImage> {
    const { client, model } = await this.connection();
    if (!client) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured on the API service.",
      );
    }

    const boundary = providerBoundary(
      undefined,
      IMAGE_PROVIDER_DEADLINE_MS,
      IMAGE_PROVIDER_DEADLINE_MS,
    );
    try {
      const response = await client.responses.create(
        {
          model,
          input: prompt,
          tool_choice: { type: "image_generation" },
          tools: [
            {
              type: "image_generation",
              background: options.background ?? "opaque",
              output_format: "webp",
              quality: "high",
              size: options.size ?? "1536x1024",
            },
          ],
        },
        {
          signal: boundary.signal,
          timeout: IMAGE_PROVIDER_DEADLINE_MS,
          maxRetries: 0,
        },
      );
      const image = response.output.find(
        (item) => item.type === "image_generation_call" && item.result,
      );
      if (!image || image.type !== "image_generation_call" || !image.result) {
        throw new ServiceUnavailableException(
          "The image generation service did not return an image.",
        );
      }

      const [width, height] = (options.size ?? "1536x1024")
        .split("x")
        .map(Number);
      return {
        buffer: Buffer.from(image.result, "base64"),
        mimeType: "image/webp",
        width,
        height,
        responseId: response.id,
      };
    } catch (error) {
      if (
        boundary.signal.aborted ||
        error instanceof OpenAI.APIConnectionTimeoutError
      ) {
        throw new GatewayTimeoutException(
          "Image generation did not finish within four minutes. Please try again.",
        );
      }
      throw error;
    } finally {
      boundary.dispose();
    }
  }

  private async connection() {
    const [apiKey, model] = await Promise.all([
      this.configuration.openAiApiKey(),
      this.configuration.openAiModel(),
    ]);
    return {
      client: apiKey
        ? new OpenAI({
            apiKey,
            maxRetries: 0,
            timeout: MAX_PROVIDER_DEADLINE_MS,
          })
        : null,
      model,
    };
  }
}

function providerBoundary(
  callerSignal?: AbortSignal,
  requestedDeadline?: number,
  maximumDeadline = MAX_PROVIDER_DEADLINE_MS,
) {
  const deadlineMs =
    requestedDeadline === undefined
      ? DEFAULT_PROVIDER_DEADLINE_MS
      : requestedDeadline;
  if (
    !Number.isInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > maximumDeadline
  ) {
    throw new RangeError(
      "AI provider deadline is outside the supported range.",
    );
  }
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) cancel();
  else callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadlineMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", cancel);
    },
    rethrowIfAborted() {
      if (!controller.signal.aborted) return;
      if (timedOut) {
        throw new GatewayTimeoutException(
          "The AI provider did not respond before the request deadline.",
        );
      }
      throw new RequestTimeoutException("The AI request was cancelled.");
    },
  };
}
