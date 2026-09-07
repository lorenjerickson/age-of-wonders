import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const CONTENT_NOT_RETAINED = "[content not retained]";

export interface RecordGenerationAuditInput {
  readonly kind: string;
  readonly ownerUserId: string;
  readonly contextType?: string;
  readonly contextId?: string;
  readonly model: string;
  readonly providerResponseId?: string;
}

@Injectable()
export class GenerationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordGenerationAuditInput): Promise<{ id: string }> {
    const kind = bounded(input.kind, 80, "generation kind");
    const ownerUserId = bounded(input.ownerUserId, 240, "generation owner");
    const model = bounded(input.model, 120, "generation model");
    const contextType = optionalBounded(
      input.contextType,
      80,
      "generation context type",
    );
    const contextId = optionalBounded(
      input.contextId,
      240,
      "generation context",
    );
    const responseId = optionalBounded(
      input.providerResponseId,
      240,
      "provider response",
    );
    return this.prisma.generation.create({
      data: {
        kind,
        prompt: CONTENT_NOT_RETAINED,
        output: CONTENT_NOT_RETAINED,
        model,
        responseId,
        createdByUserId: ownerUserId,
        contextType,
        contextId,
      },
      select: { id: true },
    });
  }

  async listForOwner(ownerUserId: string) {
    const rows = await this.prisma.generation.findMany({
      where: { createdByUserId: ownerUserId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        kind: true,
        model: true,
        contextType: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({ ...row, contentRetained: false as const }));
  }
}

function bounded(value: string, maximum: number, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(`The ${label} is invalid.`);
  }
  return normalized;
}

function optionalBounded(
  value: string | undefined,
  maximum: number,
  label: string,
): string | undefined {
  return value === undefined ? undefined : bounded(value, maximum, label);
}
