import {
  Body,
  Controller,
  Delete,
  Get,
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
import { GmGuard } from "../auth/auth.guard";

@ApiTags("graph")
@Controller("graph/tuples")
@UseGuards(GmGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  @ApiOperation({ summary: "Query tuples using a LevelGraph pattern" })
  async list(@Query() pattern: GraphPatternDto) {
    const items = await this.graph.get(pattern);
    return { items, count: items.length };
  }

  @Post()
  @ApiOperation({ summary: "Add one or more graph tuples" })
  async create(@Body() dto: PutGraphTriplesDto) {
    await this.graph.put(dto.triples);
    return { created: dto.triples.length };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete all tuples matching a pattern" })
  async remove(@Body() dto: DeleteGraphTriplesDto) {
    return { deleted: await this.graph.remove(dto.pattern) };
  }
}
