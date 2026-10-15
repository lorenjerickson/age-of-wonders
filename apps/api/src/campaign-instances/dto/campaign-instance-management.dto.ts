import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  CampaignInstanceLifecycleRequest,
  CampaignInstancePlacementCommandRequest,
  JsonValue,
  NamespacedKey,
  UpdateCampaignInstancePlotRequest,
  UpdateCampaignInstancePreparationRequest,
} from "@aow/common";
import {
  ArrayMaxSize,
  IsDefined,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";

class CampaignInstancePreparationInput {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  startingLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  startingContext?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  mapVariations?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsObject({ each: true })
  locationCanvases?: UpdateCampaignInstancePreparationRequest["preparation"]["locationCanvases"];

  @IsOptional()
  @IsObject()
  extensions?: Record<string, unknown>;
}

const INSTANCE_STATUSES = [
  "preparing",
  "active",
  "paused",
  "concluded",
  "archived",
] as const;

export class UpdateCampaignInstanceLifecycleDto implements CampaignInstanceLifecycleRequest {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedMetadataRevision!: number;

  @ApiProperty({ enum: INSTANCE_STATUSES })
  @IsIn(INSTANCE_STATUSES)
  targetStatus!: (typeof INSTANCE_STATUSES)[number];
}

export class UpdateCampaignInstancePreparationDto implements UpdateCampaignInstancePreparationRequest {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRuntimeRevision!: number;

  @ApiProperty({ type: CampaignInstancePreparationInput })
  @ValidateNested()
  @Type(() => CampaignInstancePreparationInput)
  preparation!: UpdateCampaignInstancePreparationRequest["preparation"];
}

class PlotObjectiveProgressInput {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  objectiveId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}

class PlotOverrideInput {
  @IsString()
  @Matches(/^[^:\s]+:[^:\s]+$/)
  @MaxLength(120)
  key!: NamespacedKey;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;

  @IsDefined()
  value!: JsonValue;
}

class CreatureKnowledgeInput {
  @IsIn(["knows-truth", "holds-belief", "heard-rumor"])
  kind!: "knows-truth" | "holds-belief" | "heard-rumor";
  @IsString() @MaxLength(240) creatureId!: import("@aow/common").EntityId;
  @IsString() @MaxLength(240) claimId!: string;
  @IsOptional() @IsString() @MaxLength(100) learnedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) provenance?: string;
}

export class UpdateCampaignInstancePlotDto implements UpdateCampaignInstancePlotRequest {
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => CreatureKnowledgeInput)
  creatureKnowledge?: CreatureKnowledgeInput[];
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRuntimeRevision!: number;

  @ApiProperty({
    enum: ["not-started", "active", "completed", "failed", "abandoned"],
  })
  @IsIn(["not-started", "active", "completed", "failed", "abandoned"])
  @IsOptional()
  status?: UpdateCampaignInstancePlotRequest["status"];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PlotObjectiveProgressInput)
  objectiveProgress?: PlotObjectiveProgressInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2_000)
  @IsString({ each: true })
  @MaxLength(240, { each: true })
  revealedClaimIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlotOverrideInput)
  approvedOverrides?: PlotOverrideInput[];
}

class PlacementReplacementInput {
  @IsIn(["existing-creature", "existing-item"])
  kind!: "existing-creature" | "existing-item";

  @IsOptional()
  @IsString()
  @MaxLength(240)
  runtimeCreatureId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  runtimeItemId?: string;
}

export class DecideCampaignInstancePlacementDto implements CampaignInstancePlacementCommandRequest {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRuntimeRevision!: number;

  @ApiProperty({ enum: ["realize", "defer", "replace", "remove"] })
  @IsIn(["realize", "defer", "replace", "remove"])
  action!: "realize" | "defer" | "replace" | "remove";

  @ApiPropertyOptional({ type: PlacementReplacementInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlacementReplacementInput)
  replacement?: CampaignInstancePlacementCommandRequest["replacement"];

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  notes?: string;
}

export class CreateCampaignInstanceInvitationDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  invitedName!: string;

  @ApiProperty({ enum: ["gm", "player", "spectator"] })
  @IsIn(["gm", "player", "spectator"])
  role!: "gm" | "player" | "spectator";

  @ApiPropertyOptional({ description: "Explicit existing Player profile" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  playerId?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: "+14155550100" })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone?: string;
}

export class ConfigureCampaignInstanceAgentDto {
  @ApiProperty({ maxLength: 240 })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  agentId!: string;

  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^[^:\s]+:[^:\s]+$/, { each: true })
  @MaxLength(120, { each: true })
  observe!: string[];

  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^[^:\s]+:[^:\s]+$/, { each: true })
  @MaxLength(120, { each: true })
  act!: string[];
}

export class UpdateCampaignInstanceAgentStatusDto {
  @ApiProperty({ enum: ["configured", "authorized", "active", "paused"] })
  @IsIn(["configured", "authorized", "active", "paused"])
  expectedStatus!: "configured" | "authorized" | "active" | "paused";

  @ApiProperty({ enum: ["authorized", "paused", "revoked"] })
  @IsIn(["authorized", "paused", "revoked"])
  status!: "authorized" | "paused" | "revoked";
}

const MEMBERSHIP_STATUSES = ["active", "inactive", "left", "banned"] as const;

export class UpdateCampaignInstanceMembershipStatusDto {
  @IsIn(MEMBERSHIP_STATUSES)
  expectedStatus!: (typeof MEMBERSHIP_STATUSES)[number];

  @IsIn(MEMBERSHIP_STATUSES)
  targetStatus!: (typeof MEMBERSHIP_STATUSES)[number];
}

export class CreateCampaignInstanceCharacterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  playerMembershipId!: string;
}

const CHARACTER_STATUSES = [
  "draft",
  "active",
  "inactive",
  "retired",
  "dead",
] as const;

export class UpdateCampaignInstanceCharacterStatusDto {
  @IsIn(CHARACTER_STATUSES)
  expectedStatus!: (typeof CHARACTER_STATUSES)[number];

  @IsIn(CHARACTER_STATUSES)
  targetStatus!: (typeof CHARACTER_STATUSES)[number];
}

export class SelectCampaignInstanceCharacterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  characterId!: string;
}

export class ImportCampaignInstanceCharacterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  sourceCampaignDefinitionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  sourceCampaignInstanceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  sourceCharacterId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  playerMembershipId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class PlaceCampaignInstanceActorDto {
  @IsInt()
  @Min(1)
  expectedRuntimeRevision!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  locationId!: string;

  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  position!: unknown;
}

export class ChangeActorEquipmentDto {
 @IsInt() @Min(1) expectedRuntimeRevision!: number;
 @IsIn(['create','equip','unequip','stow','retrieve','quantity','allowance']) action!: 'create'|'equip'|'unequip'|'stow'|'retrieve'|'quantity'|'allowance';
 @IsOptional() @IsString() @MaxLength(240) itemId?:string;
 @IsOptional() @IsString() @MaxLength(240) definitionId?:string;
 @IsOptional() @IsString() @MaxLength(240) containerId?:string;
 @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({each:true}) slots?:string[];
 @IsOptional() @IsInt() @Min(0) index?:number;
 @IsOptional() @IsInt() @Min(1) quantity?:number;
 @IsOptional() @IsInt() @Min(0) bonusActions?:number;
}
