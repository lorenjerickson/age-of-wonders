import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";

export class CreateDomainResourceDto {
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "A complete aggregate matching the selected @aow/common type.",
  })
  @IsObject()
  data!: Record<string, unknown>;
}

export class ReplaceDomainResourceDto extends CreateDomainResourceDto {
  @ApiPropertyOptional({
    minimum: 1,
    description: "Reject the write unless the stored revision matches.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

export class ListDomainResourcesDto {
  @ApiPropertyOptional({
    description: "Exact match against the resource kind.",
  })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({
    description: "Exact match against the aggregate's root-world relationship.",
  })
  @IsOptional()
  @IsString()
  worldId?: string;

  @ApiPropertyOptional({ description: "Case-insensitive name search." })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    default: "name",
    enum: ["name", "createdAt", "updatedAt"],
  })
  @IsOptional()
  @IsIn(["name", "createdAt", "updatedAt"])
  sort: "name" | "createdAt" | "updatedAt" = "name";

  @ApiPropertyOptional({ default: "asc", enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  order: Prisma.SortOrder = "asc";

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
