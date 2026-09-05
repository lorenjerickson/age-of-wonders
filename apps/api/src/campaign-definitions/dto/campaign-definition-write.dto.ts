import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
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

export class CampaignDefinitionSnapshotRecordDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  resourceType!: string;

  @ApiProperty({ maxLength: 240 })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  sourceId!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sourceRevision?: number;

  @ApiProperty({ description: "Complete JSON payload for this record" })
  @IsDefined()
  payload!: unknown;
}

export class CampaignDefinitionSnapshotManifestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  formatVersion!: number;

  @ApiProperty({ type: [CampaignDefinitionSnapshotRecordDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SNAPSHOT_RECORDS - 1)
  @ValidateNested({ each: true })
  @Type(() => CampaignDefinitionSnapshotRecordDto)
  records!: CampaignDefinitionSnapshotRecordDto[];
}

export class CreateCampaignDefinitionDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name!: string;

  @ApiPropertyOptional({ maxLength: 4_000 })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  description?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  worldDefinitionSnapshotId!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiProperty({ type: CampaignDefinitionSnapshotManifestDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignDefinitionSnapshotManifestDto)
  snapshotManifest!: CampaignDefinitionSnapshotManifestDto;
}

export class PublishCampaignDefinitionRevisionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  predecessorRevisionId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  worldDefinitionSnapshotId!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiProperty({ type: CampaignDefinitionSnapshotManifestDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignDefinitionSnapshotManifestDto)
  snapshotManifest!: CampaignDefinitionSnapshotManifestDto;
}
