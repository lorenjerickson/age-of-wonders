import type {
  CampaignSessionLifecycleRequest,
  CreateCampaignSessionRequest,
  UpdateCampaignSessionParticipantsRequest,
  UpdateCampaignSessionRequest,
  UpdateCampaignSessionSummaryRequest,
} from "@aow/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const participantIds = () => ({ each: true }) as const;
type AgentSessionParticipant =
  UpdateCampaignSessionParticipantsRequest["agentParticipants"][number];

export class CreateCampaignSessionDto implements CreateCampaignSessionRequest {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  planningNotes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsString(participantIds())
  playerMembershipIds?: CreateCampaignSessionRequest["playerMembershipIds"];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsString(participantIds())
  spectatorMembershipIds?: CreateCampaignSessionRequest["spectatorMembershipIds"];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsString(participantIds())
  agentParticipationIds?: CreateCampaignSessionRequest["agentParticipationIds"];
}

export class UpdateCampaignSessionDto implements UpdateCampaignSessionRequest {
  @IsInt()
  @Min(1)
  expectedMetadataRevision!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  planningNotes?: string | null;
}

class AgentSessionParticipantDto implements AgentSessionParticipant {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  agentParticipationId!: AgentSessionParticipant["agentParticipationId"];

  @IsBoolean()
  required!: boolean;
}

export class UpdateCampaignSessionParticipantsDto implements UpdateCampaignSessionParticipantsRequest {
  @IsInt()
  @Min(1)
  expectedMetadataRevision!: number;

  @IsArray()
  @ArrayMaxSize(7)
  @IsString(participantIds())
  playerMembershipIds!: UpdateCampaignSessionParticipantsRequest["playerMembershipIds"];

  @IsArray()
  @ArrayMaxSize(7)
  @IsString(participantIds())
  spectatorMembershipIds!: UpdateCampaignSessionParticipantsRequest["spectatorMembershipIds"];

  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => AgentSessionParticipantDto)
  agentParticipants!: AgentSessionParticipantDto[];
}

export class CampaignSessionLifecycleDto implements CampaignSessionLifecycleRequest {
  @IsInt()
  @Min(1)
  expectedMetadataRevision!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRuntimeRevision?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  readinessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  reason?: string;
}

export class UpdateCampaignSessionSummaryDto implements UpdateCampaignSessionSummaryRequest {
  @IsInt()
  @Min(1)
  expectedSessionRevision!: number;

  @IsString()
  @MaxLength(20_000)
  narrative!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  privateGmNotes?: string;
}
