import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DeleteGraphTriplesDto,
  GraphPatternDto,
  PutGraphTriplesDto,
} from "./dto/graph.dto";
import { GraphService } from "./graph.service";
import { SystemAdministratorGuard } from "../auth/auth.guard";

@ApiTags("graph")
@Controller("graph/tuples")
@UseGuards(SystemAdministratorGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  @Header("Deprecation", "true")
  @ApiOperation({ summary: "Query tuples using a LevelGraph pattern" })
  async list(@Query() pattern: GraphPatternDto) {
    const items = await this.graph.get(pattern);
    return { items, count: items.length };
  }

  @Post()
  @Header("Deprecation", "true")
  @ApiOperation({ summary: "Add one or more graph tuples" })
  create(@Body() dto: PutGraphTriplesDto): never {
    void dto;
    throw new ConflictException(
      "Direct graph mutation is disabled. Graph relationships are derived from authoritative domain writes.",
    );
  }

  @Delete()
  @Header("Deprecation", "true")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete all tuples matching a pattern" })
  remove(@Body() dto: DeleteGraphTriplesDto): never {
    void dto;
    throw new ConflictException(
      "Direct graph mutation is disabled. Use an authorized projection reconciliation workflow.",
    );
  }
}
