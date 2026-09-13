import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
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
import type { MovementSpeed, DiscoveryClaim } from "@aow/common";

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

export class WorldDraftMutationDto {
  @IsInt()
  @Min(1)
  expectedStorageRevision!: number;

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

export class UpsertWorldLocationDraftDto extends WorldDraftMutationDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  gmDescription?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  discoveries?: DiscoveryClaim[];

  @IsOptional()
  @IsObject()
  image?: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  kind!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  parentLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  profileSummary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  profileTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  mapSceneNotes?: string;

  @IsOptional()
  @IsIn(["scenic", "overhead", "side-on", "isometric"])
  mapOrientation?: "scenic" | "overhead" | "side-on" | "isometric";
}

export class UpsertWorldCreatureDraftDto extends WorldDraftMutationDto {
  @IsOptional()
  @IsObject()
  images?: Record<string, unknown>;

  @IsObject()
  attributes!: Record<string, number>;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  equipmentSlots!: string[];

  @IsObject()
  instanceEmbodimentPolicy!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  artDirection?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  movement?: MovementSpeed[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  skillDefinitionIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  professionDefinitionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  progressiveMechanicsNotes?: string;
}

export class UpsertWorldItemDraftDto extends WorldDraftMutationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  @Matches(/^[^:]+:.+$/)
  itemFamilyKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  category!: string;

  @IsIn(["ramshackle", "standard", "fine", "exquisite"])
  quality!: "ramshackle" | "standard" | "fine" | "exquisite";

  @IsArray()
  @ArrayMaxSize(200)
  @IsArray({ each: true })
  compatibleEquipmentSlotSets!: string[][];

  @IsObject()
  image!: Record<string, unknown>;
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
