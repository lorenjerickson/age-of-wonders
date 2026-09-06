export interface CharacterSelections {
  backgroundId?: string;
  professionId?: string;
  heritageIds?: string[];
}

export interface CharacterDraft {
  id: string;
  name?: string;
  status: "draft" | "complete" | string;
  revision: number;
  currentStep?: string;
  selections?: CharacterSelections;
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
  maximumHeritages?: number;
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
