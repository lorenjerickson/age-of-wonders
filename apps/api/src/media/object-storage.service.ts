import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Readable } from "node:stream";
import { generateMediaKey, type GeneratedMediaKey } from "./media-key";

export interface StoredUpload extends GeneratedMediaKey {
  bucket: string;
  originalName: string;
  mimeType: string;
  size: number;
  etag?: string;
}

export interface StoredObject {
  objectKey: string;
  size: number;
  etag?: string;
}

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>("S3_ENDPOINT", "http://storage:9000");
    const publicEndpoint = config.get<string>(
      "S3_PUBLIC_ENDPOINT",
      "http://localhost:9000",
    );
    const region = config.get<string>("S3_REGION", "us-east-1");
    const credentials = {
      accessKeyId: config.get<string>("S3_ACCESS_KEY", "aow-minio"),
      secretAccessKey: config.get<string>(
        "S3_SECRET_KEY",
        "aow-minio-password",
      ),
    };
    const common = { region, credentials, forcePathStyle: true };
    this.client = new S3Client({ ...common, endpoint });
    this.publicClient = new S3Client({ ...common, endpoint: publicEndpoint });
    this.bucket = config.get<string>("S3_BUCKET", "age-of-wonders");
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!this.isMissingBucket(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  bucketName(): string {
    return this.bucket;
  }

  async upload(
    stream: Readable,
    originalName: string,
    mimeType: string,
    purpose: string,
    tags: readonly string[],
  ): Promise<StoredUpload> {
    const generated = generateMediaKey(mimeType, purpose, originalName);
    let size = 0;
    stream.on("data", (chunk: Buffer | string) => {
      size +=
        typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
    });

    const result = await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: generated.objectKey,
        Body: stream,
        ContentType: mimeType,
        Metadata: {
          purpose: generated.purpose,
          "media-type": generated.mediaType,
          tags: tags.join(","),
        },
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false,
    }).done();

    if (size === 0) {
      await this.delete(generated.objectKey);
      throw new BadRequestException(
        "The selected file is empty. Choose a file containing image or media data.",
      );
    }

    return {
      ...generated,
      bucket: this.bucket,
      originalName,
      mimeType,
      size,
      etag: result.ETag?.replaceAll('"', ""),
    };
  }

  delete(objectKey: string): Promise<unknown> {
    return this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async listObjects(): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        objects.push({
          objectKey: object.Key,
          size: object.Size ?? 0,
          etag: object.ETag?.replaceAll('"', ""),
        });
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
    return objects.sort((left, right) =>
      left.objectKey.localeCompare(right.objectKey),
    );
  }

  async downloadObject(objectKey: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (
      !result.Body ||
      typeof result.Body !== "object" ||
      !("pipe" in result.Body)
    ) {
      throw new Error(
        "The storage service returned an unreadable object body.",
      );
    }
    return result.Body;
  }

  async putObject(
    objectKey: string,
    body: Readable,
    metadata?: {
      mimeType?: string;
      purpose?: string;
      mediaType?: string;
      tags?: readonly string[];
    },
  ): Promise<void> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: metadata?.mimeType,
        Metadata: metadata
          ? {
              purpose: metadata.purpose ?? "archive-import",
              "media-type": metadata.mediaType ?? "other",
              tags: metadata.tags?.join(",") ?? "",
            }
          : undefined,
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false,
    }).done();
  }

  signedDownloadUrl(
    objectKey: string,
    originalName: string,
    expiresIn = 900,
  ): Promise<string> {
    const safeName = originalName.replace(/["\\\r\n]/g, "_");
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentDisposition: `inline; filename="${safeName}"`,
      }),
      { expiresIn },
    );
  }

  private isMissingBucket(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const candidate = error as {
      name?: unknown;
      $metadata?: { httpStatusCode?: unknown };
    };
    return (
      candidate.name === "NotFound" ||
      candidate.name === "NoSuchBucket" ||
      candidate.$metadata?.httpStatusCode === 404
    );
  }
}
