import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
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
  @ApiOperation({ summary: "Create a domain aggregate" })
  @ApiCreatedResponse({ description: "The aggregate was created." })
  create(
    @Param("resource") resourceValue: string,
    @Body() dto: CreateDomainResourceDto,
  ) {
    const resource = assertDomainResource(resourceValue);
    assertLegacyCampaignWriteDisabled(resource);
    return this.domain.create(resource, dto.data);
  }

  @Get()
  @ApiOperation({ summary: "List domain aggregates" })
  list(
    @Param("resource") resourceValue: string,
    @Query() query: ListDomainResourcesDto,
  ) {
    return this.domain.list(assertDomainResource(resourceValue), query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a domain aggregate by ID" })
  get(@Param("resource") resourceValue: string, @Param("id") id: string) {
    return this.domain.get(assertDomainResource(resourceValue), id);
  }

  @Put(":id")
  @ApiOperation({ summary: "Replace a domain aggregate" })
  replace(
    @Param("resource") resourceValue: string,
    @Param("id") id: string,
    @Body() dto: ReplaceDomainResourceDto,
  ) {
    const resource = assertDomainResource(resourceValue);
    assertLegacyCampaignWriteDisabled(resource);
    return this.domain.replace(resource, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a domain aggregate" })
  @ApiNoContentResponse({ description: "The aggregate was deleted." })
  async remove(
    @Param("resource") resourceValue: string,
    @Param("id") id: string,
  ): Promise<void> {
    const resource = assertDomainResource(resourceValue);
    assertLegacyCampaignWriteDisabled(resource);
    await this.domain.remove(resource, id);
  }
}

function assertLegacyCampaignWriteDisabled(resource: string): void {
  if (resource === "campaigns") {
    throw new ConflictException(
      "Legacy Campaign writes are disabled. Use Campaign Definition authoring.",
    );
  }
}
