import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CreateWorldDefinitionDto } from "./dto/create-world-definition.dto";
import { PublishWorldDefinitionRevisionDto } from "./dto/publish-world-definition-revision.dto";
import { WorldDefinitionsService } from "./world-definitions.service";

@ApiTags("world definitions")
@Controller("world-definitions")
@UseGuards(GmGuard)
export class WorldDefinitionsController {
  constructor(
    @Inject(WorldDefinitionsService)
    private readonly worlds: Pick<
      WorldDefinitionsService,
      "list" | "get" | "create" | "publishRevision"
    >,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List World Definition lineages and current revision metadata",
  })
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.worlds.list(request.user!.id);
  }

  @Post()
  @ApiOperation({
    summary: "Create and publish a new World Definition lineage",
  })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateWorldDefinitionDto,
  ) {
    return this.worlds.create(dto, request.user!.id);
  }

  @Post(":id/revisions")
  @ApiParam({ name: "id", description: "World Definition lineage ID" })
  @ApiOperation({
    summary: "Publish the next complete direct-lineage World revision",
  })
  publishRevision(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: PublishWorldDefinitionRevisionDto,
  ) {
    return this.worlds.publishRevision(id, dto, request.user!.id);
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "World Definition lineage ID" })
  @ApiOperation({
    summary: "Get one World Definition lineage, its revisions, and snapshots",
  })
  get(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.worlds.get(id, request.user!.id);
  }
}
