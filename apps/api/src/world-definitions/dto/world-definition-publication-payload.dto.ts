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

export class WorldDefinitionSnapshotRecordDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, {
    message: "resourceType must contain a visible character",
  })
  resourceType!: string;

  @ApiProperty({ maxLength: 240 })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/, { message: "sourceId must contain a visible character" })
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

export class WorldDefinitionSnapshotManifestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  formatVersion!: number;

  @ApiProperty({ type: [WorldDefinitionSnapshotRecordDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SNAPSHOT_RECORDS - 1)
  @ValidateNested({ each: true })
  @Type(() => WorldDefinitionSnapshotRecordDto)
  records!: WorldDefinitionSnapshotRecordDto[];
}

export abstract class WorldDefinitionPublicationPayloadDto {
  @IsObject()
  content!: Record<string, unknown>;

  @IsObject()
  @ValidateNested()
  @Type(() => WorldDefinitionSnapshotManifestDto)
  snapshotManifest!: WorldDefinitionSnapshotManifestDto;
}
