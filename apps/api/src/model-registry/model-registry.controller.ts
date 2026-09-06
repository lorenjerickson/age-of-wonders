import {
  BadRequestException,
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
  CreateModelMigrationPlanDto,
  CreateModelRegistryDto,
  ExtendModelSchemaReleaseDto,
} from "./dto/model-registry.dto";
import { ModelRegistryService } from "./model-registry.service";

@Controller("model-registries")
@UseGuards(GmGuard)
export class ModelRegistryController {
  constructor(private readonly registries: ModelRegistryService) {}
  @Get() list(
    @Req() req: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = pagination(limit, offset);
    return this.registries.list(req.user!.id, page.limit, page.offset);
  }
  @Post() create(
    @Req() req: Request & AuthenticatedRequest,
    @Body() dto: CreateModelRegistryDto,
  ) {
    return this.registries.create(dto, req.user!.id);
  }
  @Post(":id/releases")
  createRelease(
    @Param("id") id: string,
    @Req() req: Request & AuthenticatedRequest,
    @Body() dto: ExtendModelSchemaReleaseDto,
  ) {
    return this.registries.extendRelease(id, dto, req.user!.id);
  }
  @Get(":id/migrations")
  listMigrations(
    @Param("id") id: string,
    @Req() req: Request & AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const page = pagination(limit, offset);
    return this.registries.listMigrationPlans(
      id,
      req.user!.id,
      page.limit,
      page.offset,
    );
  }
  @Post(":id/migrations")
  createMigration(
    @Param("id") id: string,
    @Req() req: Request & AuthenticatedRequest,
    @Body() dto: CreateModelMigrationPlanDto,
  ) {
    return this.registries.createMigrationPlan(id, dto, req.user!.id);
  }
  @Get(":id") get(
    @Param("id") id: string,
    @Req() req: Request & AuthenticatedRequest,
  ) {
    return this.registries.get(id, req.user!.id);
  }
}

function pagination(limitValue?: string, offsetValue?: string) {
  const limit = limitValue === undefined ? 50 : Number(limitValue);
  const offset = offsetValue === undefined ? 0 : Number(offsetValue);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new BadRequestException("Pagination values are invalid.");
  }
  return { limit, offset };
}
