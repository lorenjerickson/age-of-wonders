import { BadRequestException, Injectable } from "@nestjs/common";
// LevelGraph is published with `module.exports = factory`, not an ES export.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import levelgraph = require("levelgraph");
import { PrismaService } from "../prisma/prisma.service";
import type { DomainResource } from "../domain/domain-resource";
import type { GraphPatternDto } from "./dto/graph.dto";
import { tuplesForDomainResource, type GraphTriple } from "./graph-tuples";
import { PostgresLevelAdapter } from "./postgres-level.adapter";

@Injectable()
export class GraphService {
  private readonly graph: levelgraph.LevelGraphDatabase;
  private readonly adapter: PostgresLevelAdapter;

  constructor(prisma: PrismaService) {
    this.adapter = new PostgresLevelAdapter(prisma);
    this.graph = levelgraph(this.adapter);
  }

  get(pattern: GraphPatternDto): Promise<GraphTriple[]> {
    const query: levelgraph.TriplePattern = {
      subject: pattern.subject,
      predicate: pattern.predicate,
      object: pattern.object,
      limit: pattern.limit,
    };
    return new Promise((resolve, reject) => {
      this.graph.get(query, (error, triples) => {
        if (error) reject(error);
        else resolve(triples);
      });
    });
  }

  put(triples: GraphTriple[]): Promise<void> {
    this.assertTriples(triples);
    return new Promise((resolve, reject) => {
      this.graph.put(triples, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async remove(pattern: GraphPatternDto): Promise<number> {
    const triples = await this.get({ ...pattern, limit: 500 });
    if (triples.length === 0) return 0;
    await new Promise<void>((resolve, reject) => {
      this.graph.del(triples, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return triples.length;
  }

  async addDomainResource(
    resource: DomainResource,
    id: string,
    data: Record<string, unknown>,
    kind?: string,
    name?: string,
  ): Promise<void> {
    await this.put(tuplesForDomainResource(resource, id, data, kind, name));
  }

  replaceDomainResource(
    resource: DomainResource,
    id: string,
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
    previousKind?: string,
    previousName?: string,
    nextKind?: string,
    nextName?: string,
  ): Promise<void> {
    const oldTriples = tuplesForDomainResource(
      resource,
      id,
      previous,
      previousKind,
      previousName,
    );
    const newTriples = tuplesForDomainResource(
      resource,
      id,
      next,
      nextKind,
      nextName,
    );
    return this.batchReplace(oldTriples, newTriples);
  }

  removeDomainResource(
    resource: DomainResource,
    id: string,
    data: Record<string, unknown>,
    kind?: string,
    name?: string,
  ): Promise<void> {
    return this.batchReplace(
      tuplesForDomainResource(resource, id, data, kind, name),
      [],
    );
  }

  private batchReplace(
    oldTriples: GraphTriple[],
    newTriples: GraphTriple[],
  ): Promise<void> {
    const operations = [
      ...oldTriples.flatMap((triple) =>
        this.graph.generateBatch(triple, "del"),
      ),
      ...newTriples.flatMap((triple) =>
        this.graph.generateBatch(triple, "put"),
      ),
    ];
    return new Promise((resolve, reject) => {
      this.adapter.batch(operations, {}, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private assertTriples(triples: GraphTriple[]): void {
    for (const triple of triples) {
      if (
        !triple.subject?.trim() ||
        !triple.predicate?.trim() ||
        !triple.object?.trim()
      ) {
        throw new BadRequestException(
          "Graph triples require non-empty subject, predicate, and object strings",
        );
      }
    }
  }
}
