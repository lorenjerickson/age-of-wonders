import {
  Creature,
  type CreatureRuntimeContext,
  type CreatureRuntimeState,
} from "./creature";
import { copyEntityData, type EntityOptions } from "./entity";

/** A played Character shares actor operations and has one identity in its owning Instance. */
export class Character extends Creature {
  protected constructor(
    data: CreatureRuntimeState,
    context: CreatureRuntimeContext = {},
    options?: EntityOptions,
  ) {
    super(data, context, options, "character");
  }
  static override deserializePayload(
    value: unknown,
    context: CreatureRuntimeContext = {},
    options?: EntityOptions,
  ): Character {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Character state must be an object.");
    return new Character(
      copyEntityData(value as CreatureRuntimeState),
      context,
      options,
    );
  }
  static override deserialize(
    value: unknown,
    context: CreatureRuntimeContext = {},
    options?: EntityOptions,
  ): Character {
    const envelope = value as Record<string, unknown>;
    if (
      !envelope ||
      envelope.type !== "character" ||
      envelope.schemaVersion !== 1
    )
      throw new TypeError("Unsupported Character envelope.");
    return this.deserializePayload(envelope.data, context, options);
  }
  static validateSheetBinding(
    sheet: Record<string, unknown>,
    characterId: string,
    campaignInstanceId: string,
  ): void {
    const identity = sheet.identity as Record<string, unknown> | undefined;
    if (
      identity?.id !== characterId ||
      sheet.campaignInstanceId !== campaignInstanceId
    )
      throw new TypeError(
        "The Character sheet belongs to a different Character or Campaign Instance.",
      );
  }
  /** Instance activation port; preserves the approved sheet without manufacturing runtime statistics. */
  static fromApprovedSheet(
    sheet: Record<string, unknown>,
    input: { entityId: string; campaignInstanceId: string; updatedAt: string },
  ): CreatureRuntimeState {
    const identity = sheet.identity as Record<string, unknown> | undefined;
    if (typeof identity?.id !== "string")
      throw new TypeError("The approved Character requires an identity.");
    this.validateSheetBinding(sheet, identity.id, input.campaignInstanceId);
    return {
      identity: {
        id: identity.id,
        version: { revision: 1, updatedAt: input.updatedAt },
      },
      entityId: input.entityId,
      name: typeof sheet.name === "string" ? sheet.name : "Character",
      ...(sheet.modifierGrants === undefined
        ? {}
        : { modifierGrants: copyEntityData(sheet.modifierGrants) }),
      extensions: { "aow:approvedCharacterSheet": copyEntityData(sheet) },
    };
  }
  static assertUnique(
    characterId: string,
    characters: readonly { characterId: string }[],
  ): void {
    if (characters.some((character) => character.characterId === characterId))
      throw new TypeError(
        "This Character already belongs to the Campaign Instance.",
      );
  }
}
