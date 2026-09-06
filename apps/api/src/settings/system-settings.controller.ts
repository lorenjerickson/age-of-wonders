import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SystemAdministratorGuard } from "../auth/auth.guard";
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
}
