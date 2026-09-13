import { Module } from "@nestjs/common";
import { WorldDefinitionsService } from "./world-definitions.service";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { WorldAuthoringController } from "./world-authoring.controller";
import { WorldRulesController } from "./world-rules.controller";
import { WorldRulesService } from "./world-rules.service";

@Module({
  imports: [ModelRegistryModule],
  controllers: [WorldAuthoringController, WorldRulesController],
  providers: [WorldDefinitionsService, WorldDefinitionAuthoringService, WorldRulesService],
  exports: [WorldDefinitionsService, WorldDefinitionAuthoringService],
})
export class WorldDefinitionsModule {}
