import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ModelRegistryService } from "../model-registry/model-registry.service";
import {
  assertGovernedRecordConformance,
  WorldDefinitionAuthoringService,
} from "../world-definitions/world-definition-authoring.service";
import { validateWorldDefinitionDraft } from "../world-definitions/world-definition-draft-validator";
import {
  canonicalWorldRecordIssue,
  worldCreaturePayload,
  worldItemPayload,
  worldLocationPayload,
} from "../world-definitions/world-authored-record";
import type { CreateWorldDraftProposalDto } from "./dto/create-world-draft-proposal.dto";
import { AiPromptService } from "./ai-prompt.service";
import { OpenAiService } from "./openai.service";

export type WorldDraftProposalKind = "location" | "creature" | "item";

export interface PreparedWorldDraftProposal {
  readonly kind: WorldDraftProposalKind;
  readonly dto: CreateWorldDraftProposalDto;
  readonly rawContent: unknown;
  readonly records: DraftRecord[];
  readonly vocabulary: Vocabulary;
  readonly combinedPrompt: string;
  readonly compiled?: Awaited<
    ReturnType<ModelRegistryService["resolveEffectiveRoots"]>
  >;
}

const MAX_PROVIDER_OUTPUT_CHARS = 32_000;
const MAX_CONTEXT_RECORDS = 100;
const MAX_CONTEXT_CHARS = 12_000;
const MAX_PROMPT_CHARS = 24_000;
const PROVIDER_DEADLINE_MS = 60_000;

@Injectable()
export class WorldDraftProposalService {
  constructor(
    private readonly authoring: WorldDefinitionAuthoringService,
    private readonly models: ModelRegistryService,
    private readonly prompts: AiPromptService,
    private readonly openAi: OpenAiService,
  ) {}

  async propose(
    kind: WorldDraftProposalKind,
    worldId: string,
    userId: string,
    dto: CreateWorldDraftProposalDto,
  ) {
    return this.proposePrepared(await this.prepare(kind, worldId, userId, dto));
  }

  async prepare(
    kind: WorldDraftProposalKind,
    worldId: string,
    userId: string,
    dto: CreateWorldDraftProposalDto,
  ): Promise<PreparedWorldDraftProposal> {
    const draft = await this.authoring.getActiveDraft(worldId, userId);
    if (draft.storageRevision !== dto.expectedStorageRevision) {
      throw new ConflictException(
        "This World draft changed; refresh before requesting a proposal.",
      );
    }
    const records = draftRecords(draft.records);
    const rootLocationId = stringField(draft.content, "rootLocationId");
    if (kind === "location" && rootLocationId && !dto.parentLocationId) {
      throw new BadRequestException("A parent Location is required.");
    }
    const parent = dto.parentLocationId
      ? records.find(
          (record) =>
            record.resourceType === "locations" &&
            record.sourceId === dto.parentLocationId,
        )
      : undefined;
    if (dto.parentLocationId && !parent) {
      throw new BadRequestException(
        "The parent Location is not in this World draft.",
      );
    }

    const rawContent = draft.content;
    const releaseIds = stringArray(
      isObject(rawContent) ? rawContent.modelSchemaReleaseIds : undefined,
    );
    const compiled = await this.models.resolveEffectiveRoots(
      releaseIds,
      userId,
      worldId,
    );
    const vocabulary = effectiveVocabulary(compiled.elements);
    assertProposalModelsAvailable(kind, compiled.elements, vocabulary);
    const proposalGuidance = await this.prompts.read(
      "world-draft-proposal.md",
      "WORLD_DRAFT_PROPOSAL_PROMPT_PATH",
    );
    const combinedPrompt = buildPrompt(
      kind,
      dto.direction,
      draft.revisionName,
      records,
      parent,
      vocabulary,
      proposalGuidance,
    );
    if (combinedPrompt.length > MAX_PROMPT_CHARS) {
      throw new BadRequestException(
        "The World context is too large to prepare an AI proposal safely.",
      );
    }
    return {
      kind,
      dto,
      rawContent,
      records,
      vocabulary,
      combinedPrompt,
      ...(kind === "location" ? {} : { compiled }),
    };
  }

