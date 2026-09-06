import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateDomainResourceDto,
  ListDomainResourcesDto,
  ReplaceDomainResourceDto,
} from "./dto/domain-resource.dto";
import { assertDomainResource, DOMAIN_RESOURCES } from "./domain-resource";
import { DomainService } from "./domain.service";
import { GmGuard } from "../auth/auth.guard";

@ApiTags("domain")
@ApiParam({ name: "resource", enum: DOMAIN_RESOURCES })
@Controller("domain/:resource")
@UseGuards(GmGuard)
export class DomainController {
  constructor(private readonly domain: DomainService) {}

  @Post()
  @Header("Deprecation", "true")
  @ApiOperation({ summary: "Create a domain aggregate" })
  @ApiCreatedResponse({ description: "The aggregate was created." })
  create(
    @Param("resource") resourceValue: string,
    @Body() dto: CreateDomainResourceDto,
  ) {
    const resource = assertDomainResource(resourceValue);
    assertLegacyRuntimeWriteDisabled(resource);
    return this.domain.create(resource, dto.data);
  }

  @Get()
  @Header("Deprecation", "true")
  @ApiOperation({ summary: "List domain aggregates" })
  list(
    @Param("resource") resourceValue: string,
    @Query() query: ListDomainResourcesDto,
  ) {
    return this.domain.list(assertDomainResource(resourceValue), query);
  }

  @Get(":id")
  @Header("Deprecation", "true")
  @ApiOperation({ summary: "Get a domain aggregate by ID" })
  get(@Param("resource") resourceValue: string, @Param("id") id: string) {
    return this.domain.get(assertDomainResource(resourceValue), id);
  }

  @Put(":id")
  @Header("Deprecation", "true")
  @ApiOperation({ summary: "Replace a domain aggregate" })
  replace(
    @Param("resource") resourceValue: string,
    @Param("id") id: string,
    @Body() dto: ReplaceDomainResourceDto,
  ) {
    const resource = assertDomainResource(resourceValue);
    assertLegacyRuntimeWriteDisabled(resource);
    return this.domain.replace(resource, id, dto);
  }

  @Delete(":id")
  @Header("Deprecation", "true")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a domain aggregate" })
  @ApiNoContentResponse({ description: "The aggregate was deleted." })
  async remove(
    @Param("resource") resourceValue: string,
    @Param("id") id: string,
  ): Promise<void> {
    const resource = assertDomainResource(resourceValue);
    assertLegacyRuntimeWriteDisabled(resource);
    await this.domain.remove(resource, id);
  }
}

const QUARANTINED_LEGACY_WRITES = new Set([
  "campaigns",
  "games",
  "sessions",
  "scenes",
  "encounters",
  "pending-decisions",
  "game-events",
  "systems",
]);

function assertLegacyRuntimeWriteDisabled(resource: string): void {
  if (QUARANTINED_LEGACY_WRITES.has(resource)) {
    throw new ConflictException(
      "Legacy campaign and play-state writes are disabled. Use Campaign Definition authoring or Campaign Instance management.",
    );
  }
}
