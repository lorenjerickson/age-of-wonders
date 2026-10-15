import { copyEntityData } from "./entity";

export type CharacterCreationOption = {
  id: string;
  name: string;
  description?: string;
  compatibleSlotSets?: readonly (readonly string[])[];
};

export type CharacterAttributeOption = {
  id: string;
  name: string;
  minimum: number;
  maximum: number;
};

export type CharacterCreationContext = {
  campaignInstanceSnapshotId: string;
  worldDefinitionId?: string;
  backgrounds: readonly CharacterCreationOption[];
  professions: readonly CharacterCreationOption[];
  heritages: readonly CharacterCreationOption[];
  attributes: readonly CharacterAttributeOption[];
  startingEquipment: readonly CharacterCreationOption[];
  equipmentSlots: readonly { id: string; name: string }[];
  maximumHeritages: number;
  attributeRollCount: number;
};

export type CharacterValidationIssue = {
  code: string;
  field: string;
  message: string;
};

/** Existing Instance creation document; separate from runtime CharacterState. */
export interface CharacterCreationDraftInput {
  sourceSheet?: unknown;
  name?: string | null;
  backgroundDefinitionId?: string | null;
  professionDefinitionId?: string | null;
  heritageDefinitionIds?: unknown;
  attributeRolls?: unknown;
  attributeAssignments?: unknown;
  startingEquipmentIds?: unknown;
  equipmentAssignments?: unknown;
  biography?: string | null;
  imageAssetIds?: unknown;
}
export interface CharacterCreationPatch {
  backgroundDefinitionId?: string;
  professionDefinitionId?: string;
  heritageDefinitionIds?: readonly string[];
  attributeAssignments?: Readonly<Record<string, number>>;
  startingEquipmentIds?: readonly string[];
}

/** Pure captured creation policy. Services own authorization, entropy, CAS and audit. */
export class CharacterCreation {
  readonly context: CharacterCreationContext;
  constructor(context: CharacterCreationContext) {
    this.context = copyEntityData(
      definedContext(context),
    ) as CharacterCreationContext;
  }
  completeIssues(
    draft: CharacterCreationDraftInput,
  ): CharacterValidationIssue[] {
    return validateCompleteDraft(draft, this.context);
  }
  selectionIssue(patch: CharacterCreationPatch): string | undefined {
    const selections = [
      ["background", patch.backgroundDefinitionId, this.context.backgrounds],
      ["profession", patch.professionDefinitionId, this.context.professions],
    ] as const;
    for (const [kind, id, options] of selections) {
      if (id && !options.some((option) => option.id === id)) {
        return `Selected ${kind} is not available in this Campaign Instance snapshot.`;
      }
    }
    for (const id of patch.heritageDefinitionIds ?? []) {
      if (!this.context.heritages.some((option) => option.id === id)) {
        return "Selected heritage is not available in this Campaign Instance snapshot.";
      }
    }
    if (
      patch.heritageDefinitionIds &&
      patch.heritageDefinitionIds.length > this.context.maximumHeritages
    ) {
      return `Choose no more than ${this.context.maximumHeritages} heritage option.`;
    }
    const attributeById = new Map(
      this.context.attributes.map((attribute) => [attribute.id, attribute]),
    );
    for (const [id, score] of Object.entries(
      patch.attributeAssignments ?? {},
    )) {
      const attribute = attributeById.get(id);
      if (
        !attribute ||
        !Number.isInteger(score) ||
        score < attribute.minimum ||
        score > attribute.maximum
      ) {
        return "An Attribute assignment is not valid for this Campaign Instance snapshot.";
      }
    }
    for (const id of patch.startingEquipmentIds ?? []) {
      if (!this.context.startingEquipment.some((option) => option.id === id)) {
        return "Selected starting equipment is not available in this Campaign Instance snapshot.";
      }
    }
  }
  equipmentIssue(
    assignments: unknown,
    selected: readonly string[],
  ): string | undefined {
    return characterEquipmentIssue(
      assignments,
      selected,
      this.context.startingEquipment,
      this.context.equipmentSlots,
    );
  }
  static equipmentIssue = characterEquipmentIssue;
  static availableRolls(
    rolls: readonly number[],
    assignments: Readonly<Record<string, number>>,
    attributeId: string,
  ): readonly number[] {
    const remaining = new Map<number, number>();
    for (const score of rolls)
      remaining.set(score, (remaining.get(score) ?? 0) + 1);
    for (const [id, score] of Object.entries(assignments))
      if (id !== attributeId)
        remaining.set(score, (remaining.get(score) ?? 0) - 1);
    return [...remaining]
      .filter(([, count]) => count > 0)
      .map(([score]) => score);
  }
  static fittingSlotSets(
    item: CharacterCreationOption,
    assignments: Readonly<Record<string, readonly string[]>>,
    slots: readonly { id: string; name: string }[],
  ): readonly (readonly string[])[] {
    return (item.compatibleSlotSets ?? []).filter((set) => {
      const candidate = { ...assignments, [item.id]: set };
      const occupied = Object.entries(candidate)
        .filter(([id]) => id !== item.id)
        .flatMap(([, values]) => values);
      return (
        set.length > 0 &&
        new Set(set).size === set.length &&
        set.every(
          (slot) =>
            slots.some((option) => option.id === slot) &&
            !occupied.includes(slot),
        )
      );
    });
  }