  async proposePrepared(prepared: PreparedWorldDraftProposal) {
    const {
      kind,
      dto,
      rawContent,
      records,
      vocabulary,
      combinedPrompt,
      compiled,
    } = prepared;
    const generated = await this.openAi.respond({
      input: combinedPrompt,
      maxOutputTokens: 4_000,
      deadlineMs: PROVIDER_DEADLINE_MS,
    });
    const parsed = parseObject(generated.output);
    const proposal = normalizeProposal(kind, parsed, dto, vocabulary);
    this.validateCandidate(kind, rawContent, records, proposal, compiled);
    return {
      proposal,
      provider: { model: generated.model, responseId: generated.responseId },
    };
  }

  private validateCandidate(
    kind: WorldDraftProposalKind,
    rawContent: unknown,
    records: DraftRecord[],
    proposal: Record<string, unknown>,
    preparedCompiled:
      | Awaited<ReturnType<ModelRegistryService["resolveEffectiveRoots"]>>
      | undefined,
  ): void {
    const id = randomUUID();
    const content = isObject(rawContent) ? { ...rawContent } : {};
    const releaseIds = stringArray(content.modelSchemaReleaseIds);
    let payload: unknown;
    let resourceType: "locations" | "definitions";
    let compiled:
      | Awaited<ReturnType<ModelRegistryService["resolveEffectiveRoots"]>>
      | undefined;
    if (kind === "location") {
      resourceType = "locations";
      payload = worldLocationPayload(id, proposal as never);
      content.locationIds = [
        ...new Set([...stringArray(content.locationIds), id]),
      ];
    } else {
      resourceType = "definitions";
      compiled = preparedCompiled;
      if (!compiled) {
        throw new BadRequestException(
          "The effective Models are unavailable for this proposal.",
        );
      }
      const concept = compiled.elements.find(
        (element) =>
          element.lineage.kind === "concept" &&
          element.lineage.semanticRole === `aow:${kind}`,
      );
      if (!concept) {
        throw new BadRequestException(
          `The effective ${kind === "creature" ? "Creature" : "Item"} concept is unavailable.`,
        );
      }
      const conformance = {
        modelSchemaReleaseIds: releaseIds as never,
        conceptId: concept.lineage.id as never,
      };
      payload =
        kind === "creature"
          ? worldCreaturePayload(id, proposal as never, conformance)
          : worldItemPayload(
              id,
              {
                ...proposal,
                image: {
                  assetId: randomUUID(),
                  altText: "Catalog image supplied by the GM before apply",
                  width: 1,
                  height: 1,
                  mimeType: "image/png",
                },
              } as unknown as Parameters<typeof worldItemPayload>[1],
              conformance,
            );
      content.definitionIds = [
        ...new Set([...stringArray(content.definitionIds), id]),
      ];
    }
    const issue = canonicalWorldRecordIssue(resourceType, id, payload);
    if (issue) throw new BadGatewayException("The AI proposal is not valid.");
    const candidate = { resourceType, sourceId: id, payload };
    if (compiled) {
      try {
        assertGovernedRecordConformance(
          [candidate],
          releaseIds,
          compiled.elements,
        );
      } catch {
        throw new BadGatewayException(
          "The AI proposal does not conform to this World's effective Models.",
        );
      }
    }
    const baseline = validateWorldDefinitionDraft(
      contentWithout(content, kind, id),
      records,
    );
    const candidateReport = validateWorldDefinitionDraft(content, [
      ...records,
      candidate,
    ]);
    const baselineIssues = new Set(
      baseline.issues.map(
        (entry) => `${entry.code}\0${entry.subject}\0${entry.detail}`,
      ),
    );
    if (
      candidateReport.issues.some(
        (entry) =>
          !baselineIssues.has(
            `${entry.code}\0${entry.subject}\0${entry.detail}`,
          ),
      )
    ) {
      throw new BadGatewayException(
        "The AI proposal is incompatible with the current World draft.",
      );
    }
  }
}

interface DraftRecord {
  readonly resourceType: string;
  readonly sourceId: string;
  readonly sourceRevision?: number;
  readonly payload: unknown;
}

interface Vocabulary {
  readonly attributes: readonly string[];
  readonly equipmentSlots: readonly string[];
  readonly itemFamilies: readonly string[];
}

function effectiveVocabulary(
  elements: Awaited<
    ReturnType<ModelRegistryService["resolveEffectiveRoots"]>
  >["elements"],
): Vocabulary {
  const options = elements.filter(
    (entry) => entry.lineage.kind === "vocabulary-option",
  );
  return {
    attributes: options
      .filter((entry) => entry.lineage.semanticRole === "aow:attribute")
      .map((entry) => entry.lineage.key),
    equipmentSlots: options
      .filter((entry) => entry.lineage.semanticRole === "aow:equipment-slot")
      .map((entry) => entry.lineage.key),
    itemFamilies: options
      .filter((entry) => entry.lineage.semanticRole === "aow:item-family")
      .map((entry) => entry.lineage.key),
  };
}

