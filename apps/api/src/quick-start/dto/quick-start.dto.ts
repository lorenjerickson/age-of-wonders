import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateQuickStartProgressDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lastCanonicalRoute?: string;

  @IsOptional()
  @IsBoolean()
  collapsed?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  selfConfirmedStepKeys?: string[];
}
