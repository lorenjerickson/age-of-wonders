import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
  ArrayMaxSize,
  IsNumber,
  Max,
} from "class-validator";
import type {
  WorldRuleEvent,
  RuleStateView,
  RecordedRuleRoll,
} from "@aow/common";
import { WorldAccessGuard } from "./world-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { WorldRulesService } from "./world-rules.service";

class RuleRevisionDto {
  @IsString() @MinLength(1) @MaxLength(240) expectedDraftId!: string;
  @IsInt() @Min(1) expectedStorageRevision!: number;
}
class SaveWorldRuleDto extends RuleRevisionDto {
  @IsObject() rule!: Record<string, unknown>;
}
class StarterRulesDto extends RuleRevisionDto {
  @IsOptional() @IsNumber() @Min(0.01) @Max(10000) budgetFeet?: number;
}
class PreviewWorldRulesDto {
  @IsObject() event!: WorldRuleEvent;
  @IsObject() state!: RuleStateView;
  @IsOptional() @IsArray() @ArrayMaxSize(100) entropy?: RecordedRuleRoll[];
}

@Controller("worlds/:worldId/rules")
@UseGuards(WorldAccessGuard)
export class WorldRulesController {
  constructor(private readonly rules: WorldRulesService) {}
  @Get() list(
    @Param("worldId") worldId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rules.list(worldId, request.user!.id);
  }
  @Post() create(
    @Param("worldId") worldId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveWorldRuleDto,
  ) {
    return this.rules.upsert(worldId, request.user!.id, dto, dto.rule);
  }
  @Put(":ruleId") update(
    @Param("worldId") worldId: string,
    @Param("ruleId") ruleId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveWorldRuleDto,
  ) {
    return this.rules.upsert(worldId, request.user!.id, dto, dto.rule, ruleId);
  }
  @Delete(":ruleId") remove(
    @Param("worldId") worldId: string,
    @Param("ruleId") ruleId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: RuleRevisionDto,
  ) {
    return this.rules.remove(worldId, request.user!.id, dto, ruleId);
  }
  @Post(":ruleId/duplicate") duplicate(
    @Param("worldId") worldId: string,
    @Param("ruleId") ruleId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: RuleRevisionDto,
  ) {
    return this.rules.duplicate(worldId, request.user!.id, dto, ruleId);
  }
  @Post("starter-movement") starter(
    @Param("worldId") worldId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: StarterRulesDto,
  ) {
    return this.rules.starter(worldId, request.user!.id, dto, dto.budgetFeet);
  }
  @Post("preview") preview(
    @Param("worldId") worldId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: PreviewWorldRulesDto,
  ) {
    return this.rules.preview(
      worldId,
      request.user!.id,
      dto.event,
      dto.state,
      dto.entropy,
    );
  }
}
