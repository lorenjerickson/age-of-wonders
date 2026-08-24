import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class GenerateMapDto {
  @ApiPropertyOptional({
    example: "Emphasize the dangerous sea route approaching from the east.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  prompt?: string;
}
