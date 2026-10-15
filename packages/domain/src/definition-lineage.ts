import {
  Entity,
  type EntityOptions,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";
export interface DefinitionLineageState {
  status: "ACTIVE" | "ARCHIVED";
  currentRevisionId: string | null;
  revisionNumber: number;
}
export interface DefinitionPublicationEvidence {
  expectedStorageRevision: number;
  storageRevision: number;
  baseRevisionId: string | null;
  validationStatus: string;
  validatedStorageRevision: number | null;
}
export type DefinitionPublicationIssue =
  "archived" | "stale-draft" | "stale-base" | "not-validated";
type Commands = {
  publish: {
    params: DefinitionPublicationEvidence & { revisionId: string };
    context: object;
  };
  archive: { params: { archived: boolean }; context: object };
};
type Events = {
  published: { revisionId: string; predecessorRevisionId: string | null };
  archived: { archived: boolean };
};
/** World/Campaign lineage transitions; immutable captures, hashing and CAS belong to storage. */
export class DefinitionLineage extends Entity<
  DefinitionLineageState,
  Commands,
  Events
> {
  private constructor(data: DefinitionLineageState, options?: EntityOptions) {
    super("definition-lineage", data, ["published", "archived"], {}, options);
    this.validate({});
  }
  static deserializePayload(
    data: DefinitionLineageState,
    options?: EntityOptions,
  ) {
    return new DefinitionLineage(data, options);
  }
  static deserialize(value: unknown, options?: EntityOptions): DefinitionLineage {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new TypeError("Definition lineage must be an object.");
    const record = value as Record<string, unknown>;
    if (record.type === "definition-lineage") {
      if (record.schemaVersion !== 1)
        throw new TypeError("Unsupported Definition lineage schema version.");
      return this.deserialize(record.data, options);
    }
    return this.deserializePayload(
      record as unknown as DefinitionLineageState,
      options,
    );
  }
  static async archiveStatus(archived: boolean, initiator: string) {
    const owner = this.deserializePayload({
      status: archived ? "ACTIVE" : "ARCHIVED",
      currentRevisionId: null,
      revisionNumber: 0,
    });
    try {
      await owner.command("archive", {
        initiator,
        params: { archived },
        context: {},
      });
      return owner.state.data.status;
    } finally {
      owner.dispose();
    }
  }
  serializePayload() {
    return this.serialize().data;
  }
  static publicationIssue(
    state: DefinitionLineageState,
    evidence: DefinitionPublicationEvidence,
  ): DefinitionPublicationIssue | undefined {
    if (state.status !== "ACTIVE") return "archived";
    if (evidence.storageRevision !== evidence.expectedStorageRevision)
      return "stale-draft";
    if (evidence.baseRevisionId !== state.currentRevisionId)
      return "stale-base";
    if (
      evidence.validationStatus !== "VALID" ||
      evidence.validatedStorageRevision !== evidence.storageRevision
    )
      return "not-validated";
    return undefined;
  }
  static successorIssue(
    source: { worldDefinitionId: string; worldDefinitionRevisionId: string },
    target: { worldDefinitionId: string; predecessorRevisionId: string | null },
  ): string | undefined {
    if (target.worldDefinitionId !== source.worldDefinitionId)
      return "The selected World revision belongs to a different World.";
    if (target.predecessorRevisionId !== source.worldDefinitionRevisionId)
      return "World migration must adopt the direct successor revision.";
    return undefined;
  }
  protected validateState(data: Readonly<DefinitionLineageState>) {
    return Number.isInteger(data.revisionNumber) && data.revisionNumber >= 0
      ? []
      : [
          {
            code: "invalid-revision",
            message: "Revision number must be a nonnegative integer.",
          },
        ];
  }
  protected handleCommand<K extends keyof Commands>(
    name: K,
    invocation: CommandInvocation<Commands[K]>,
  ): EntityTransition<DefinitionLineageState, Events> {
    if (name === "archive") {
      const { archived } = invocation.params as Commands["archive"]["params"];
      return {
        data: { ...this.state.data, status: archived ? "ARCHIVED" : "ACTIVE" },
        events: [{ name: "archived", context: { archived } }],
      };
    }
    if (name !== "publish")
      throw new TypeError("Unknown Definition lineage command.");
    const params = invocation.params as Commands["publish"]["params"];
    const issue = DefinitionLineage.publicationIssue(this.state.data, params);
    if (issue) throw new TypeError(issue);
    if (
      !params.revisionId.trim() ||
      params.revisionId === this.state.data.currentRevisionId
    )
      throw new TypeError("A new revision identity is required.");
    return {
      data: {
        ...this.state.data,
        currentRevisionId: params.revisionId,
        revisionNumber: this.state.data.revisionNumber + 1,
      },
      events: [
        {
          name: "published",
          context: {
            revisionId: params.revisionId,
            predecessorRevisionId: this.state.data.currentRevisionId,
          },
        },
      ],
    };
  }
}
