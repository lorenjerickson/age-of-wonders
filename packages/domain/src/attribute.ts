import type { ModelElementLineage, ModelElementRevision } from "@aow/common";
import {
  Entity,
  copyEntityData,
  type CommandInvocation,
  type DeepReadonly,
  type EntityOptions,
  type EntityTransition,
  type ValidationContext,
  type ValidationIssue,
} from "./entity";

/** An Attribute is an adopted Model vocabulary option, never a separate Codex resource. */
export interface AttributeState {
  readonly lineage: ModelElementLineage;
  readonly revision: ModelElementRevision;
}
export interface AttributeValidationContext extends ValidationContext {
  /** Exact Model release closure; supplied by the authorized registry/compiler boundary. */
  readonly elements?: readonly AttributeState[];
}
export type AttributeCommands = {
  selectRevision: {
    params: { revision: ModelElementRevision };
    context: Record<string, never>;
  };
};
export type AttributeEvents = { revisionSelected: { revisionId: string } };

export class Attribute extends Entity<
  AttributeState,
  AttributeCommands,
  AttributeEvents,
  AttributeValidationContext
> {
  private constructor(
    data: AttributeState,
    context: AttributeValidationContext,
    options?: EntityOptions,
  ) {
    super("attribute", data, ["revisionSelected"], context, options);
    this.validate(context);
  }
  static deserialize(
    value: unknown,
    context: AttributeValidationContext = {},
    options?: EntityOptions,
  ): Attribute {
    if (this.object(value) && value.type === "attribute") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Attribute schema version.");
      return this.deserializePayload(value.data, context, options);
    }
    return this.deserializePayload(value, context, options);
  }
  static deserializePayload(
    value: unknown,
    context: AttributeValidationContext = {},
    options?: EntityOptions,
  ): Attribute {
    const data = copyEntityData(value);
    if (
      !this.object(data) ||
      !this.object(data.lineage) ||
      !this.object(data.revision) ||
      !this.object(data.revision.identity) ||
      !this.object(data.revision.payload) ||
      !this.object(data.revision.presentation)
    )
      throw new TypeError(
        "An Attribute requires a Model lineage and revision.",
      );
    return new Attribute(data as unknown as AttributeState, context, options);
  }
  serializePayload(): AttributeState {
    return this.serialize().data;
  }
  protected handleCommand<K extends keyof AttributeCommands>(
    name: K,
    invocation: CommandInvocation<AttributeCommands[K]>,
  ): EntityTransition<AttributeState, AttributeEvents> {
    if (name !== "selectRevision")
      throw new TypeError("Unknown Attribute command.");
    const data = this.serializePayload();
    const revision = invocation.params.revision;
    if (
      revision.identity.lineageId !== data.lineage.id ||
      revision.payload.kind !== "vocabulary-option"
    )
      throw new TypeError("Select an Attribute revision from this lineage.");
    // A published revision's content is immutable, even when reselecting it.
    if (revision.identity.id === data.revision.identity.id) {
      if (Attribute.canonical(revision) !== Attribute.canonical(data.revision))
        throw new TypeError(
          "An existing Attribute revision cannot be changed.",
        );
      return { data };
    }
    return {
      data: { ...data, revision },
      events: [
        {
          name: "revisionSelected",
          context: { revisionId: revision.identity.id },
        },
      ],
    };
  }
  protected validateState(
    data: DeepReadonly<AttributeState>,
    context: AttributeValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const add = (code: string, message: string) =>
      issues.push({ code, message });
    if (
      data.lineage.semanticRole !== "aow:attribute" ||
      data.lineage.kind !== "vocabulary-option"
    )
      add(
        "attribute-role-invalid",
        "An Attribute must be a Model vocabulary option with the Attribute semantic role.",
      );
    if (data.revision.identity.lineageId !== data.lineage.id)
      add(
        "attribute-revision-lineage-mismatch",
        "The selected Attribute revision belongs to another lineage.",
      );
    if (data.revision.payload.kind !== data.lineage.kind)
      add(
        "element-kind-mismatch",
        "The revision payload kind differs from its lineage kind.",
      );
    if (
      typeof data.revision.presentation.label !== "string" ||
      data.revision.presentation.label.trim() === ""
    )
      add(
        "element-label-missing",
        "A model element needs a human-readable label.",
      );
    const payload = data.revision.payload;
    if (payload.kind !== "vocabulary-option") return issues;
    if (!context.elements)
      return [
        ...issues,
        {
          code: "attribute-references-unresolved",
          message:
            "Attribute relationships have not been checked against an exact Model release.",
          unresolved: true,
        },
      ];
    const expect = (id: string | undefined, kind: string, label: string) => {
      if (!id) return;
      const target = context.elements?.find(
        (element) => element.lineage.id === id,
      );
      if (!target)
        add(
          "element-reference-missing",
          "The element references content outside the exact release closure.",
        );
      else if (target.lineage.kind !== kind)
        add(
          "element-reference-kind-mismatch",
          `${label} must reference a ${kind} element.`,
        );
      return target;
    };
    expect(payload.vocabularyId, "vocabulary", "A vocabulary option owner");
    const parent = expect(
      payload.parentOptionId,
      "vocabulary-option",
      "A parent option",
    );
    if (
      parent?.revision.payload.kind === "vocabulary-option" &&
      parent.revision.payload.vocabularyId !== payload.vocabularyId
    )
      add(
        "element-option-parent-vocabulary-mismatch",
        "A parent option must belong to the same vocabulary.",
      );
    return issues;
  }
  private static canonical(value: unknown): string {
    const sort = (entry: unknown): unknown =>
      Array.isArray(entry)
        ? entry.map(sort)
        : Attribute.object(entry)
          ? Object.fromEntries(
              Object.keys(entry)
                .sort()
                .map((key) => [key, sort(entry[key])]),
            )
          : entry;
    return JSON.stringify(sort(copyEntityData(value)));
  }
  private static object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
