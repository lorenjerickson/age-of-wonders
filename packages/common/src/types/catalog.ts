import type {
  BackgroundDefinition,
  CharacterDefinition,
  ClassDefinition,
  FeatDefinition,
  SubclassDefinition,
} from "./character";
import type { HeritageDefinition } from "./heritage";
import type { MonsterDefinition } from "./creatures";
import type { ScalarExpression } from "./expressions";
import type { ItemDefinition } from "./items";
import type { DisciplineDefinition } from "./disciplines";
import type { SkillDefinition } from "./skills";
import type { ProfessionDefinition } from "./professions";
import type {
  DefinitionId,
  Definition,
  ExtensionData,
  JsonValue,
  NamespacedKey,
  RulesEdition,
  RulesSource,
} from "./primitives";
import type {
  ActionDefinition,
  ConditionDefinition,
  TraitDefinition,
} from "./rules";
import type { HazardDefinition } from "./world";

export interface TableComponents<
  Value extends JsonValue | DefinitionId = JsonValue | DefinitionId,
> {
  readonly roll?: import("./dice").DiceExpression;
  readonly entries: readonly {
    readonly minimum: number;
    readonly maximum: number;
    readonly value: Value;
    readonly weight?: number;
  }[];
}

export type TableDefinition<
  Value extends JsonValue | DefinitionId = JsonValue | DefinitionId,
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"table", TableComponents<Value>, Extensions>;

export interface LanguageComponents {
  readonly script?: string;
  readonly rarity?: "standard" | "rare" | "secret" | string;
}

export type LanguageDefinition<
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"language", LanguageComponents, Extensions>;

export interface CustomComponents<
  DefinitionKind extends NamespacedKey = NamespacedKey,
  Payload extends JsonValue = JsonValue,
> {
  readonly definitionKind: DefinitionKind;
  readonly schemaId?: DefinitionId;
  readonly data: Payload;
}

export type CustomDefinition<
  DefinitionKind extends NamespacedKey = NamespacedKey,
  Payload extends JsonValue = JsonValue,
  Extensions extends ExtensionData = ExtensionData,
> = Definition<"custom", CustomComponents<DefinitionKind, Payload>, Extensions>;

export type GameDefinition =
  | ActionDefinition
  | BackgroundDefinition
  | CharacterDefinition
  | ClassDefinition
  | ConditionDefinition
  | CustomDefinition
  | FeatDefinition
  | HazardDefinition
  | HeritageDefinition
  | ItemDefinition
  | LanguageDefinition
  | MonsterDefinition
  | ProfessionDefinition
  | DisciplineDefinition
  | SkillDefinition
  | SubclassDefinition
  | TableDefinition
  | TraitDefinition;

export interface RuleVariant {
  readonly id: DefinitionId;
  readonly key: NamespacedKey;
  readonly name: string;
  readonly description?: string;
  readonly defaultEnabled: boolean;
  readonly conflictsWith?: readonly DefinitionId[];
  readonly requires?: readonly DefinitionId[];
  readonly configurationSchema?: JsonValue;
  readonly rulePatches?: readonly {
    readonly target: DefinitionId | string;
    readonly operation: "add" | "replace" | "remove" | "merge";
    readonly value?: JsonValue | ScalarExpression;
  }[];
}

export interface ContentPackManifest {
  readonly id: string;
  readonly namespace: string;
  readonly name: string;
  readonly version: string;
  readonly edition: RulesEdition;
  readonly source: RulesSource;
  readonly dependencies?: readonly {
    readonly namespace: string;
    readonly versionRange: string;
    readonly optional?: boolean;
  }[];
  readonly definitionIds: readonly DefinitionId[];
  readonly variantIds?: readonly DefinitionId[];
  readonly extensionSchemas?: readonly ExtensionSchema[];
}

export interface ExtensionSchema {
  readonly id: DefinitionId;
  readonly key: NamespacedKey;
  readonly appliesTo: readonly string[];
  readonly jsonSchema: JsonValue;
  readonly semanticVersion: string;
}

export interface RulesCatalog<
  DefinitionType extends GameDefinition = GameDefinition,
> {
  readonly definitions: readonly DefinitionType[];
  readonly variants: readonly RuleVariant[];
  readonly packs: readonly ContentPackManifest[];
}
