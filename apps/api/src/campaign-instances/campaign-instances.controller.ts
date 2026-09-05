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
import { CampaignInstancesService } from "./campaign-instances.service";
import { CreateCampaignInstanceDto } from "./dto/create-campaign-instance.dto";

@ApiTags("campaign instances")
@Controller("campaign-instances")
@UseGuards(GmGuard)
export class CampaignInstancesController {
  constructor(
    @Inject(CampaignInstancesService)
    private readonly instances: Pick<
      CampaignInstancesService,
      "list" | "get" | "create"
    >,
  ) {}

  @Get()
  @ApiOperation({ summary: "List Campaign Instances and captured provenance" })
  list(@Req() request: Request & AuthenticatedRequest) {
    return this.instances.list(request.user!.id);
  }

  @Post()
  @ApiOperation({
    summary: "Create a Campaign Instance from an immutable Definition snapshot",
  })
  create(
    @Req() request: Request & AuthenticatedRequest,
    @Body() dto: CreateCampaignInstanceDto,
  ) {
    return this.instances.create(dto, request.user!.id);
  }

  @Get(":id")
  @ApiParam({ name: "id", description: "Campaign Instance ID" })
  @ApiOperation({
    summary: "Get one Campaign Instance without exposing runtime state",
  })
  get(
    @Param("id") id: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.instances.get(id, request.user!.id);
  }
}
