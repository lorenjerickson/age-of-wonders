import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  WorldDefinitionPublicationPayloadDto,
  WorldDefinitionSnapshotManifestDto,
} from "./world-definition-publication-payload.dto";

export class CreateWorldDefinitionDto extends WorldDefinitionPublicationPayloadDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: "name must contain a visible character" })
  name!: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  declare content: Record<string, unknown>;

  @ApiProperty({ type: WorldDefinitionSnapshotManifestDto })
  declare snapshotManifest: WorldDefinitionPublicationPayloadDto["snapshotManifest"];
}
