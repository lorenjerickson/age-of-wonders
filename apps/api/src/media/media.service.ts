import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ListMediaQueryDto } from "./dto/media.dto";
import type { StoredUpload } from "./object-storage.service";
import { ObjectStorageService } from "./object-storage.service";

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async create(upload: StoredUpload, tags: string[]) {
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          id: upload.id,
          bucket: upload.bucket,
          objectKey: upload.objectKey,
          filename: upload.filename,
          originalName: upload.originalName,
          mimeType: upload.mimeType,
          mediaType: upload.mediaType,
          purpose: upload.purpose,
          size: upload.size,
          etag: upload.etag,
          tags,
        },
      });
    } catch (error) {
      await this.storage.delete(upload.objectKey);
      throw error;
    }
  }

  async list(query: ListMediaQueryDto) {
    const where: Prisma.MediaAssetWhereInput = {
      mediaType: query.mediaType,
      purpose: query.purpose,
      mimeType: query.mimeType,
      originalName: query.search
        ? { contains: query.search, mode: "insensitive" }
        : undefined,
      tags:
        query.tags && query.tags.length > 0
          ? query.tagMode === "any"
            ? { hasSome: query.tags }
            : { hasEvery: query.tags }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async get(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundException(`Media asset '${id}' was not found`);
    return asset;
  }

  async download(id: string) {
    const asset = await this.get(id);
    const expiresIn = 900;
    return {
      url: await this.storage.signedDownloadUrl(
        asset.objectKey,
        asset.originalName,
        expiresIn,
      ),
      expiresIn,
    };
  }

  async remove(id: string): Promise<void> {
    const asset = await this.get(id);
    await this.storage.delete(asset.objectKey);
    await this.prisma.mediaAsset.delete({ where: { id } });
  }
}
