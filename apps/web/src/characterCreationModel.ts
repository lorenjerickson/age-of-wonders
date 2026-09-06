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
  reviewNote?: string;
  validationIssues: Array<{ code: string; field: string; message: string }>;
  updatedAt?: string;
}

export interface CharacterOption {
  id: string;
  name: string;
  description?: string;
}

export interface CharacterOptions {
  backgrounds: readonly CharacterOption[];
  professions: readonly CharacterOption[];
  heritages: readonly CharacterOption[];
  attributes: readonly CharacterAttributeOption[];
  startingEquipment: readonly CharacterOption[];
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
  return { ...draft, selections: { ...selections } };
}

export function selectionsComplete(selections: CharacterSelections): boolean {
  return Boolean(
    selections.backgroundId &&
    selections.professionId &&
    selections.heritageIds?.length,
  );
}

export function characterDisplayName(draft: CharacterDraft): string {
  return draft.name?.trim() || "New character";
}
