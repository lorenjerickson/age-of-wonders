import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class GraphTripleDto {
  @ApiProperty()
  @IsString()
  subject!: string;

  @ApiProperty()
  @IsString()
  predicate!: string;

  @ApiProperty()
  @IsString()
  object!: string;
}

export class PutGraphTriplesDto {
  @ApiProperty({ type: [GraphTripleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GraphTripleDto)
  triples!: GraphTripleDto[];
}

export class GraphPatternDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  predicate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  object?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
}

export class DeleteGraphTriplesDto {
  @ApiProperty({ type: GraphPatternDto })
  @ValidateNested()
  @Type(() => GraphPatternDto)
  pattern!: GraphPatternDto;
}
