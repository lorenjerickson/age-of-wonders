import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCampaignInstanceDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: "name must contain a visible character" })
  name!: string;

  @ApiProperty({
    description: "Explicit immutable Campaign Definition snapshot ID",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/, {
    message: "campaignDefinitionSnapshotId must contain a visible character",
  })
  campaignDefinitionSnapshotId!: string;
}
