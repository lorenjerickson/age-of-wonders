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

  async create(
    upload: StoredUpload,
    tags: string[],
    ownership?: { userId: string; scopeType?: string; scopeId?: string },
  ) {
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
          createdByUserId: ownership?.userId,
          scopeType: ownership?.scopeType,
          scopeId: ownership?.scopeId,
        },
      });
    } catch (error) {
      await this.storage.delete(upload.objectKey);
      throw error;
    }
  }

  async createForWorld(
    worldDefinitionId: string,
    userId: string,
    upload: StoredUpload,
    tags: string[],
  ) {
    const world = await this.prisma.worldDefinition.findFirst({
      where: { id: worldDefinitionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!world) {
      await this.storage.delete(upload.objectKey);
      throw new NotFoundException("The selected World was not found.");
    }
    return this.create(upload, tags, {
      userId,
      scopeType: "world-definition",
      scopeId: worldDefinitionId,
    });
  }

  async list(query: ListMediaQueryDto, userId: string) {
    const where: Prisma.MediaAssetWhereInput = {
      OR: [{ createdByUserId: userId }, { createdByUserId: null }],
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

  async get(id: string, userId?: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id,
        ...(userId
          ? { OR: [{ createdByUserId: userId }, { createdByUserId: null }] }
          : {}),
      },
    });
    if (!asset)
      throw new NotFoundException("The selected media asset was not found.");
    return asset;
  }

  async download(id: string, userId: string) {
    const asset = await this.get(id, userId);
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

  async remove(id: string, userId?: string): Promise<void> {
    const asset = await this.get(id, userId);
    await this.storage.delete(asset.objectKey);
    await this.prisma.mediaAsset.delete({ where: { id } });
  }
}
