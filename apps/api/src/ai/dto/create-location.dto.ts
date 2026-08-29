import { ApiProperty } from "@nestjs/swagger";
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateLocationDto {
  @ApiProperty({
    example:
      "A storm-battered port where rival navigators trade forbidden charts.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;

  @ApiProperty({ required: false, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mapX?: number;

  @ApiProperty({ required: false, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mapY?: number;
}
