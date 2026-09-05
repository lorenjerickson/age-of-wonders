import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import {
  WorldDefinitionPublicationPayloadDto,
  WorldDefinitionSnapshotManifestDto,
} from "./world-definition-publication-payload.dto";

export class PublishWorldDefinitionRevisionDto extends WorldDefinitionPublicationPayloadDto {
  @ApiProperty({ description: "Explicit direct predecessor revision ID" })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/, {
    message: "predecessorRevisionId must contain a visible character",
  })
  predecessorRevisionId!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: "name must contain a visible character" })
  name!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  declare content: Record<string, unknown>;

  @ApiProperty({ type: WorldDefinitionSnapshotManifestDto })
  declare snapshotManifest: WorldDefinitionPublicationPayloadDto["snapshotManifest"];
}
