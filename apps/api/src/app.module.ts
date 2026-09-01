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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    PrismaModule,
    HealthModule,
    MediaModule,
    GraphModule,
    DomainModule,
    AiModule,
    TransferModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ServiceFailureInterceptor,
    },
  ],
})
export class AppModule {}
