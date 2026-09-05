import { Module } from "@nestjs/common";
import { ModelRegistryController } from "./model-registry.controller";
import { ModelRegistryService } from "./model-registry.service";
import { CoreModelRegistryBootstrapService } from "./core-model-registry-bootstrap.service";

@Module({
  controllers: [ModelRegistryController],
  providers: [ModelRegistryService, CoreModelRegistryBootstrapService],
  exports: [ModelRegistryService],
})
export class ModelRegistryModule {}
