import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class InstanceInvitationTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;
}

export class SessionInvitationResponseDto extends InstanceInvitationTokenDto {
  @IsIn(["accepted", "declined"])
  response!: "accepted" | "declined";

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  message?: string;
}

export class PresenceConnectionDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  connectionKey!: string;
}
