import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsDefined, IsInt, IsObject, IsOptional, Max,
  IsString, Matches, MaxLength, Min, MinLength, ValidateNested,
} from "class-validator";
import { MAX_SNAPSHOT_RECORDS } from "../../domain/snapshot-manifest";

export class CampaignDraftRecordDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/)
  resourceType!: string;
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  sourceId!: string;
  @IsOptional() @IsInt() @Min(1)
  sourceRevision?: number;
  @IsDefined()
  payload!: unknown;
}

export class CreateCampaignDefinitionDto {
  @ApiProperty({ maxLength: 120 })
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/)
  name!: string;
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;
  @ApiProperty()
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  worldDefinitionSnapshotId!: string;
}

export class StartCampaignDraftDto {
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  baseRevisionId!: string;
}

export class ExpectedCampaignDraftRevisionDto {
  @IsInt() @Min(1)
  expectedStorageRevision!: number;
}

export class ResetCampaignDraftDto extends ExpectedCampaignDraftRevisionDto {}

export class SaveCampaignDraftDto extends ExpectedCampaignDraftRevisionDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/)
  revisionName!: string;
  @IsObject()
  content!: Record<string, unknown>;
  @IsArray() @ArrayMaxSize(MAX_SNAPSHOT_RECORDS - 1)
  @ValidateNested({ each: true }) @Type(() => CampaignDraftRecordDto)
  records!: CampaignDraftRecordDto[];
}

export class ExpectedCampaignMetadataRevisionDto {
  @IsInt() @Min(1)
  expectedMetadataRevision!: number;
}

export class ForkCampaignDefinitionDto {
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  sourceSnapshotId!: string;
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/)
  name!: string;
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;
}

export class CampaignMigrationMappingDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/)
  resourceType!: string;
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  sourceId!: string;
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  targetId!: string;
}

export class PreviewCampaignWorldMigrationDto extends ExpectedCampaignDraftRevisionDto {
  @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/)
  targetWorldDefinitionSnapshotId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_SNAPSHOT_RECORDS)
  @ValidateNested({ each: true }) @Type(() => CampaignMigrationMappingDto)
  mappings?: CampaignMigrationMappingDto[];
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SNAPSHOT_RECORDS * 2)
  conflictOffset?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SNAPSHOT_RECORDS)
  candidateOffset?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SNAPSHOT_RECORDS)
  impactOffset?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_SNAPSHOT_RECORDS)
  changeOffset?: number;
}

export class ApplyCampaignWorldMigrationDto extends PreviewCampaignWorldMigrationDto {
  @IsString() @MinLength(64) @MaxLength(64) @Matches(/^[a-f0-9]{64}$/)
  expectedPlanHash!: string;
}

/** @deprecated Direct generic publication is intentionally unavailable. */
export class PublishCampaignDefinitionRevisionDto {}
