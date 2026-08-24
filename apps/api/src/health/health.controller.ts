import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Check API and database health" })
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    };
  }
}
