import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SystemAdministratorGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import type { Request } from "express";
import {
  ReplaceSystemSecretDto,
  SystemSettingActionDto,
  UpdateSystemSettingDto,
} from "./dto/system-setting.dto";
import { SystemSettingsService } from "./system-settings.service";

@ApiTags("system settings")
@Controller("settings/system")
@UseGuards(SystemAdministratorGuard)
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  index() {
    return this.settings.index();
  }

  @Get(":systemArea")
  area(@Param("systemArea") systemArea: string) {
    return this.settings.area(systemArea);
  }

  @Put(":systemArea/settings/:settingKey")
  async update(
    @Param("systemArea") systemArea: string,
    @Param("settingKey") settingKey: string,
    @Body() dto: UpdateSystemSettingDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.settings.updateValue(
      systemArea,
      settingKey,
      dto,
      request.user!.id,
    );
  }

  @Post(":systemArea/settings/:settingKey/secret")
  async replaceSecret(
    @Param("systemArea") systemArea: string,
    @Param("settingKey") settingKey: string,
    @Body() dto: ReplaceSystemSecretDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.settings.replaceSecret(
      systemArea,
      settingKey,
      dto,
      request.user!.id,
    );
  }

  @Post(":systemArea/settings/:settingKey/actions/revoke")
  async revoke(
    @Param("systemArea") systemArea: string,
    @Param("settingKey") settingKey: string,
    @Body() dto: SystemSettingActionDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.settings.revokeSecret(
      systemArea,
      settingKey,
      dto,
      request.user!.id,
    );
  }

  @Post(":systemArea/settings/:settingKey/actions/reset")
  async reset(
    @Param("systemArea") systemArea: string,
    @Param("settingKey") settingKey: string,
    @Body() dto: SystemSettingActionDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.settings.reset(systemArea, settingKey, dto, request.user!.id);
  }

  @Post(":systemArea/settings/:settingKey/actions/test")
  async test(
    @Param("systemArea") systemArea: string,
    @Param("settingKey") settingKey: string,
    @Body() dto: SystemSettingActionDto,
    @Req() request: Request & AuthenticatedRequest,
  ) {
    return this.settings.test(systemArea, settingKey, dto, request.user!.id);
  }

  @Get(":systemArea/settings/:settingKey/history")
  history(
    @Param("systemArea") systemArea: string,
    @Param("settingKey") settingKey: string,
  ) {
    return this.settings.history(systemArea, settingKey);
  }
}
