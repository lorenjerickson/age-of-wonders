import { Module } from "@nestjs/common";
import { WorldDefinitionsController } from "./world-definitions.controller";
import { WorldDefinitionsService } from "./world-definitions.service";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";

@Module({
  imports: [ModelRegistryModule],
  controllers: [WorldDefinitionsController],
  providers: [WorldDefinitionsService, WorldDefinitionAuthoringService],
  exports: [WorldDefinitionsService, WorldDefinitionAuthoringService],
})
export class WorldDefinitionsModule {}
