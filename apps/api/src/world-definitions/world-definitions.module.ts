import { Module } from "@nestjs/common";
import { WorldDefinitionsController } from "./world-definitions.controller";
import { WorldDefinitionsService } from "./world-definitions.service";

@Module({
  controllers: [WorldDefinitionsController],
  providers: [WorldDefinitionsService],
  exports: [WorldDefinitionsService],
})
export class WorldDefinitionsModule {}
