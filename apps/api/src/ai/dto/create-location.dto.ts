import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateLocationDto {
  @ApiProperty({
    example: "A storm-battered port where rival navigators trade forbidden charts.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;
}
