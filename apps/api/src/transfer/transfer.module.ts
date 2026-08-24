import { Module } from "@nestjs/common";
import { GraphModule } from "../graph/graph.module";
import { MediaModule } from "../media/media.module";
import { HostTransferService } from "./host-transfer.service";

@Module({
  imports: [GraphModule, MediaModule],
  providers: [HostTransferService],
  exports: [HostTransferService],
})
export class TransferModule {}
