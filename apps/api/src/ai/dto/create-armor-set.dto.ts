import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateArmorSetDto {
  @ApiPropertyOptional({
    example:
      "Use storm-tempered bronze and navigators' lacquer; practical rather than ceremonial.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  prompt = "";
}
