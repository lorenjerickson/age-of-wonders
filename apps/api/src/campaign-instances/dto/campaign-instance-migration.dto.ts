import type {
  ApplyCampaignInstanceMigrationRequest,
  CampaignInstanceMigrationPreviewRequest,
  ApplyCampaignInstanceRestoreRequest,
  CampaignInstanceRestorePreviewRequest,
} from "@aow/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { MAX_MIGRATION_EXPANDED_RECORDS } from "../../domain/snapshot-manifest";

class CampaignInstanceMigrationMappingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  resourceType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  sourceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  targetId!: string;
}

export class PreviewCampaignInstanceMigrationDto
  implements CampaignInstanceMigrationPreviewRequest
{
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  sourceSnapshotId!: CampaignInstanceMigrationPreviewRequest["sourceSnapshotId"];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  targetCampaignDefinitionSnapshotId!: CampaignInstanceMigrationPreviewRequest["targetCampaignDefinitionSnapshotId"];

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRuntimeRevision!: number;

  @ApiPropertyOptional({ type: "array", maxItems: MAX_MIGRATION_EXPANDED_RECORDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MIGRATION_EXPANDED_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => CampaignInstanceMigrationMappingDto)
  mappings?: CampaignInstanceMigrationMappingDto[];

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  changeOffset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  changeLimit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  conflictOffset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  conflictLimit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  candidateOffset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  candidateLimit?: number;
}

export class ApplyCampaignInstanceMigrationDto
  extends PreviewCampaignInstanceMigrationDto
  implements ApplyCampaignInstanceMigrationRequest
{
  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  planHash!: string;

  @ApiProperty({ type: "array", maxItems: MAX_MIGRATION_EXPANDED_RECORDS })
  @IsArray()
  @ArrayMaxSize(MAX_MIGRATION_EXPANDED_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => CampaignInstanceMigrationMappingDto)
  declare mappings: CampaignInstanceMigrationMappingDto[];
}

export class PreviewCampaignInstanceRestoreDto
  implements CampaignInstanceRestorePreviewRequest
{
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sourceSnapshotId!: CampaignInstanceRestorePreviewRequest["sourceSnapshotId"];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  targetInstanceSnapshotId!: CampaignInstanceRestorePreviewRequest["targetInstanceSnapshotId"];

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRuntimeRevision!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MIGRATION_EXPANDED_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => CampaignInstanceMigrationMappingDto)
  mappings?: CampaignInstanceMigrationMappingDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  changeOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  changeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  conflictOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  conflictLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  candidateOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  candidateLimit?: number;
}

export class ApplyCampaignInstanceRestoreDto
  extends PreviewCampaignInstanceRestoreDto
  implements ApplyCampaignInstanceRestoreRequest
{
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  planHash!: string;

  @IsArray()
  @ArrayMaxSize(MAX_MIGRATION_EXPANDED_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => CampaignInstanceMigrationMappingDto)
  declare mappings: CampaignInstanceMigrationMappingDto[];
}
