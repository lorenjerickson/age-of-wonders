import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { DomainModule } from "./domain.module";
import { TransferModule } from "../transfer/transfer.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    PrismaModule,
    DomainModule,
    TransferModule,
  ],
})
export class DomainOperationsModule {}