function assertProposalModelsAvailable(
  kind: WorldDraftProposalKind,
  elements: Awaited<
    ReturnType<ModelRegistryService["resolveEffectiveRoots"]>
  >["elements"],
  vocabulary: Vocabulary,
): void {
  if (kind === "location") return;
  const semanticRole = `aow:${kind}`;
  const hasConcept = elements.some(
    (entry) =>
      entry.lineage.kind === "concept" &&
      entry.lineage.semanticRole === semanticRole,
  );
  if (!hasConcept) {
    throw new BadRequestException(
      `The effective ${kind === "creature" ? "Creature" : "Item"} concept is unavailable.`,
    );
  }
  if (kind === "item" && vocabulary.itemFamilies.length === 0) {
    throw new BadRequestException(
      "The effective Item family vocabulary is unavailable.",
    );
  }
}

function normalizeProposal(
  kind: WorldDraftProposalKind,
  value: Record<string, unknown>,
  dto: CreateWorldDraftProposalDto,
  vocabulary: Vocabulary,
): Record<string, unknown> {
  const description = optionalText(value.description, 2_000, "description");
  const common = {
    expectedStorageRevision: dto.expectedStorageRevision,
    name: requiredText(value.name, 120, "name"),
    ...(description ? { description } : {}),
  };
  if (kind === "location") {
    const profileSummary = optionalText(
      value.profileSummary,
      2_000,
      "profile summary",
    );
    const mapSceneNotes = optionalText(
      value.mapSceneNotes,
      4_000,
      "map scene notes",
    );
    const mapOrientation = optionalEnum(
      value.mapOrientation,
      ["scenic", "overhead", "side-on", "isometric"] as const,
      "map orientation",
    );
    return {
      ...common,
      kind: requiredText(value.kind, 120, "Location kind"),
      ...(profileSummary ? { profileSummary } : {}),
      profileTags: boundedStringList(
        value.profileTags,
        100,
        120,
        "profile tag",
      ),
      ...(mapSceneNotes ? { mapSceneNotes } : {}),
      ...(mapOrientation ? { mapOrientation } : {}),
      ...(dto.parentLocationId
        ? { parentLocationId: dto.parentLocationId }
        : {}),
    };
  }
  if (kind === "creature") {
    const attributes = numericSelection(
      value.attributes,
      vocabulary.attributes,
    );
    const equipmentSlots = stringSelection(
      value.equipmentSlots,
      vocabulary.equipmentSlots,
      "Equipment Slot",
    );
    const policy = isObject(value.instanceEmbodimentPolicy)
      ? value.instanceEmbodimentPolicy
      : { strategy: "one-per-instance", maximumPerCampaignInstance: 1 };
    const artDirection = optionalText(
      value.artDirection,
      2_000,
      "art direction",
    );
    const progressiveMechanicsNotes = optionalText(
      value.progressiveMechanicsNotes,
      4_000,
      "progressive mechanics notes",
    );
    assertNoReferenceSelection(value.skillDefinitionIds, "Skill");
    assertNoReferenceSelection(value.professionDefinitionIds, "Profession");
    return {
      ...common,
      attributes,
      equipmentSlots,
      instanceEmbodimentPolicy: policy,
      ...(artDirection ? { artDirection } : {}),
      movement: movementSelection(value.movement),
      ...(progressiveMechanicsNotes ? { progressiveMechanicsNotes } : {}),
    };
  }
  const family = requiredText(value.itemFamilyKey, 240, "Item family");
  if (!vocabulary.itemFamilies.includes(family)) {
    throw new BadGatewayException(
      "The AI proposal selected an unavailable Item family.",
    );
  }
  const quality = requiredText(value.quality, 20, "quality");
  if (!["ramshackle", "standard", "fine", "exquisite"].includes(quality)) {
    throw new BadGatewayException(
      "The AI proposal selected an invalid quality.",
    );
  }
  return {
    ...common,
    itemFamilyKey: family,
    category: requiredText(value.category, 120, "category"),
    quality,
    compatibleEquipmentSlotSets: nestedStringSelection(
      value.compatibleEquipmentSlotSets,
      vocabulary.equipmentSlots,
      "Equipment Slot",
    ),
  };
}

