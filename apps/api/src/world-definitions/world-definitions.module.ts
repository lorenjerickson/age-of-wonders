import { Module } from "@nestjs/common";
import { WorldDefinitionsController } from "./world-definitions.controller";
import { WorldDefinitionsService } from "./world-definitions.service";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { LegacyApiDeprecationInterceptor } from "../api-compat/legacy-api-deprecation.interceptor";
import { WorldAuthoringController } from "./world-authoring.controller";

@Module({
  imports: [ModelRegistryModule],
  controllers: [WorldAuthoringController, WorldDefinitionsController],
  providers: [
    WorldDefinitionsService,
    WorldDefinitionAuthoringService,
    LegacyApiDeprecationInterceptor,
  ],
  exports: [WorldDefinitionsService, WorldDefinitionAuthoringService],
})
export class WorldDefinitionsModule {}
