import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  ListMediaQueryDto,
  MediaUploadBodyDto,
  UploadMediaQueryDto,
} from "./dto/media.dto";
import { MediaService } from "./media.service";
import type { MediaUploadRequest } from "./media-upload.types";
import { S3UploadInterceptor } from "./s3-upload.interceptor";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import type { Request } from "express";

@ApiTags("media")
@Controller("media")
@UseGuards(GmGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @Header("Deprecation", "true")
  @Header("Link", '</api/worlds/{worldId}/media>; rel="successor-version"')
  @UseInterceptors(S3UploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: MediaUploadBodyDto })
  @ApiCreatedResponse({
    description: "The file was streamed to object storage.",
  })
  @ApiOperation({ summary: "Upload a file to S3-compatible storage" })
  upload(
    @Req() request: MediaUploadRequest & Request & AuthenticatedRequest,
    @Query() query: UploadMediaQueryDto,
  ) {
    if (!request.storedUpload) {
      throw new BadRequestException("multipart field 'file' is required");
    }
    return this.media.create(request.storedUpload, query.tags ?? [], {
      userId: request.user!.id,
    });
  }

  @Get()
  @ApiOperation({ summary: "Search and filter uploaded files" })
  list(
    @Query() query: ListMediaQueryDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.media.list(query, request.user!.id);
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Create a 15-minute signed download URL" })
  download(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.media.download(id, request.user!.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get uploaded-file metadata" })
  get(@Param("id") id: string, @Req() request: Request & AuthenticatedRequest) {
    return this.media.get(id, request.user!.id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete uploaded content and metadata" })
  async remove(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ): Promise<void> {
    await this.media.remove(id, request.user!.id);
  }
}

@ApiTags("world media")
@Controller("worlds/:worldId/media")
@UseGuards(GmGuard)
export class WorldMediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(S3UploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: MediaUploadBodyDto })
  @ApiCreatedResponse({ description: "The World-scoped file was stored." })
  upload(
    @Param("worldId") worldId: string,
    @Req() request: MediaUploadRequest & Request & AuthenticatedRequest,
    @Query() query: UploadMediaQueryDto,
  ) {
    if (!request.storedUpload) {
      throw new BadRequestException("multipart field 'file' is required");
    }
    return this.media.createForWorld(
      worldId,
      request.user!.id,
      request.storedUpload,
      query.tags ?? [],
    );
  }
}
