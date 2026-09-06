import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import OpenAI from "openai";
import { HostedConfigurationService } from "../settings/hosted-configuration.service";

interface RespondInput {
  input: string;
  instructions?: string;
  maxOutputTokens?: number;
}

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

  async respond({ input, instructions, maxOutputTokens }: RespondInput) {
    const { client, model } = await this.connection();
    if (!client) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured on the API service.",
      );
    }

    const response = await client.responses.create({
      model,
      input,
      instructions,
      max_output_tokens: maxOutputTokens ?? 8_000,
    });

    return { output: response.output_text, responseId: response.id, model };
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

    const response = await client.responses.create({
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
    });
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
  }

  private async connection() {
    const [apiKey, model] = await Promise.all([
      this.configuration.openAiApiKey(),
      this.configuration.openAiModel(),
    ]);
    return { client: apiKey ? new OpenAI({ apiKey }) : null, model };
  }
}