function buildPrompt(
  kind: WorldDraftProposalKind,
  direction: string,
  worldName: string,
  records: readonly DraftRecord[],
  parent: DraftRecord | undefined,
  vocabulary: Vocabulary,
  proposalGuidance: string,
): string {
  const shape =
    kind === "location"
      ? '{"name":string,"description"?:string,"kind":string,"profileSummary"?:string,"profileTags":string[],"mapSceneNotes"?:string,"mapOrientation"?:"scenic"|"overhead"|"side-on"|"isometric"}'
      : kind === "creature"
        ? '{"name":string,"description"?:string,"attributes":Record<allowedAttributeKey,number>,"equipmentSlots":allowedEquipmentSlotKey[],"instanceEmbodimentPolicy":{"strategy":"one-per-instance","maximumPerCampaignInstance":1}|{"strategy":"one-per-realization","maximumPerCampaignInstance"?:positive integer},"artDirection"?:string,"movement":Array<{"mode":string,"distance":{"value":positive number,"unit":"foot"|"mile"|"square"|"hex"|"meter"|"kilometer"},"hover"?:boolean}>,"progressiveMechanicsNotes"?:string}'
        : '{"name":string,"description"?:string,"itemFamilyKey":allowedItemFamilyKey,"category":string,"quality":"ramshackle"|"standard"|"fine"|"exquisite","compatibleEquipmentSlotSets":allowedEquipmentSlotKey[][]}';
  const context = boundedRecordContext(records);
  return [
    "Propose one editable World Definition draft record. Return strict JSON only.",
    "Do not emit IDs, identity, conformance, image/media data, extensions, Markdown, or commentary.",
    `Record kind: ${kind}`,
    `Required output shape: ${shape}`,
    `World working revision name: ${worldName.slice(0, 120)}`,
    `Parent Location: ${parent ? JSON.stringify(recordSummary(parent)) : "World root"}`,
    `Allowed Attribute keys: ${JSON.stringify(vocabulary.attributes)}`,
    `Allowed Equipment Slot keys: ${JSON.stringify(vocabulary.equipmentSlots)}`,
    `Allowed Item family keys: ${JSON.stringify(vocabulary.itemFamilies)}`,
    `Existing World context: ${JSON.stringify(context)}`,
    `GM direction: ${direction.trim()}`,
    "Canonical World proposal guidance:",
    proposalGuidance,
  ].join("\n\n");
}

function boundedRecordContext(records: readonly DraftRecord[]) {
  const summaries: ReturnType<typeof recordSummary>[] = [];
  let used = 2;
  for (const record of records.slice(0, MAX_CONTEXT_RECORDS)) {
    const summary = recordSummary(record);
    const serialized = JSON.stringify(summary);
    if (used + serialized.length + 1 > MAX_CONTEXT_CHARS) break;
    summaries.push(summary);
    used += serialized.length + 1;
  }
  return summaries;
}

function recordSummary(record: DraftRecord): {
  type: string;
  name: string;
  description?: string;
} {
  const payload = isObject(record.payload) ? record.payload : {};
  const identity = isObject(payload.identity) ? payload.identity : {};
  const description = summaryText(
    identity.description ?? payload.description,
    500,
  );
  return {
    type:
      payload.kind === "creature" || payload.kind === "item"
        ? payload.kind
        : record.resourceType,
    name: summaryText(identity.name ?? payload.name, 120) ?? "Unnamed record",
    ...(description ? { description } : {}),
  };
}

function summaryText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().slice(0, maximum);
}

function parseObject(output: string): Record<string, unknown> {
  if (output.length > MAX_PROVIDER_OUTPUT_CHARS) {
    throw new BadGatewayException("The AI response was too large.");
  }
  const text = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) return parsed;
  } catch {
    // Stable error below deliberately excludes provider output.
  }
  throw new BadGatewayException("The AI response was not valid proposal JSON.");
}

function requiredText(value: unknown, maximum: number, label: string): string {
  const text = optionalText(value, maximum, label);
  if (!text) throw new BadGatewayException(`The AI proposal omitted ${label}.`);
  return text;
}

function optionalText(
  value: unknown,
  maximum: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  ) {
    throw new BadGatewayException(
      `The AI proposal contains an invalid ${label}.`,
    );
  }
  return value.trim();
}

