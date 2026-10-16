import { authoredEquipmentIssue } from "./authored-equipment";
import {
  WORLD_CODEX_RESOURCES,
  isCreatureInstanceEmbodimentPolicy,
} from "@aow/common";
import {
  type DeepReadonly,
  type EntityOptions,
  type ValidationIssue,
} from "./entity";
import {
  CodexDefinition,
  type CodexDefinitionState,
  type CodexDefinitionValidationContext,
  type CodexDefinitionCommands,
  type CodexDefinitionEvents,
} from "./codex-definition";

export type CharacterTemplateState = CodexDefinitionState;
export interface CharacterTemplateValidationContext extends CodexDefinitionValidationContext {
  /** Trusted previous resource from the mutation workflow, never client-selected. */
  readonly baseline?: unknown;
}
export type CharacterTemplateCommands = CodexDefinitionCommands;
export type CharacterTemplateEvents = CodexDefinitionEvents;

/** Authored World Character state; independent of playable Character lifecycle. */
export class CharacterTemplate extends CodexDefinition<CharacterTemplateValidationContext> {
  private constructor(
    data: CharacterTemplateState,
    context: CharacterTemplateValidationContext,
    options?: EntityOptions,
  ) {
    super("character-template", data, context, options);
    this.validate(context);
  }

  static deserialize(
    value: unknown,
    context: CharacterTemplateValidationContext = {},
    options?: EntityOptions,
  ): CharacterTemplate {
    return new CharacterTemplate(
      this.decode(value, "character-template"),
      context,
      options,
    );
  }

  /** Hydrate resource JSON without interpreting user fields as an entity envelope. */
  static deserializePayload(
    value: unknown,
    context: CharacterTemplateValidationContext = {},
    options?: EntityOptions,
  ): CharacterTemplate {
    return new CharacterTemplate(this.decodePayload(value), context, options);
  }

  static override authorPayload(
    id: string,
    input: Record<string, unknown>,
    previous?: unknown,
  ): Record<string, unknown> & { id: string; revision: number } {
    const issue = this.immutableCreatureIssue(input, previous);
    if (issue) throw new TypeError(issue.message);
    return super.authorPayload(id, input, previous);
  }

  /** Retain trusted artwork metadata when an edit reuses the same asset. */
  static preservedArtwork(
    image: Record<string, unknown>,
    previous: unknown,
  ): Record<string, unknown> | undefined {
    if (!this.isObject(previous) || previous.assetId !== image.assetId)
      return undefined;
    const result: Record<string, unknown> = {
      ...previous,
      altText: image.altText,
    };
    delete result.uri;
    return result;
  }

