import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CharacterDraftStatus } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateCharacterDraftDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundDefinitionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionDefinitionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsString({ each: true })
  heritageDefinitionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributeAssignments?: Record<string, number>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  startingEquipmentIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  biography?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  imageAssetIds?: Record<string, string>;

  @ApiPropertyOptional({ enum: CharacterDraftStatus })
  @IsOptional()
  @IsEnum(CharacterDraftStatus)
  status?: CharacterDraftStatus;
}

export class ExpectedCharacterDraftRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class CreateCharacterDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
