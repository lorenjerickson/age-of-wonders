import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MEDIA_TYPES } from "../media-key";

function tagsFromQuery({ value }: TransformFnParams): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const values = Array.isArray(value) ? (value as unknown[]) : [value];
  return values
    .flatMap((item) => String(item).split(","))
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export class UploadMediaQueryDto {
  @ApiProperty({ example: "maps" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  purpose!: string;

  @ApiPropertyOptional({
    example: "world-map,outdoors",
    description: "Comma-separated or repeated tags.",
  })
  @IsOptional()
  @Transform(tagsFromQuery)
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z0-9][a-z0-9:_-]{0,62}$/, { each: true })
  tags?: string[];
}

export class ListMediaQueryDto {
  @ApiPropertyOptional({ enum: MEDIA_TYPES })
  @IsOptional()
  @IsIn(MEDIA_TYPES)
  mediaType?: string;

  @ApiPropertyOptional({ example: "maps" })
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  purpose?: string;

  @ApiPropertyOptional({ example: "image/png" })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: "Original filename search." })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Comma-separated or repeated tags." })
  @IsOptional()
  @Transform(tagsFromQuery)
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z0-9][a-z0-9:_-]{0,62}$/, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: ["any", "all"], default: "all" })
  @IsOptional()
  @IsIn(["any", "all"])
  tagMode: "any" | "all" = "all";

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class MediaUploadBodyDto {
  @ApiProperty({ type: "string", format: "binary" })
  file!: unknown;
}
