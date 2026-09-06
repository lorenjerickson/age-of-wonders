import { Global, Module } from "@nestjs/common";
import { HostedConfigurationService } from "./hosted-configuration.service";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";

@Global()
@Module({
  controllers: [SystemSettingsController],
  providers: [HostedConfigurationService, SystemSettingsService],
  exports: [HostedConfigurationService],
})
export class SystemSettingsModule {}
