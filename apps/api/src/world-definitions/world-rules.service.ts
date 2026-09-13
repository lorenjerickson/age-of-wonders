import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  executeWorldRules,
  starterMovementRules,
  validateWorldRule,
  validateWorldRules,
  WORLD_RULE_RESOURCE,
  type WorldRule,
  type WorldRuleEvent,
  type RuleStateView,
  type RecordedRuleRoll,
} from "@aow/common";
import { WorldDefinitionAuthoringService } from "./world-definition-authoring.service";
import { isPublicationJson } from "../domain/snapshot-manifest";

export interface WorldRulesRevision {
  expectedDraftId: string;
  expectedStorageRevision: number;
}

@Injectable()
export class WorldRulesService {
  constructor(private readonly authoring: WorldDefinitionAuthoringService) {}

  async list(worldId: string, userId: string) {
    return this.projection(
      await this.authoring.getActiveDraft(worldId, userId),
    );
  }

  async upsert(
    worldId: string,
    userId: string,
    expected: WorldRulesRevision,
    input: unknown,
    ruleId?: string,
  ) {
    const draft = await this.checkedDraft(worldId, userId, expected);
    const prior = ruleId
      ? draft.records.find(
          (r) =>
            r.resourceType === WORLD_RULE_RESOURCE && r.sourceId === ruleId,
        )
      : undefined;
    if (ruleId && !prior)
      throw new NotFoundException("The selected World rule was not found.");
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("Choose a structured rule.");
    const previous = prior?.payload as WorldRule | undefined;
    const id = ruleId ?? randomUUID();
    const rule = {
      ...input,
      formatVersion: 1,
      id,
      revision: (previous?.revision ?? 0) + 1,
      audit: {
        createdBy: previous?.audit.createdBy ?? userId,
        updatedAt: new Date().toISOString(),
      },
    };
    const validation = validateWorldRule(rule);
    if (!validation.valid)
      throw new BadRequestException(validation.issues.join(" "));
    return this.save(draft, worldId, userId, expected, [
      ...draft.records.filter(
        (r) => !(r.resourceType === WORLD_RULE_RESOURCE && r.sourceId === id),
      ),
      {
        resourceType: WORLD_RULE_RESOURCE,
        sourceId: id,
        sourceRevision: rule.revision,
        payload: rule,
      },
    ]);
  }

  async duplicate(
    worldId: string,
    userId: string,
    expected: WorldRulesRevision,
    ruleId: string,
  ) {
    const draft = await this.checkedDraft(worldId, userId, expected);
    const prior = draft.records.find(
      (r) => r.resourceType === WORLD_RULE_RESOURCE && r.sourceId === ruleId,
    )?.payload as WorldRule | undefined;
    if (!prior)
      throw new NotFoundException("The selected World rule was not found.");
    return this.upsert(worldId, userId, expected, {
      ...prior,
      name: `${prior.name} copy`,
      lifecycle: "disabled",
    });
  }

  async starter(
    worldId: string,
    userId: string,
    expected: WorldRulesRevision,
    budgetFeet = 30,
  ) {
    const draft = await this.checkedDraft(worldId, userId, expected);
    if (!Number.isFinite(budgetFeet) || budgetFeet <= 0 || budgetFeet > 10000)
      throw new BadRequestException(
        "Choose a movement budget between zero and 10,000 feet.",
      );
    // This library is adopted only through this explicit GM command. New Worlds and old captures stay inert.
    const rules = starterMovementRules({
      budgetFeet,
      ids: Array.from({ length: 6 }, () => randomUUID()),
      createdBy: userId,
      updatedAt: new Date().toISOString(),
    });
    return this.save(draft, worldId, userId, expected, [
      ...draft.records,
      ...rules.map((rule) => ({
        resourceType: WORLD_RULE_RESOURCE,
        sourceId: rule.id,
        sourceRevision: rule.revision,
        payload: rule,
      })),
    ]);
  }

  async preview(
    worldId: string,
    userId: string,
    event: WorldRuleEvent,
    state: RuleStateView,
    entropy: readonly RecordedRuleRoll[] = [],
  ) {
    const draft = await this.authoring.getActiveDraft(worldId, userId);
    if (!isPublicationJson({ event, state, entropy }))
      throw new BadRequestException(
        "Choose bounded example state and event data.",
      );
    return executeWorldRules({
      rules: this.projection(draft).rules,
      event,
      state,
      entropy,
    });
  }

  private async checkedDraft(
    worldId: string,
    userId: string,
    expected: WorldRulesRevision,
  ) {
    const draft = await this.authoring.getActiveDraft(worldId, userId);
    if (
      draft.id !== expected.expectedDraftId ||
      draft.storageRevision !== expected.expectedStorageRevision
    )
      throw new ConflictException(
        "The World draft changed. Reload the rules before saving.",
      );
    return draft;
  }

  private projection(
    draft: Awaited<
      ReturnType<WorldDefinitionAuthoringService["getActiveDraft"]>
    >,
  ) {
    return {
      worldDefinitionId: draft.worldDefinitionId,
      draftId: draft.id,
      storageRevision: draft.storageRevision,
      rules: draft.records
        .filter((r) => r.resourceType === WORLD_RULE_RESOURCE)
        .map((r) => r.payload as WorldRule),
    };
  }

  private async save(
    draft: Awaited<
      ReturnType<WorldDefinitionAuthoringService["getActiveDraft"]>
    >,
    worldId: string,
    userId: string,
    expected: WorldRulesRevision,
    records: typeof draft.records,
  ) {
    const validation = validateWorldRules(
      records
        .filter((r) => r.resourceType === WORLD_RULE_RESOURCE)
        .map((r) => r.payload),
    );
    if (!validation.valid)
      throw new BadRequestException(validation.issues.join(" "));
    const result = await this.authoring.save(
      worldId,
      {
        expectedDraftId: expected.expectedDraftId,
        expectedStorageRevision: expected.expectedStorageRevision,
        revisionName: draft.revisionName,
        content: draft.content as Record<string, unknown>,
        records,
      },
      userId,
      true,
    );
    return this.projection(result);
  }
}
