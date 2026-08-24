import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateItemDto {
  @ApiProperty({
    example:
      "A compact brass field instrument used by surveyors to detect fractures in ley lines.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;
}
