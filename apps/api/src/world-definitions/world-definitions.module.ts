import { Module } from "@nestjs/common";
import { WorldDefinitionsService } from "./world-definitions.service";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { WorldAuthoringController } from "./world-authoring.controller";

@Module({
  imports: [ModelRegistryModule],
  controllers: [WorldAuthoringController],
  providers: [WorldDefinitionsService, WorldDefinitionAuthoringService],
  exports: [WorldDefinitionsService, WorldDefinitionAuthoringService],
})
export class WorldDefinitionsModule {}
