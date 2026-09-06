import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { DomainService } from "./domain.service";
import { GmGuard } from "../auth/auth.guard";
import { LegacyApiDeprecationInterceptor } from "../api-compat/legacy-api-deprecation.interceptor";

@ApiTags("worlds")
@Controller("worlds")
@UseGuards(GmGuard)
export class WorldsController {
  constructor(private readonly domain: DomainService) {}

  @Delete(":id")
  @UseInterceptors(LegacyApiDeprecationInterceptor)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a world and all of its child locations" })
  @ApiParam({ name: "id", description: "Root world LocationState ID" })
  @ApiNoContentResponse({ description: "The world hierarchy was deleted." })
  async remove(@Param("id") id: string): Promise<void> {
    await this.domain.removeWorld(id);
  }
}
