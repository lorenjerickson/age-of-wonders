import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class GenerateContentDto {
  @ApiProperty({ example: "Write a launch announcement for our new product." })
  @IsString()
  @MinLength(3)
  @MaxLength(20_000)
  prompt!: string;

  @ApiPropertyOptional({ example: "Use a concise, confident tone." })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  instructions?: string;
}