  /** Application supplies the MIME type after authorizing the selected media asset. */
  static verifiedArtwork(
    image: Record<string, unknown>,
    mimeType: string,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...image, mimeType };
    delete result.uri;
    return result;
  }

  protected validateState(
    data: DeepReadonly<CharacterTemplateState>,
    context: CharacterTemplateValidationContext,
  ): readonly ValidationIssue[] {
    const identity = this.identityIssues(data, context, "character");
    if (identity.length) return identity;
    const issue = (code: string, message: string): ValidationIssue[] => [
      { code: `character-codex-${code}`, message },
    ];
    if (
      data.instanceEmbodimentPolicy !== undefined &&
      !isCreatureInstanceEmbodimentPolicy(data.instanceEmbodimentPolicy)
    )
      return issue(
        "embodiment-policy",
        "Choose a valid Character embodiment policy.",
      );
    if (context.records) {
      const creature = this.reference(
        context,
        "definitions",
        data.creatureDefinitionId,
      );
      if (!CharacterTemplate.isObject(creature) || creature.kind !== "creature")
        return issue("creature", "Choose a Creature template in this World.");
    }
    if (
      !CharacterTemplate.numbers(data.attributes) ||
      !CharacterTemplate.numbers(data.skills)
    )
      return issue("values", "Attributes and Skills must have numeric values.");
    const h = data.health,
      v = data.vision;
    if (
      !CharacterTemplate.isObject(h) ||
      !CharacterTemplate.nonnegative(h.current) ||
      !CharacterTemplate.nonnegative(h.maximum) ||
      !CharacterTemplate.nonnegative(h.temporary) ||
      h.current > h.maximum
    )
      return issue(
        "health",
        "Health must be nonnegative and current health cannot exceed maximum.",
      );
    if (
      !CharacterTemplate.isObject(v) ||
      !CharacterTemplate.nonnegative(v.day) ||
      !CharacterTemplate.nonnegative(v.night)
    )
      return issue("vision", "Vision distances must be nonnegative.");
    if (
      !CharacterTemplate.isObject(data.movement) ||
      !Object.entries(data.movement).every(
        ([k, n]) =>
          [
            "walk",
            "run",
            "sprint",
            "jump",
            "swim",
            "climb",
            "crawl",
            "fly",
            "burrow",
          ].includes(k) && CharacterTemplate.nonnegative(n),
      )
    )
      return issue(
        "movement",
        "Choose valid movement modes and nonnegative speeds.",
      );
    const creature = CharacterTemplate.isObject(
      context.records?.find(
        (record) =>
          record.resourceType === "definitions" &&
          record.sourceId === data.creatureDefinitionId,
      )?.payload,
    )
      ? (context.records!.find(
          (record) =>
            record.resourceType === "definitions" &&
            record.sourceId === data.creatureDefinitionId,
        )!.payload as Record<string, unknown>)
      : {};
    const components = CharacterTemplate.isObject(creature.components)
      ? creature.components
      : {};
    const baseline = CharacterTemplate.isObject(context.baseline)
      ? context.baseline
      : {};
    const equipmentIssue = authoredEquipmentIssue(data.equipment, {
      records: context.records,
      slots: components.equipmentSlots,
      preserveCompatibility:
        baseline.equipment !== undefined &&
        JSON.stringify(baseline.equipment) === JSON.stringify(data.equipment),
    });
    if (equipmentIssue) return issue("equipment", equipmentIssue);
    if (data.grantedConditions !== undefined) {
      if (!CharacterTemplate.array(data.grantedConditions))
        return issue("conditions", "Choose a valid granted Condition list.");
      const conditionIds = new Set<string>();
      for (const link of data.grantedConditions) {
        if (
          !CharacterTemplate.isObject(link) ||
          !CharacterTemplate.text(link.conditionId) ||
          conditionIds.has(link.conditionId) ||
          (context.records &&
            !this.reference(
              context,
              WORLD_CODEX_RESOURCES.conditions,
              link.conditionId,
            ))
        )
          return issue(
            "condition-unavailable",
            "A granted Condition is duplicated or unavailable in this World.",
          );
        conditionIds.add(link.conditionId);
      }
    }
    if (
      data.images !== undefined &&
      (!CharacterTemplate.isObject(data.images) ||
        Object.entries(data.images).some(
          ([key, img]) =>
            !["portrait", "overheadToken", "paperDollToken"].includes(key) ||
            !CharacterTemplate.isObject(img) ||
            !CharacterTemplate.text(img.assetId) ||
            typeof img.altText !== "string" ||
            !CharacterTemplate.nonnegative(img.width) ||
            !CharacterTemplate.nonnegative(img.height) ||
            typeof img.mimeType !== "string" ||
            !img.mimeType.startsWith("image/"),
        ))
    )
      return issue("artwork", "Choose valid Character artwork.");
    const immutable = CharacterTemplate.immutableCreatureIssue(
      data,
      context.baseline,
    );
    if (immutable) return [immutable];
    if (!context.records)
      return [
        {
          code: "character-references-unresolved",
          message:
            "Character references have not been checked against a World capture.",
          unresolved: true,
        },
      ];
    return [];
  }

  private reference(
    context: CharacterTemplateValidationContext,
    resourceType: string,
    sourceId: unknown,
  ): unknown {
    // A relationship requires only the referenced kind/existence. Publication
    // validates each referenced concept independently, including legacy drafts.
    return context.records?.find(
      (record) =>
        record.resourceType === resourceType && record.sourceId === sourceId,
    )?.payload;
  }

  private static immutableCreatureIssue(
    data: DeepReadonly<CharacterTemplateState>,
    previous: unknown,
  ): ValidationIssue | undefined {
    if (
      this.isObject(previous) &&
      previous.creatureDefinitionId !== data.creatureDefinitionId
    )
      return {
        code: "character-codex-creature-immutable",
        message:
          "A Character's Creature template cannot be changed after creation.",
      };
  }

  private static nonnegative(value: unknown): value is number {
    return this.finite(value) && value >= 0;
  }
}