function numericSelection(value: unknown, allowed: readonly string[]) {
  if (!isObject(value)) {
    throw new BadGatewayException(
      "The AI proposal omitted Creature attributes.",
    );
  }
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      !allowed.includes(key) ||
      typeof entry !== "number" ||
      !Number.isFinite(entry)
    ) {
      throw new BadGatewayException(
        "The AI proposal contains an unavailable or invalid Attribute.",
      );
    }
    result[key] = entry;
  }
  return result;
}

function stringSelection(
  value: unknown,
  allowed: readonly string[],
  label: string,
): string[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new BadGatewayException(
      `The AI proposal contains invalid ${label} selections.`,
    );
  }
  const result = value.filter(
    (entry): entry is string => typeof entry === "string",
  );
  if (
    result.length !== value.length ||
    result.some((entry) => !allowed.includes(entry))
  ) {
    throw new BadGatewayException(
      `The AI proposal selected an unavailable ${label}.`,
    );
  }
  return [...new Set(result)];
}

function nestedStringSelection(
  value: unknown,
  allowed: readonly string[],
  label: string,
): string[][] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new BadGatewayException(
      `The AI proposal contains invalid ${label} selections.`,
    );
  }
  const result: string[][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length === 0 || entry.length > 20) {
      throw new BadGatewayException(
        `The AI proposal contains invalid ${label} selections.`,
      );
    }
    const slots = entry.filter(
      (slot): slot is string => typeof slot === "string",
    );
    if (
      slots.length !== entry.length ||
      slots.some((slot) => !allowed.includes(slot))
    ) {
      throw new BadGatewayException(
        `The AI proposal selected an unavailable ${label}.`,
      );
    }
    const unique = [...new Set(slots)];
    if (unique.length !== slots.length) {
      throw new BadGatewayException(
        `The AI proposal contains duplicate ${label} selections.`,
      );
    }
    result.push(unique);
  }
  return result;
}

function boundedStringList(
  value: unknown,
  maximumEntries: number,
  maximumLength: number,
  label: string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumEntries) {
    throw new BadGatewayException(
      `The AI proposal contains invalid ${label}s.`,
    );
  }
  const normalized = value.map((entry) => {
    if (
      typeof entry !== "string" ||
      !entry.trim() ||
      entry.trim().length > maximumLength
    ) {
      throw new BadGatewayException(
        `The AI proposal contains an invalid ${label}.`,
      );
    }
    return entry.trim();
  });
  return [...new Set(normalized)];
}

function optionalEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  label: string,
): Value | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new BadGatewayException(
      `The AI proposal contains an invalid ${label}.`,
    );
  }
  return value as Value;
}

function assertNoReferenceSelection(value: unknown, label: string): void {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return;
  }
  throw new BadGatewayException(
    `The AI proposal cannot select ${label} references. Choose them in the editor.`,
  );
}

function movementSelection(value: unknown): Array<{
  mode: string;
  distance: { value: number; unit: string };
  hover?: boolean;
}> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new BadGatewayException(
      "The AI proposal contains invalid movement options.",
    );
  }
  return value.map((entry) => {
    const movement = isObject(entry) ? entry : {};
    const distance = isObject(movement.distance) ? movement.distance : {};
    const mode = requiredText(movement.mode, 120, "movement mode");
    const amount = distance.value;
    const unit = optionalEnum(
      distance.unit,
      ["foot", "mile", "square", "hex", "meter", "kilometer"] as const,
      "movement unit",
    );
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1_000_000 ||
      !unit ||
      (movement.hover !== undefined && typeof movement.hover !== "boolean")
    ) {
      throw new BadGatewayException(
        "The AI proposal contains an invalid movement option.",
      );
    }
    return {
      mode,
      distance: { value: amount, unit },
      ...(movement.hover === undefined ? {} : { hover: movement.hover }),
    };
  });
}

function draftRecords(value: unknown): DraftRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is DraftRecord =>
      isObject(entry) &&
      typeof entry.resourceType === "string" &&
      typeof entry.sourceId === "string" &&
      "payload" in entry,
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringField(value: unknown, key: string): string | undefined {
  return isObject(value) && typeof value[key] === "string"
    ? value[key]
    : undefined;
}

function contentWithout(
  content: Record<string, unknown>,
  kind: WorldDraftProposalKind,
  id: string,
): Record<string, unknown> {
  const key = kind === "location" ? "locationIds" : "definitionIds";
  return {
    ...content,
    [key]: stringArray(content[key]).filter((entry) => entry !== id),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
