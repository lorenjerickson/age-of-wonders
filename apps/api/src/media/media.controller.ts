import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
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

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(S3UploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: MediaUploadBodyDto })
  @ApiCreatedResponse({
    description: "The file was streamed to object storage.",
  })
  @ApiOperation({ summary: "Upload a file to S3-compatible storage" })
  upload(
    @Req() request: MediaUploadRequest,
    @Query() query: UploadMediaQueryDto,
  ) {
    if (!request.storedUpload) {
      throw new BadRequestException("multipart field 'file' is required");
    }
    return this.media.create(request.storedUpload, query.tags ?? []);
  }

  @Get()
  @ApiOperation({ summary: "Search and filter uploaded files" })
  list(@Query() query: ListMediaQueryDto) {
    return this.media.list(query);
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Create a 15-minute signed download URL" })
  download(@Param("id") id: string) {
    return this.media.download(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get uploaded-file metadata" })
  get(@Param("id") id: string) {
    return this.media.get(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete uploaded content and metadata" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.media.remove(id);
  }
}
