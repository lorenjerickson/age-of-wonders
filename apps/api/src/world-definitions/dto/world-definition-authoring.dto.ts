import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MAX_SNAPSHOT_RECORDS } from "../../domain/snapshot-manifest";

export class WorldDraftRecordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  resourceType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  sourceId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sourceRevision?: number;

  @IsDefined()
  payload!: unknown;
}

export class CreateWorldDraftDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [WorldDraftRecordDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SNAPSHOT_RECORDS - 1)
  @ValidateNested({ each: true })
  @Type(() => WorldDraftRecordDto)
  records?: WorldDraftRecordDto[];
}

export class SaveWorldDraftDto {
  @IsInt()
  @Min(1)
  expectedStorageRevision!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  revisionName!: string;

  @IsObject()
  content!: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(MAX_SNAPSHOT_RECORDS - 1)
  @ValidateNested({ each: true })
  @Type(() => WorldDraftRecordDto)
  records!: WorldDraftRecordDto[];
}

export class ExpectedDraftRevisionDto {
  @IsInt()
  @Min(1)
  expectedStorageRevision!: number;
}

export class StartWorldDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  baseRevisionId!: string;
}

export class ExpectedWorldMetadataRevisionDto {
  @IsInt()
  @Min(1)
  expectedMetadataRevision!: number;
}

export class ForkWorldDefinitionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  sourceSnapshotId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;
}
