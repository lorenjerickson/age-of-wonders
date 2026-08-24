import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RunPipelineDto {
  @ApiProperty({ example: "How AI agents change customer support operations" })
  @IsString()
  @MinLength(3)
  @MaxLength(2_000)
  topic!: string;

  @ApiPropertyOptional({ example: "SaaS product leaders" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;
}
