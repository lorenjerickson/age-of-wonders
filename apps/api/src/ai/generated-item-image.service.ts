import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { isObject } from "../domain/domain-resource";
import { MediaService } from "../media/media.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { OpenAiService } from "./openai.service";

@Injectable()
export class GeneratedItemImageService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly storage: ObjectStorageService,
    private readonly media: MediaService,
  ) {}

  async generate(definition: Record<string, unknown>, worldId: string) {
    const identity = isObject(definition.identity) ? definition.identity : {};
    const name =
      typeof identity.name === "string" ? identity.name : "Untitled item";
    const components = isObject(definition.components)
      ? definition.components
      : {};
    const extensions = isObject(definition.extensions)
      ? definition.extensions
      : {};
    const brief = isObject(extensions["aow:image-brief"])
      ? extensions["aow:image-brief"]
      : {};
    const authored = [
      brief.imageGenerationPrompt,
      brief.imagePrompt,
      brief.prompt,
    ].find((value): value is string => typeof value === "string");
    const prompt = [
      `Create a square inventory illustration of the role-playing item "${name}".`,
      typeof identity.description === "string" ? identity.description : "",
      authored,
      `Item category: ${typeof components.category === "string" ? components.category : "equipment"}.`,
      "Show exactly one complete standalone item, fully visible and centered, at a clear three-quarter product angle. Use a transparent background, even readable lighting, and generous padding. Preserve its materials, construction, scale cues, wear, colors, and setting-specific details. No person, mannequin, hand, creature, scenery, frame, icon border, labels, letters, numbers, watermark, or interface.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const image = await this.openAi.generateImage(prompt, {
      size: "1024x1024",
      background: "transparent",
    });
    const tags = [
      "ai-generated",
      "item-image",
      `item:${typeof identity.id === "string" ? identity.id : "unknown"}`,
      `world:${worldId}`,
    ];
    const upload = await this.storage.upload(
      Readable.from(image.buffer),
      `${name}-inventory.webp`,
      image.mimeType,
      "items",
      tags,
    );
    const asset = await this.media.create(upload, tags);
    return {
      asset,
      prompt,
      responseId: image.responseId,
      data: {
        ...definition,
        image: {
          assetId: asset.id,
          altText: `Inventory view of ${name}`,
          width: image.width,
          height: image.height,
          mimeType: image.mimeType,
        },
      },
    };
  }
}
