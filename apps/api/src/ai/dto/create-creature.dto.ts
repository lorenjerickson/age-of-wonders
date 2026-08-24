import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateCreatureDto {
  @ApiProperty({
    example:
      "A patient glass-scaled predator that hunts by reflecting moonlight through its antlers.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;
}
