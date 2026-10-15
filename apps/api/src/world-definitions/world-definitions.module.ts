import { WorldAccessGuard } from "./world-access.guard";
import { WorldAccessController } from "./world-access.controller";
import { WorldCodexController } from "./world-codex.controller";
import { WorldCodexService } from "./world-codex.service";
import { Module } from "@nestjs/common";
import { WorldDefinitionsService } from "./world-definitions.service";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { ModelRegistryModule } from "../model-registry/model-registry.module";
import { WorldAuthoringController } from "./world-authoring.controller";
import { WorldRulesController } from "./world-rules.controller";
import { WorldRulesService } from "./world-rules.service";

@Module({
  imports: [ModelRegistryModule],
  controllers: [
    WorldAuthoringController,
    WorldRulesController,
    WorldCodexController,
    WorldAccessController,
  ],
  providers: [
    WorldAccessGuard,
    WorldDefinitionsService,
    WorldDefinitionAuthoringService,
    WorldRulesService,
    WorldCodexService,
  ],
  exports: [WorldDefinitionsService, WorldDefinitionAuthoringService],
})
export class WorldDefinitionsModule {}
