import {
  IsInt,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import type { LocationMap, TerrainChunk } from "@aow/common";

export class TerrainDraftRevisionDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(240)
  expectedDraftId!: string;

  @IsInt()
  @Min(1)
  expectedStorageRevision!: number;
}

export class UploadTerrainChunkDto extends TerrainDraftRevisionDto {
  @IsObject()
  chunk!: TerrainChunk;
}

export class SaveLocationTerrainDto extends TerrainDraftRevisionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9-]{8,120}$/)
  operationId!: string;

  @IsObject()
  map!: LocationMap;
}
