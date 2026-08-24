import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { BadRequestException } from "@nestjs/common";

export const MEDIA_TYPES = [
  "images",
  "audio",
  "video",
  "documents",
  "archives",
  "models",
  "fonts",
  "files",
] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/flac": ".flac",
  "audio/mp4": ".m4a",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/gzip": ".gz",
  "application/json": ".json",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

export function mediaTypeForMimeType(mimeType: string): MediaType {
  const family = mimeType.toLowerCase().split("/", 1)[0];
  if (family === "image") return "images";
  if (family === "audio") return "audio";
  if (family === "video") return "video";
  if (family === "model") return "models";
  if (family === "font") return "fonts";
  if (family === "text" || mimeType === "application/pdf") return "documents";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/x-7z-compressed"
  ) {
    return "archives";
  }
  return "files";
}

function extensionFor(mimeType: string, originalName: string): string {
  const known = MIME_EXTENSIONS[mimeType.toLowerCase()];
  if (known) return known;
  const originalExtension = extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(originalExtension) ? originalExtension : "";
}

export function assertPurpose(purpose: string): string {
  const normalized = purpose.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(normalized)) {
    throw new BadRequestException(
      "purpose must contain 1-63 lowercase letters, numbers, or hyphens",
    );
  }
  return normalized;
}

export interface GeneratedMediaKey {
  id: string;
  filename: string;
  objectKey: string;
  mediaType: MediaType;
  purpose: string;
}

export function generateMediaKey(
  mimeType: string,
  purposeValue: string,
  originalName: string,
): GeneratedMediaKey {
  const id = randomUUID();
  const mediaType = mediaTypeForMimeType(mimeType);
  const purpose = assertPurpose(purposeValue);
  const filename = `${id}${extensionFor(mimeType, originalName)}`;
  return {
    id,
    filename,
    objectKey: `${mediaType}/${purpose}/${filename}`,
    mediaType,
    purpose,
  };
}
