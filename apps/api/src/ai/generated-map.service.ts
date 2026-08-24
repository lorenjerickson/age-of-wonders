import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { isObject } from "../domain/domain-resource";
import { MediaService } from "../media/media.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { OpenAiService } from "./openai.service";

@Injectable()
export class GeneratedMapService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly storage: ObjectStorageService,
    private readonly media: MediaService,
  ) {}

  async generate(
    location: Record<string, unknown>,
    tags: string[],
    additionalContext?: string,
  ) {
    const name =
      typeof location.name === "string" ? location.name : "Untitled location";
    const description =
      typeof location.description === "string" ? location.description : "";
    const extensions = isObject(location.extensions)
      ? location.extensions
      : {};
    const brief = isObject(extensions["aow:map-brief"])
      ? extensions["aow:map-brief"]
      : {};
    const authoredPrompt = [
      brief.imageGenerationPrompt,
      brief.imagePrompt,
      brief.prompt,
    ].find((value): value is string => typeof value === "string") ?? "";
    const prompt = [
      `Create a richly detailed cartographic map for the role-playing location "${name}".`,
      description,
      authoredPrompt,
      additionalContext,
      "The image must be a map only: no UI, frame, mockup, hands, or surrounding table. Use legible invented cartographic marks and do not render a title or blocks of prose.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const generated = await this.openAi.generateImage(prompt);
    const upload = await this.storage.upload(
      Readable.from(generated.buffer),
      `${name}.webp`,
      generated.mimeType,
      "maps",
      tags,
    );
    const asset = await this.media.create(upload, tags);
    const previous = isObject(location.image) ? location.image : {};
    const nextImage: Record<string, unknown> = {
      ...previous,
      assetId: asset.id,
      altText:
        typeof previous.altText === "string" && previous.altText.trim()
          ? previous.altText
          : `Map of ${name}`,
      width: generated.width,
      height: generated.height,
      mimeType: generated.mimeType,
    };
    delete nextImage.uri;
    return {
      asset,
      imageResponseId: generated.responseId,
      data: {
        ...location,
        image: nextImage,
      },
    };
  }
}
