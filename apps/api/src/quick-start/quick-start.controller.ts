import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GmGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { UpdateQuickStartProgressDto } from "./dto/quick-start.dto";
import { QuickStartService } from "./quick-start.service";

@ApiTags("quick-start")
@Controller("me/quick-start")
@UseGuards(GmGuard)
export class QuickStartController {
  constructor(private readonly quickStart: QuickStartService) {}

  @Get()
  overview(@Req() request: Request & AuthenticatedRequest) {
    return this.quickStart.overview(request.user!.id);
  }

  @Get(":activityKey")
  activity(
    @Param("activityKey") activityKey: string,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.quickStart.activity(request.user!.id, activityKey);
  }

  @Put(":activityKey")
  update(
    @Param("activityKey") activityKey: string,
    @Body() dto: UpdateQuickStartProgressDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.quickStart.update(request.user!.id, activityKey, dto);
  }
}
