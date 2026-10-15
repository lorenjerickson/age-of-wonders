import { validateCampaignDefinitionContent } from "./campaign-content-policy";
import { assertCampaignGovernedConformance } from "./definition-conformance";
import {
  Entity,
  copyEntityData,
  type EntityOptions,
  type ValidationContext,
  type DeepReadonly,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";
import {
  validateCampaignDefinitionDraft,
  type CampaignDraftRecord,
  type CampaignCapturedWorld,
} from "./campaign-definition-policy";
export interface CampaignDefinitionState {
  content: Record<string, unknown>;
  records: readonly CampaignDraftRecord[];
}
export interface CampaignDefinitionContext extends ValidationContext {
  campaignDefinitionId: string;
  capturedWorld: CampaignCapturedWorld;
}
type Commands = {
  replace: { params: CampaignDefinitionState; context: object };
  fork: {
    params: {
      targetCampaignId: string;
      mapping: Readonly<Record<string, Readonly<Record<string, string>>>>;
    };
    context: object;
  };
};
type Events = { changed: { operation: "replace" | "fork" } };
/** Aggregate authored content. Incomplete drafts remain editable; publication reads validity. */
export class CampaignDefinition extends Entity<
  CampaignDefinitionState,
  Commands,
  Events,
  CampaignDefinitionContext
> {
  static assertGovernedConformance = assertCampaignGovernedConformance;
  private constructor(
    data: CampaignDefinitionState,
    context: CampaignDefinitionContext,
    options?: EntityOptions,
  ) {
    super("campaign-definition", data, ["changed"], context, options);
    this.validate(context);
  }
  static validateContent = validateCampaignDefinitionDraft;
  static validateCapturedContent = validateCampaignDefinitionContent;
  static createContent() {
    return {
      formatVersion: 1,
      gmPremise: "",
      playerIntroduction: "",
      plotDefinitionIds: [],
      placementDefinitionIds: [],
      modelSchemaReleaseIds: [],
    };
  }
  static deserializePayload(
    value: unknown,
    context: CampaignDefinitionContext,
    options?: EntityOptions,
  ) {
    if (
      !isObject(value) ||
      !isObject(value.content) ||
      !Array.isArray(value.records)
    )
      throw new TypeError("Campaign content and records are required.");
    return new CampaignDefinition(
      copyEntityData(value) as unknown as CampaignDefinitionState,
      context,
      options,
    );
  }
  static deserialize(
    value: unknown,
    context: CampaignDefinitionContext,
    options?: EntityOptions,
  ) {
    if (isObject(value) && value.type === "campaign-definition") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Campaign Definition schema version.");
      value = value.data;
    }
    return this.deserializePayload(value, context, options);
  }
  serializePayload() {
    return this.serialize().data;
  }
  protected validateState(
    data: DeepReadonly<CampaignDefinitionState>,
    context: CampaignDefinitionContext,
  ) {
    return validateCampaignDefinitionDraft(
      context.campaignDefinitionId,
      data.content,
      data.records,
      context.capturedWorld,
    ).issues.map((issue) => ({
      code: issue.code,
      subject: issue.subject,
      message: issue.detail,
      blocking: context.mode === "publication",
    }));
  }
  protected handleCommand<K extends keyof Commands>(
    name: K,
    invocation: CommandInvocation<Commands[K]>,
  ): EntityTransition<CampaignDefinitionState, Events> {
    let data: CampaignDefinitionState;
    if (name === "replace") {
      data = copyEntityData(invocation.params) as CampaignDefinitionState;
      if (!isObject(data.content) || !Array.isArray(data.records))
        throw new TypeError("Campaign content and records are required.");
    } else if (name === "fork") {
      const { mapping, targetCampaignId } =
        invocation.params as Commands["fork"]["params"];
      data = {
        content: rewriteCampaignReferences(
          this.state.data.content,
          mapping,
          targetCampaignId,
        ) as Record<string, unknown>,
        records: this.state.data.records.map((record) => ({
          ...record,
          sourceId:
            mapping[record.resourceType]?.[record.sourceId] ?? record.sourceId,
          payload: rewriteCampaignReferences(
            record.payload,
            mapping,
            targetCampaignId,
            record.resourceType,
          ),
        })),
      };
    } else throw new TypeError("Unknown Campaign Definition command.");
    return {
      data,
      events: [{ name: "changed", context: { operation: name } }],
    };
  }
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function rewriteCampaignReferences(
  value: unknown,
  mapping: Readonly<Record<string, Readonly<Record<string, string>>>>,
  targetCampaignId: string,
  resourceType?: string,
): unknown {
  if (typeof value === "string") {
    if (resourceType === "campaign-definition") return targetCampaignId;
    if (resourceType) return mapping[resourceType]?.[value] ?? value;
    return value;
  }
  if (Array.isArray(value))
    return value.map((child) =>
      rewriteCampaignReferences(child, mapping, targetCampaignId, resourceType),
    );
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      rewriteCampaignReferences(
        child,
        mapping,
        targetCampaignId,
        key === "id" ? resourceType : campaignResourceForField(key),
      ),
    ]),
  );
}
function campaignResourceForField(key: string): string | undefined {
  if (key === "campaignDefinitionId") return "campaign-definition";
  if (key === "id") return undefined;
  if (
    key === "plotDefinitionId" ||
    key === "parentPlotDefinitionId" ||
    key === "plotDefinitionIds"
  )
    return "plots";
  if (key === "placementDefinitionId" || key === "placementDefinitionIds")
    return "campaign-placements";
  return undefined;
}

export function rewriteCampaignWorldReferences(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
  resourceType?: string,
): unknown {
  if (typeof value === "string") {
    if (resourceType)
      return (
        mapping.get(`${resourceType}\0${value}`) ??
        (resourceType === "creatures"
          ? mapping.get(`definitions\0${value}`)
          : undefined) ??
        value
      );
    return value;
  }
  if (Array.isArray(value))
    return value.map((child) =>
      rewriteCampaignWorldReferences(child, mapping, resourceType),
    );
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      rewriteCampaignWorldReferences(child, mapping, resourceForField(key)),
    ]),
  );
}
function resourceForField(key: string): string | undefined {
  if (key === "locationId" || key === "parentLocationId") return "locations";
  if (key === "creatureId") return "creatures";
  if (
    key === "itemDefinitionId" ||
    key === "definitionId" ||
    key === "suggestedCreatureDefinitionId"
  )
    return "definitions";
  if (key === "capturedWorldPlacementId") return "world-placements";
  return undefined;
}
