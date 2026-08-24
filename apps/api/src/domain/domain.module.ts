import { Module } from "@nestjs/common";
import { GraphModule } from "../graph/graph.module";
import { DomainController } from "./domain.controller";
import { DomainService } from "./domain.service";
import { ScienceDomainArchiveService } from "./science-domain-archive.service";
import { ScienceDomainMigrationRunnerService } from "./science-domain-migration-runner.service";
import { WorldsController } from "./worlds.controller";

@Module({
  imports: [GraphModule],
  controllers: [DomainController, WorldsController],
  providers: [
    DomainService,
    ScienceDomainArchiveService,
    ScienceDomainMigrationRunnerService,
  ],
  exports: [
    DomainService,
    ScienceDomainArchiveService,
    ScienceDomainMigrationRunnerService,
  ],
})
export class DomainModule {}
