import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { isObject } from "../domain/domain-resource";
import { MediaService } from "../media/media.service";
import { ObjectStorageService } from "../media/object-storage.service";
import { OpenAiService } from "./openai.service";

const IMAGE_ROLES = ["portrait", "overheadToken", "paperDollToken"] as const;
type ImageRole = (typeof IMAGE_ROLES)[number];

const roleSettings: Record<
  ImageRole,
  {
    size: "1024x1024" | "1024x1536";
    background: "transparent" | "opaque";
    fallback: string;
  }
> = {
  portrait: {
    size: "1024x1536",
    background: "opaque",
    fallback:
      "Create a full-body, player-facing portrait. Show the entire creature without cropping.",
  },
  overheadToken: {
    size: "1024x1024",
    background: "transparent",
    fallback:
      "Create a true orthographic top-down token. Show the creature's entire footprint without a ring, text, or UI.",
  },
  paperDollToken: {
    size: "1024x1024",
    background: "transparent",
    fallback:
      "Create a compact orthographic side-view paper-doll token. Show the entire creature in profile without a frame, text, or UI.",
  },
};

@Injectable()
export class GeneratedCreatureImagesService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly storage: ObjectStorageService,
    private readonly media: MediaService,
  ) {}

  async generate(creature: Record<string, unknown>, worldId: string) {
    const name =
      typeof creature.name === "string" ? creature.name : "Untitled creature";
    const extensions = isObject(creature.extensions) ? creature.extensions : {};
    const briefs = isObject(extensions["aow:image-briefs"])
      ? extensions["aow:image-briefs"]
      : {};
    const shared =
      typeof briefs.sharedVisualIdentity === "string"
        ? briefs.sharedVisualIdentity
        : "";

    const generated = await Promise.all(
      IMAGE_ROLES.map(async (role) => {
        const brief = isObject(briefs[role]) ? briefs[role] : {};
        const authored = [
          brief.imageGenerationPrompt,
          brief.imagePrompt,
          brief.prompt,
        ].find((value): value is string => typeof value === "string");
        const prompt = [
          `Create the ${role} image for the role-playing creature "${name}".`,
          shared,
          authored,
          roleSettings[role].fallback,
          "Keep anatomy, proportions, palette, equipment, and identifying marks consistent with the shared visual identity. Render the creature only; no labels or prose.",
        ]
          .filter(Boolean)
          .join("\n\n");
        return {
          role,
          image: await this.openAi.generateImage(prompt, roleSettings[role]),
        };
      }),
    );

    const assets: Array<{ id: string }> = [];
    try {
      const previousImages = isObject(creature.images) ? creature.images : {};
      const nextImages: Record<string, unknown> = {};
      const responseIds: Record<ImageRole, string> = {} as Record<
        ImageRole,
        string
      >;
      for (const result of generated) {
        const identity = isObject(creature.identity) ? creature.identity : {};
        const tags = [
          "ai-generated",
          "creature-image",
          `creature:${typeof identity.id === "string" ? identity.id : "unknown"}`,
          `world:${worldId}`,
          `role:${result.role}`,
        ];
        const upload = await this.storage.upload(
          Readable.from(result.image.buffer),
          `${name}-${result.role}.webp`,
          result.image.mimeType,
          "creatures",
          tags,
        );
        const asset = await this.media.create(upload, tags);
        assets.push(asset);
        const previousValue = previousImages[result.role];
        const previous = isObject(previousValue) ? previousValue : {};
        nextImages[result.role] = {
          ...previous,
          assetId: asset.id,
          altText:
            typeof previous.altText === "string" && previous.altText.trim()
              ? previous.altText
              : `${result.role} view of ${name}`,
          width: result.image.width,
          height: result.image.height,
          mimeType: result.image.mimeType,
        };
        responseIds[result.role] = result.image.responseId;
      }
      return {
        assets,
        responseIds,
        data: { ...creature, images: nextImages },
      };
    } catch (error) {
      await Promise.all(
        assets.map((asset) =>
          this.media.remove(asset.id).catch(() => undefined),
        ),
      );
      throw error;
    }
  }
}
