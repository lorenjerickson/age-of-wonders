import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { Response } from "express";
// Multer publishes a CommonJS `export =` module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import multer = require("multer");
import type { Observable } from "rxjs";
import { from, switchMap } from "rxjs";
import { UploadMediaQueryDto } from "./dto/media.dto";
import { ObjectStorageService } from "./object-storage.service";
import type { MediaUploadRequest } from "./media-upload.types";

function asError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : fallback);
}

@Injectable()
export class S3UploadInterceptor implements NestInterceptor {
  constructor(private readonly storage: ObjectStorageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<MediaUploadRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    return from(this.upload(request, response)).pipe(
      switchMap(() => next.handle()),
    );
  }

  private async upload(
    request: MediaUploadRequest,
    response: Response,
  ): Promise<void> {
    const query = plainToInstance(UploadMediaQueryDto, request.query);
    const validationErrors = await validate(query, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (validationErrors.length > 0) {
      throw new BadRequestException(
        validationErrors.flatMap((error) =>
          Object.values(error.constraints ?? {}),
        ),
      );
    }

    const storage = this.storageEngine(query);
    const middleware = multer({
      storage,
      limits: { fileSize: 2_000_000_000, files: 1 },
    }).single("file");

    await new Promise<void>((resolve, reject) => {
      middleware(request, response, (error: unknown) => {
        if (
          error instanceof multer.MulterError &&
          error.code === "LIMIT_FILE_SIZE"
        ) {
          reject(new PayloadTooLargeException("File exceeds the 2 GB limit"));
        } else if (error) {
          reject(asError(error, "Multipart upload failed"));
        } else {
          resolve();
        }
      });
    });
  }

  private storageEngine(query: UploadMediaQueryDto): multer.StorageEngine {
    return {
      _handleFile: (request, file, callback) => {
        const uploadRequest = request as MediaUploadRequest;
        void this.storage
          .upload(
            file.stream,
            file.originalname,
            file.mimetype,
            query.purpose,
            query.tags ?? [],
          )
          .then((stored) => {
            uploadRequest.storedUpload = stored;
            callback(null, stored);
          })
          .catch((error: unknown) =>
            callback(asError(error, "S3 upload failed")),
          );
      },
      _removeFile: (request, file, callback) => {
        const stored = (request as MediaUploadRequest).storedUpload;
        if (!stored) {
          callback(null);
          return;
        }
        void this.storage
          .delete(stored.objectKey)
          .then(() => callback(null))
          .catch((error: unknown) =>
            callback(asError(error, "S3 cleanup failed")),
          );
      },
    };
  }
}