  static editable(status: string): boolean {
    return status.toUpperCase().replaceAll("-", "_") === "IN_PROGRESS";
  }
  static selectionsComplete(selections: {
    backgroundId?: string;
    professionId?: string;
  }): boolean {
    return Boolean(selections.backgroundId && selections.professionId);
  }
  static applySelections<T extends object, S extends object>(
    draft: T,
    selections: S,
  ): T & { selections: S } {
    return { ...draft, selections: { ...selections } };
  }
  static reviewIssue(
    status: string,
    decision: "approve" | "request-changes",
    characterStatus: string,
  ): string | undefined {
    if (characterStatus === "ACTIVE")
      return "An active Character sheet cannot return to review.";
    if (
      status !== "READY_FOR_REVIEW" &&
      !(decision === "request-changes" && status === "COMPLETE")
    )
      return "The Character sheet is not in a reviewable state.";
  }
  static canTransition(
    current: string,
    expected: string,
    target: string,
  ): boolean {
    const transitions: Record<string, readonly string[]> = {
      DRAFT: ["ACTIVE"],
      ACTIVE: ["INACTIVE", "RETIRED", "DEAD"],
      INACTIVE: ["ACTIVE", "RETIRED", "DEAD"],
      RETIRED: [],
      DEAD: [],
    };
    return (
      current === expected && Boolean(transitions[expected]?.includes(target))
    );
  }
  static importDraft(value: unknown, name: string) {
    if (!isObject(value))
      throw new TypeError(
        "The source Character sheet cannot be imported safely.",
      );
    return {
      sourceSheet: copyEntityData(value),
      name,
      ...(typeof value.backgroundDefinitionId === "string"
        ? { backgroundDefinitionId: value.backgroundDefinitionId }
        : {}),
      ...(typeof value.professionDefinitionId === "string"
        ? { professionDefinitionId: value.professionDefinitionId }
        : {}),
      heritageDefinitionIds: stringArray(value.heritageDefinitionIds),
      attributeAssignments: numberRecord(value.attributeAssignments),
      startingEquipmentIds: stringArray(value.startingEquipmentDefinitionIds),
      equipmentAssignments: isObject(value.equipmentAssignments)
        ? copyEntityData(value.equipmentAssignments)
        : {},
      ...(typeof value.biography === "string"
        ? { biography: value.biography }
        : {}),
      imageAssetIds: stringRecord(value.imageAssetIds),
    };
  }
  activationSheet(
    draft: CharacterCreationDraftInput,
    binding: {
      characterId: string;
      campaignInstanceId: string;
      ownerMembershipId: string;
      sourceDraftRevision: number;
      approvedAt: string;
    },
  ) {
    if (this.completeIssues(draft).length)
      throw new TypeError(
        "The approved Character sheet no longer conforms to this Campaign Instance snapshot. Request changes and review it again.",
      );
    const source = isObject(draft.sourceSheet)
      ? copyEntityData(draft.sourceSheet)
      : {};
    // Current reviewed values own these optional fields too; absence removes old values.
    delete source.biography;
    delete source.modifierGrants;
    delete source.sourceSheet;
    return {
      ...source,
      identity: {
        id: binding.characterId,
        version: { revision: 1, updatedAt: binding.approvedAt },
      },
      campaignInstanceId: binding.campaignInstanceId,
      campaignInstanceSnapshotId: this.context.campaignInstanceSnapshotId,
      ownerMembershipId: binding.ownerMembershipId,
      sourceDraftRevision: binding.sourceDraftRevision,
      name: draft.name!,
      backgroundDefinitionId: draft.backgroundDefinitionId!,
      professionDefinitionId: draft.professionDefinitionId!,
      heritageDefinitionIds: stringArray(draft.heritageDefinitionIds),
      attributeAssignments: numberRecord(draft.attributeAssignments),
      startingEquipmentDefinitionIds: stringArray(draft.startingEquipmentIds),
      equipmentAssignments: copyEntityData(draft.equipmentAssignments ?? {}),
      ...(draft.biography ? { biography: draft.biography } : {}),
      imageAssetIds: stringRecord(draft.imageAssetIds),
      approvedAt: binding.approvedAt,
    };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function validateCompleteDraft(
  draft: CharacterCreationDraftInput,
  creation: CharacterCreationContext,
): CharacterValidationIssue[] {
  const issues: CharacterValidationIssue[] = [];
  const add = (code: string, field: string, message: string) =>
    issues.push({ code, field, message });
  if (!draft.name?.trim()) {
    add("name-required", "name", "Enter a Character name.");
  }
  if (
    !draft.backgroundDefinitionId ||
    !creation.backgrounds.some(
      (option) => option.id === draft.backgroundDefinitionId,
    )
  ) {
    add(
      "background-required",
      "backgroundDefinitionId",
      "Choose an available Background.",
    );
  }
  if (
    !draft.professionDefinitionId ||
    !creation.professions.some(
      (option) => option.id === draft.professionDefinitionId,
    )
  ) {
    add(
      "profession-required",
      "professionDefinitionId",
      "Choose an available Profession.",
    );
  }
  const equipmentIssue = characterEquipmentIssue(
    draft.equipmentAssignments ?? {},
    stringArray(draft.startingEquipmentIds),
    creation.startingEquipment,
    creation.equipmentSlots,
  );
  if (equipmentIssue)
    add("equipment-invalid", "equipmentAssignments", equipmentIssue);
  const art = stringRecord(draft.imageAssetIds);
  const roles = ["portrait", "overheadToken", "paperDollToken"];
  if (
    roles.some((role) => !art[role]) ||
    new Set(roles.map((role) => art[role])).size !== 3
  )
    add(
      "artwork-required",
      "imageAssetIds",
      "Attach three distinct images: portrait, overhead token, and side-on token.",
    );
  const rolls = numberArray(draft.attributeRolls);
  if (
    rolls.length !== creation.attributeRollCount ||
    rolls.some((score) => !Number.isInteger(score) || score < 1 || score > 100)
  ) {
    add(
      "attribute-rolls-required",
      "attributeRolls",
      `Generate all ${creation.attributeRollCount} Attribute rolls.`,
    );
  }
  const assignments = numberRecord(draft.attributeAssignments);
  const allowedAttributeIds = new Set(
    creation.attributes.map((attribute) => attribute.id),
  );
  if (
    Object.keys(assignments).length !== creation.attributes.length ||
    Object.keys(assignments).some((id) => !allowedAttributeIds.has(id))
  ) {
    add(
      "attribute-assignments-incomplete",
      "attributeAssignments",
      "Assign one roll to every captured Attribute.",
    );
  }
  for (const attribute of creation.attributes) {
    const score = assignments[attribute.id];
    if (
      score === undefined ||
      !Number.isInteger(score) ||
      score < attribute.minimum ||
      score > attribute.maximum
    ) {
      add(
        "attribute-score-invalid",
        "attributeAssignments",
        `${attribute.name} requires a score between ${attribute.minimum} and ${attribute.maximum}.`,
      );
    }
  }
  if (rolls.length === creation.attributeRollCount) {
    const available = new Map<number, number>();
    rolls.forEach((roll) =>
      available.set(roll, (available.get(roll) ?? 0) + 1),
    );
    const invalidAssignment = Object.values(assignments).some((score) => {
      const remaining = available.get(score) ?? 0;
      if (remaining < 1) return true;
      available.set(score, remaining - 1);
      return false;
    });
    if (invalidAssignment) {
      add(
        "attribute-roll-mismatch",
        "attributeAssignments",
        "Every assigned Attribute score must use one generated roll.",
      );
    }
  }
  const equipment = stringArray(draft.startingEquipmentIds);
  if (
    equipment.some(
      (id) => !creation.startingEquipment.some((option) => option.id === id),
    )
  ) {
    add(
      "starting-equipment-invalid",
      "startingEquipmentIds",
      "Starting equipment must come from this Campaign Instance snapshot.",
    );
  }
  return issues;
}

function characterEquipmentIssue(
  assignments: unknown,
  selected: readonly string[],
  items: readonly CharacterCreationOption[],
  slots: readonly { id: string; name: string }[],
): string | undefined {
  if (!isObject(assignments)) return "Equipment assignments must be an object.";
  const occupied = new Set<string>();
  for (const [id, assigned] of Object.entries(assignments)) {
    const item = items.find((item) => item.id === id);
    if (
      !selected.includes(id) ||
      !item ||
      !Array.isArray(assigned) ||
      !assigned.length ||
      !assigned.every((s) => typeof s === "string")
    )
      return "Choose a carried Item and valid equipment slots.";
    if (
      new Set(assigned).size !== assigned.length ||
      !item.compatibleSlotSets?.some(
        (set) =>
          set.length === assigned.length &&
          set.every((s) => assigned.includes(s)),
      )
    )
      return "This Item does not fit the selected equipment slots.";
    for (const slot of assigned) {
      if (!slots.some((s) => s.id === slot))
        return "An equipment slot is unavailable in this capture.";
      if (occupied.has(slot))
        return "Two Items cannot occupy the same equipment slot.";
      occupied.add(slot);
    }
  }
}

/** Capture DTOs can explicitly carry absent optional keys; they are not persisted state. */
function definedContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(definedContext);
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, definedContext(entry)]),
    );
  return value;
}
