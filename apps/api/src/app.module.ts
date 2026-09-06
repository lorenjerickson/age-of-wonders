import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "./ai/ai.module";
import { DomainModule } from "./domain/domain.module";
import { HealthModule } from "./health/health.module";
import { MediaModule } from "./media/media.module";
import { GraphModule } from "./graph/graph.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ServiceFailureInterceptor } from "./logging/service-failure.interceptor";
import { TransferModule } from "./transfer/transfer.module";
import { AuthModule } from "./auth/auth.module";
import { WorldDefinitionsModule } from "./world-definitions/world-definitions.module";
import { CampaignDefinitionsModule } from "./campaign-definitions/campaign-definitions.module";
import { CampaignInstancesModule } from "./campaign-instances/campaign-instances.module";
import { ModelRegistryModule } from "./model-registry/model-registry.module";
import { PlayersModule } from "./players/players.module";
import { SystemSettingsModule } from "./settings/system-settings.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    MediaModule,
    GraphModule,
    DomainModule,
    AiModule,
    TransferModule,
    WorldDefinitionsModule,
    CampaignDefinitionsModule,
    CampaignInstancesModule,
    ModelRegistryModule,
    PlayersModule,
    SystemSettingsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ServiceFailureInterceptor,
    },
  ],
})
export class AppModule {}
