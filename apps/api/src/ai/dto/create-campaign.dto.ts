import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateCampaignDto {
  @ApiProperty({
    example:
      "A rain-soaked investigation where the party arrives as the city bells begin ringing by themselves.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;
}
