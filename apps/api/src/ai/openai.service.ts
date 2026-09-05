import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

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
  private readonly client: OpenAI | null;
  readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.model = this.config.get<string>("OPENAI_MODEL", "gpt-5.6-terra");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async respond({ input, instructions, maxOutputTokens }: RespondInput) {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured on the API service.",
      );
    }

    const response = await this.client.responses.create({
      model: this.model,
      input,
      instructions,
      max_output_tokens: maxOutputTokens ?? 8_000,
    });

    return { output: response.output_text, responseId: response.id };
  }

  async generateImage(
    prompt: string,
    options: GenerateImageOptions = {},
  ): Promise<GeneratedImage> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is not configured on the API service.",
      );
    }

    const response = await this.client.responses.create({
      model: this.model,
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
}
