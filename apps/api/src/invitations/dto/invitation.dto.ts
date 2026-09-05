import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CampaignRole, DeliveryChannel } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateCampaignInvitationDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ enum: CampaignRole })
  @IsEnum(CampaignRole)
  role!: CampaignRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: "+14155550100" })
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone?: string;

  @ApiProperty({ enum: DeliveryChannel, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsEnum(DeliveryChannel, { each: true })
  channels!: DeliveryChannel[];
}

export class InvitationTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token!: string;
}
