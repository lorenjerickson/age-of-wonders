import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { ObjectStorageService } from "./object-storage.service";
import { S3UploadInterceptor } from "./s3-upload.interceptor";

@Module({
  controllers: [MediaController],
  providers: [MediaService, ObjectStorageService, S3UploadInterceptor],
  exports: [MediaService, ObjectStorageService],
})
export class MediaModule {}
