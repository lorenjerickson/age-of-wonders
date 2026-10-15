import {
  Entity,
  type DeepReadonly,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
  type EntityOptions,
} from "./entity";

/** Decoded JSON may contain incomplete authoring fields, diagnosed through state. */
export type CodexDefinitionState = Record<string, unknown>;
export interface CodexDefinitionValidationContext {
  readonly mode?: "draft" | "publication" | "runtime";
  readonly sourceId?: string;
  /** Authorized, immutable World capture; callers revalidate when it changes. */
  readonly records?: readonly {
    readonly resourceType: string;
    readonly sourceId: string;
    readonly payload: unknown;
  }[];
}
export type CodexDefinitionCommands = {
  rename: { params: { name: string }; context: Record<string, never> };
};
export type CodexDefinitionEvents = { renamed: { name: string } };

/** Shared authored Codex identity behavior, separate from runtime entities. */
export abstract class CodexDefinition<
  Context extends CodexDefinitionValidationContext =
    CodexDefinitionValidationContext,
> extends Entity<
  CodexDefinitionState,
  CodexDefinitionCommands,
  CodexDefinitionEvents,
  Context
> {
  protected constructor(
    type: string,
    data: CodexDefinitionState,
    context: Context,
    options?: EntityOptions,
  ) {
    super(type, data, ["renamed"], context, options);
  }

  static authorPayload(
    id: string,
    input: Record<string, unknown>,
    previous?: unknown,
  ): Record<string, unknown> & { id: string; revision: number } {
    const prior = CodexDefinition.isObject(previous) ? previous : undefined;
    return {
      ...input,
      id,
      name: typeof input.name === "string" ? input.name.trim() : input.name,
      revision: Number(prior?.revision ?? 0) + 1,
    };
  }

  serializePayload(): CodexDefinitionState {
    return this.serialize().data;
  }

  protected handleCommand<K extends keyof CodexDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<CodexDefinitionCommands[K]>,
  ): EntityTransition<CodexDefinitionState, CodexDefinitionEvents> {
    if (name !== "rename")
      throw new TypeError("Unknown Codex Definition command.");
    if (!CodexDefinition.text(invocation.params.name, 120))
      throw new TypeError("Provide a valid Codex name.");
    const nextName = invocation.params.name.trim();
    const data = this.serializePayload();
    if (data.name === nextName) return { data };
    return {
      data: { ...data, name: nextName },
      events: [{ name: "renamed", context: { name: nextName } }],
    };
  }

  protected identityIssues(
    data: DeepReadonly<CodexDefinitionState>,
    context: CodexDefinitionValidationContext,
    prefix: string,
  ): ValidationIssue[] {
    if (
      !CodexDefinition.text(data.id) ||
      !CodexDefinition.text(data.name, 120) ||
      !Number.isInteger(data.revision) ||
      Number(data.revision) < 1 ||
      (data.description !== undefined &&
        (typeof data.description !== "string" ||
          data.description.length > 20000))
    )
      return [
        {
          code: `${prefix}-codex-identity`,
          message: "Provide a valid Codex name and description.",
        },
      ];
    if (context.sourceId !== undefined && data.id !== context.sourceId)
      return [
        {
          code: `${prefix}-codex-identity`,
          message: "The Codex identity does not match its snapshot record.",
        },
      ];
    return [];
  }

  protected static decode(value: unknown, type: string): CodexDefinitionState {
    let payload = value;
    if (this.isObject(value) && value.type === type) {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Codex Definition schema version.");
      payload = value.data;
    }
    return this.decodePayload(payload);
  }

  protected static decodePayload(payload: unknown): CodexDefinitionState {
    if (!this.isObject(payload) || !this.isJson(payload))
      throw new TypeError("A Codex Definition requires a bounded JSON object.");
    return payload;
  }

  protected static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  protected static text(value: unknown, max = 240): value is string {
    return typeof value === "string" && !!value.trim() && value.length <= max;
  }
  protected static finite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
  protected static array(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length <= 200;
  }
  protected static numbers(value: unknown): boolean {
    return (
      this.isObject(value) &&
      Object.keys(value).length <= 200 &&
      Object.entries(value).every(
        ([key, number]) =>
          this.text(key) &&
          !["__proto__", "constructor", "prototype"].includes(key) &&
          this.finite(number),
      )
    );
  }
  private static isJson(
    value: unknown,
    depth = 0,
    ancestors = new Set<object>(),
  ): boolean {
    if (depth > 64) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || value === null || ancestors.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const valid = Object.values(value).every((child) =>
      this.isJson(child, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return valid;
  }
}
