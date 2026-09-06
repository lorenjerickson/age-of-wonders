import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
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

const keyPattern = /^[^:\s]+:[^:\s]+$/;

export class CreateModelRegistryDto {
  @IsString() @MaxLength(120) @Matches(keyPattern) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/) name!: string;
  @IsOptional() @IsString() @MaxLength(2_000) description?: string;
}

export class ModelElementRevisionPayloadDto {
  @IsObject() payload!: Record<string, unknown>;
  @IsObject() presentation!: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(1_000) dependencies?: unknown[];
  @IsOptional() @IsObject() source?: Record<string, unknown>;
}

export class CreateModelElementDto extends ModelElementRevisionPayloadDto {
  @IsString() @MaxLength(120) @Matches(keyPattern) key!: string;
  @IsIn(["concept", "field", "relationship", "vocabulary", "vocabulary-option"])
  kind!: string;
  @IsString() @MaxLength(120) @Matches(keyPattern) semanticRole!: string;
  @IsObject() applicability!: Record<string, unknown>;
}

export class PublishModelElementRevisionDto extends ModelElementRevisionPayloadDto {
  @IsString() @MinLength(1) @MaxLength(240) elementId!: string;
  @IsString() @MinLength(1) @MaxLength(240) predecessorRevisionId!: string;
}

export class ModelReleaseSelectionDto {
  @IsString() @MinLength(1) @MaxLength(240) elementId!: string;
  @IsString() @MinLength(1) @MaxLength(240) elementRevisionId!: string;
}

export class ModelReleaseDependencyDto {
  @IsString() @MinLength(1) @MaxLength(240) releaseId!: string;
}

export class PublishModelSchemaReleaseDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/) name!: string;
  @IsOptional() @IsString() @MaxLength(240) predecessorRevisionId?: string;
  @IsArray()
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => ModelReleaseSelectionDto)
  elementSelections!: ModelReleaseSelectionDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ModelReleaseDependencyDto)
  dependencies?: ModelReleaseDependencyDto[];
}

export class ExtendModelSchemaReleaseDto {
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/\S/) name!: string;
  @IsOptional() @IsString() @MaxLength(240) predecessorRevisionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateModelElementDto)
  elements?: CreateModelElementDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PublishModelElementRevisionDto)
  revisions?: PublishModelElementRevisionDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  archiveElementIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => ModelMigrationMappingDto)
  migrationMappings?: ModelMigrationMappingDto[];
}

export class ModelMigrationMappingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  sourceElementId?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  targetElementId?: string;
  @IsOptional() @IsObject() backfill?: Record<string, unknown>;
}

export class CreateModelMigrationPlanDto {
  @IsString() @MinLength(1) @MaxLength(240) sourceReleaseId!: string;
  @IsString() @MinLength(1) @MaxLength(240) targetReleaseId!: string;
  @IsArray()
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => ModelMigrationMappingDto)
  mappings!: ModelMigrationMappingDto[];
}

export class ExpectedModelMetadataRevisionDto {
  @IsInt() @Min(1) expectedMetadataRevision!: number;
}
