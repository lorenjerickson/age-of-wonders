import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateWorldDto {
  @ApiProperty({
    example: "An archipelago whose islands migrate with the seasons.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;
}
