import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DomainModule } from "./domain.module";
import { TransferModule } from "../transfer/transfer.module";
import { ModelRegistryModule } from "../model-registry/model-registry.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    AuthModule,
    PrismaModule,
    ModelRegistryModule,
    DomainModule,
    TransferModule,
  ],
})
export class DomainOperationsModule {}
