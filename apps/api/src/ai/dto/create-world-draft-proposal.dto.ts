import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateWorldDraftProposalDto {
  @IsInt()
  @Min(1)
  expectedStorageRevision!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  @Matches(/\S/)
  direction!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/)
  parentLocationId?: string;
}
