import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EffectDefinition,
  ConditionDefinition,
  CharacterTemplate,
} from "@aow/domain";
import { randomUUID } from "node:crypto";
import {
  WORLD_CODEX_RESOURCES,
  type WorldCodexCollection,
  type WorldCodexEntry,
} from "@aow/common";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { isObject } from "../domain/domain-resource";
import { worldCodexSnapshotIssue } from "./world-codex-validation";
import { PrismaService } from "../prisma/prisma.service";
export interface CodexRevision {
  expectedDraftId: string;
  expectedStorageRevision: number;
}
@Injectable()
export class WorldCodexService {
  constructor(
    private readonly authoring: WorldDefinitionAuthoringService,
    private readonly prisma: PrismaService,
  ) {}
  private collection(value: string): WorldCodexCollection {
    if (!Object.hasOwn(WORLD_CODEX_RESOURCES, value))
      throw new NotFoundException("The Codex collection was not found.");
    return value as WorldCodexCollection;
  }
  async list(worldId: string, userId: string, collection: string) {
    const kind = this.collection(collection);
    return this.projection(
      await this.authoring.getDraft(worldId, userId),
      kind,
    );
  }
  async upsert(
    worldId: string,
    userId: string,
    collection: string,
    expected: CodexRevision,
    input: unknown,
    id?: string,
  ) {
    const kind = this.collection(collection),
      draft = await this.checkedDraft(worldId, userId, expected);
    const resourceType = WORLD_CODEX_RESOURCES[kind];
    const previous = draft.records.find(
      (r) => r.resourceType === resourceType && r.sourceId === id,
    );
    if (id && !previous)
      throw new NotFoundException("The Codex entry was not found.");
    if (!isObject(input))
      throw new BadRequestException("Provide a Codex entry.");
    const prior = isObject(previous?.payload) ? previous.payload : undefined;
    const entryId = id ?? randomUUID();
    let entry: Record<string, unknown> & { id: string; revision: number };
    try {
      entry =
        kind === "effects"
          ? EffectDefinition.authorPayload(entryId, input, prior)
          : kind === "conditions"
            ? ConditionDefinition.authorPayload(entryId, input, prior)
            : CharacterTemplate.authorPayload(entryId, input, prior);
    } catch (error) {
      if (error instanceof TypeError)
        throw new BadRequestException(error.message);
      throw error;
    }
    const records = [
      ...draft.records.filter(
        (r) => !(r.resourceType === resourceType && r.sourceId === entry.id),
      ),
      {
        resourceType,
        sourceId: entry.id,
        sourceRevision: entry.revision,
        payload: entry,
      },
    ];
    const issue = worldCodexSnapshotIssue(records, draft.records);
    if (issue) throw new BadRequestException(issue);
    if (kind === "characters" && isObject(input.images))
      for (const [role, image] of Object.entries(input.images)) {
        if (!isObject(image)) continue;
        const inherited = isObject(prior?.images)
          ? prior.images[role]
          : undefined;
        const preserved = CharacterTemplate.preservedArtwork(image, inherited);
        if (preserved) {
          input.images[role] = preserved;
          continue;
        }
        const asset = await this.prisma.mediaAsset.findFirst({
          where: {
            id: String(image.assetId),
            scopeType: "world-definition",
            scopeId: worldId,
            mimeType: { startsWith: "image/" },
          },
        });
        if (!asset)
          throw new BadRequestException(
            "The selected Character artwork is unavailable.",
          );
        input.images[role] = CharacterTemplate.verifiedArtwork(
          image,
          asset.mimeType,
        );
      }
    return this.projection(
      await this.authoring.save(
        worldId,
        {
          ...expected,
          revisionName: draft.revisionName,
          content: draft.content as Record<string, unknown>,
          records,
        },
        userId,
        false,
        true,
      ),
      kind,
    );
  }
  async remove(
    worldId: string,
    userId: string,
    collection: string,
    expected: CodexRevision,
    id: string,
  ) {
    const kind = this.collection(collection),
      draft = await this.checkedDraft(worldId, userId, expected),
      resourceType = WORLD_CODEX_RESOURCES[kind];
    if (
      !draft.records.some(
        (r) => r.resourceType === resourceType && r.sourceId === id,
      )
    )
      throw new NotFoundException("The Codex entry was not found.");
    const records = draft.records.filter(
      (r) => !(r.resourceType === resourceType && r.sourceId === id),
    );
    const issue = worldCodexSnapshotIssue(records, draft.records);
    if (issue)
      throw new ConflictException(
        "This entry is still used in the World. Remove its references before deleting it.",
      );
    return this.projection(
      await this.authoring.save(
        worldId,
        {
          ...expected,
          revisionName: draft.revisionName,
          content: draft.content as Record<string, unknown>,
          records,
        },
        userId,
        false,
        true,
      ),
      kind,
    );
  }
  private async checkedDraft(
    worldId: string,
    userId: string,
    expected: CodexRevision,
  ) {
    const draft = await this.authoring.getActiveDraft(worldId, userId);
    if (
      draft.id !== expected.expectedDraftId ||
      draft.storageRevision !== expected.expectedStorageRevision
    )
      throw new ConflictException(
        "The World draft changed. Reload before saving.",
      );
    return draft;
  }
  private projection(
    draft: Awaited<ReturnType<WorldDefinitionAuthoringService["getDraft"]>>,
    kind: WorldCodexCollection,
  ) {
    return {
      worldDefinitionId: draft.worldDefinitionId,
      draftId: draft.id,
      storageRevision: draft.storageRevision,
      items: draft.records
        .filter((r) => r.resourceType === WORLD_CODEX_RESOURCES[kind])
        .map((r) => r.payload as WorldCodexEntry),
    };
  }
}
