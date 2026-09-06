import { Module } from "@nestjs/common";
import { GraphService } from "./graph.service";

@Module({
  controllers: [],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {}
