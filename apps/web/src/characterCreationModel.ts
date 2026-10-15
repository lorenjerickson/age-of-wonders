import { CharacterCreation } from "@aow/domain";
export interface CharacterSelections {
  backgroundId?: string;
  professionId?: string;
  heritageIds?: string[];
}

export interface CharacterDraft {
  id: string;
  name?: string;
  status: "in-progress" | "ready-for-review" | "complete" | string;
  revision: number;
  currentStep?: string;
  selections?: CharacterSelections;
  attributeRolls: number[];
  attributeAssignments: Record<string, number>;
  startingEquipmentIds: string[];
  biography?: string;
  imageAssetIds?: Record<string, string>;
  equipmentAssignments?: Record<string, string[]>;
  reviewNote?: string;
  validationIssues: Array<{ code: string; field: string; message: string }>;
  updatedAt?: string;
}

export interface CharacterOption {
  id: string;
  name: string;
  description?: string;
  compatibleSlotSets?: readonly (readonly string[])[];
  imageAssetId?: string;
  modifierGrants?: readonly import("@aow/common").ModifierGrantDefinition[];
}

export interface CharacterOptions {
  worldDefinitionId?: string;
  backgrounds: readonly CharacterOption[];
  professions: readonly CharacterOption[];
  heritages: readonly CharacterOption[];
  attributes: readonly CharacterAttributeOption[];
  startingEquipment: readonly CharacterOption[];
  equipmentSlots?: readonly { id: string; name: string }[];
  maximumHeritages?: number;
  attributeRollCount: number;
}

export interface CharacterAttributeOption {
  id: string;
  name: string;
  minimum: number;
  maximum: number;
}

export function applyCharacterSelections(
  draft: CharacterDraft,
  selections: CharacterSelections,
): CharacterDraft {
  return CharacterCreation.applySelections(draft, selections);
}

export function selectionsComplete(selections: CharacterSelections): boolean {
  return CharacterCreation.selectionsComplete(selections);
}

export function characterDisplayName(draft: CharacterDraft): string {
  return draft.name?.trim() || "New character";
}
