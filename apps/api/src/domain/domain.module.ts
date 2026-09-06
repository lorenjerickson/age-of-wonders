import { Module } from "@nestjs/common";
import { GraphModule } from "../graph/graph.module";
import { DomainService } from "./domain.service";
import { ScienceDomainArchiveService } from "./science-domain-archive.service";
import { ScienceDomainMigrationRunnerService } from "./science-domain-migration-runner.service";

@Module({
  imports: [GraphModule],
  controllers: [],
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
