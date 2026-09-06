import { ApiProperty } from "@nestjs/swagger";
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateSystemSettingDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @ApiProperty({ oneOf: [{ type: "string" }, { type: "number" }] })
  @IsDefined()
  value!: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReplaceSystemSecretDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(1_000)
  secret!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SystemSettingActionDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
