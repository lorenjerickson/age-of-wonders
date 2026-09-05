import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  CreateModelRegistryDto,
  ExtendModelSchemaReleaseDto,
} from "./dto/model-registry.dto";
import { ModelRegistryService } from "./model-registry.service";

@Controller("model-registries")
@UseGuards(GmGuard)
export class ModelRegistryController {
  constructor(private readonly registries: ModelRegistryService) {}
  @Get() list(@Req() req: Request & AuthenticatedRequest) {
    return this.registries.list(req.user!.id);
  }
  @Post() create(
    @Req() req: Request & AuthenticatedRequest,
    @Body() dto: CreateModelRegistryDto,
  ) {
    return this.registries.create(dto, req.user!.id);
  }
  @Get("effective") effective(
    @Query("worldDefinitionId") worldId: string,
    @Req() req: Request & AuthenticatedRequest,
  ) {
    return this.registries.effective(worldId, req.user!.id);
  }
  @Post(":id/releases/extend") extendRelease(
    @Param("id") id: string,
    @Req() req: Request & AuthenticatedRequest,
    @Body() dto: ExtendModelSchemaReleaseDto,
  ) {
    return this.registries.extendRelease(id, dto, req.user!.id);
  }
  @Get(":id") get(
    @Param("id") id: string,
    @Req() req: Request & AuthenticatedRequest,
  ) {
    return this.registries.get(id, req.user!.id);
  }
}
