import { Module } from "@nestjs/common";
import { DomainModule } from "../domain/domain.module";
import { CharacterDraftsController } from "./character-drafts.controller";
import { CharacterDraftsService } from "./character-drafts.service";

@Module({
  imports: [DomainModule],
  controllers: [CharacterDraftsController],
  providers: [CharacterDraftsService],
})
export class CharactersModule {}
