import type { Observable } from "rxjs";
import {
  EntityScope,
  copyEntityData,
  type EntityState,
  type DeepReadonly,
  type SerializedEntity,
  type ValidationContext,
  type ValidationIssue,
} from "./entity-runtime";

export interface EntityReference {
  readonly type: string;
  readonly id: string;
}
export interface GraphEntity {
  readonly executionScope: EntityScope;
  readonly disposed: boolean;
  readonly state: DeepReadonly<EntityState<object>>;
  readonly state$: Observable<DeepReadonly<EntityState<object>>>;
  validate(context: ValidationContext): void;
  revalidate(): void;
  setValidationMode(mode: NonNullable<ValidationContext["mode"]>): void;
  provideValidationContext(provider: () => object): () => void;
  localValidationIssues(): readonly ValidationIssue[];
  contributeValidation(
    validate: (
      data: object,
      context: ValidationContext,
    ) => readonly ValidationIssue[],
  ): () => void;
  serialize(): SerializedEntity<object>;
  dispose(): void;
}
export interface EntityGraphRegistration {
  readonly owner?: EntityReference;
  readonly context?: () => object;
  readonly references?: (data: object) => readonly EntityReference[];
}
export interface SerializedEntityGraph {
  readonly schemaVersion: 1;
  readonly nodes: readonly {
    readonly reference: EntityReference;
    readonly owner?: EntityReference;
    readonly entity: SerializedEntity<object>;
  }[];
}
const registrations = new WeakMap<GraphEntity, EntityGraph>();

interface Entry {
  reference: EntityReference;
  entity: GraphEntity;
  owner?: EntityReference;
  references: (data: object) => readonly EntityReference[];
  release: () => void;
}
function key(reference: EntityReference): string {
  if (
    !reference ||
    typeof reference.type !== "string" ||
    !reference.type ||
    typeof reference.id !== "string" ||
    !reference.id
  )
    throw new TypeError("Entity references require a type and identity.");
  return JSON.stringify([reference.type, reference.id]);
}

/** Request/aggregate-local identity map. References can cycle; ownership cannot. */
export class EntityGraph {
  readonly scope: EntityScope;
  readonly #entries = new Map<string, Entry>();
  #disposed = false;
  #refreshing = false;
  #hydrating = false;
  #pendingRefresh = false;
  constructor(options: { scope?: EntityScope } = {}) {
    this.scope = options.scope ?? new EntityScope();
  }
  #assertOpen(): void {
    if (this.#disposed) throw new Error("Entity graph is disposed.");
  }
  add<T extends GraphEntity>(
    reference: EntityReference,
    entity: T,
    options: EntityGraphRegistration = {},
  ): T {
    this.#assertOpen();
    const identity = key(reference);
    if (this.#entries.has(identity))
      throw new Error("Duplicate entity identity in graph.");
    if (entity.executionScope !== this.scope || entity.disposed)
      throw new Error("Graph entities must be live and share its EntityScope.");
    if (registrations.has(entity))
      throw new Error("An entity has one graph identity.");
    const owner = options.owner && copyEntityData(options.owner);
    let ancestor = owner;
    const visited = new Set<string>();
    while (ancestor) {
      const ancestorKey = key(ancestor);
      if (ancestorKey === identity || visited.has(ancestorKey))
        throw new Error("Entity ownership cannot contain cycles.");
      visited.add(ancestorKey);
      ancestor = this.#entries.get(ancestorKey)?.owner;
    }
    const entry: Entry = {
      reference: copyEntityData(reference),
      entity,
      ...(owner ? { owner } : {}),
      references: options.references ?? (() => []),
      release: () => {},
    };
    this.#entries.set(identity, entry);
    registrations.set(entity, this);
    let removeContext = () => {};
    let removePolicy = () => {};
    let unsubscribe = () => {};
    entry.release = () => {
      removePolicy();
      removeContext();
      unsubscribe();
      registrations.delete(entity);
    };
    try {
      removeContext = options.context
        ? entity.provideValidationContext(options.context)
        : () => {};
      removePolicy = entity.contributeValidation((data) =>
        this.#issues(identity, data),
      );
      let initial = true;
      let lastRevision = entity.state.metadata.revision;
      let lastLocal = JSON.stringify(entity.localValidationIssues());
      const subscription = entity.state$.subscribe({
        next: () => {
          const revision = entity.state.metadata.revision;
          const local = JSON.stringify(entity.localValidationIssues());
          const changed = revision !== lastRevision || local !== lastLocal;
          lastRevision = revision;
          lastLocal = local;
          if (!initial && changed) this.#refresh();
        },
        complete: () => {
          if (!this.#disposed) this.remove(entry.reference);
        },
      });
      unsubscribe = () => subscription.unsubscribe();
      initial = false;
      this.#refresh();
    } catch (error) {
      entry.release();
      this.#entries.delete(identity);
      throw error;
    }
    return entity;
  }
  resolve<T extends GraphEntity = GraphEntity>(
    reference: EntityReference,
  ): T | undefined {
    this.#assertOpen();
    const entity = this.#entries.get(key(reference))?.entity;
    return entity && !entity.disposed ? (entity as T) : undefined;
  }
  children(reference: EntityReference): readonly GraphEntity[] {
    this.#assertOpen();
    const identity = key(reference);
    return [...this.#entries.values()]
      .filter(
        (entry) =>
          entry.owner &&
          key(entry.owner) === identity &&
          !entry.entity.disposed,
      )
      .map((entry) => entry.entity);
  }
  #issues(identity: string, candidate: object): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const visited = new Set<string>([identity]);
    const visit = (entry: Entry, data: object): void => {
      const dependencies = [
        ...entry.references(data),
        ...(entry.owner ? [entry.owner] : []),
        ...[...this.#entries.values()]
          .filter(
            (child) => child.owner && key(child.owner) === key(entry.reference),
          )
          .map((child) => child.reference),
      ];
      for (const reference of dependencies) {
        const dependencyKey = key(reference);
        const dependency = this.#entries.get(dependencyKey);
        if (!dependency || dependency.entity.disposed) {
          issues.push({
            code: "graph.reference-unresolved",
            message: "A referenced entity is unavailable in this graph.",
            unresolved: true,
          });
          continue;
        }
        if (visited.has(dependencyKey)) continue;
        visited.add(dependencyKey);
        if (
          dependency.entity
            .localValidationIssues()
            .some((issue) => issue.blocking !== false)
        )
          issues.push({
            code: "graph.dependency-invalid",
            message: "A referenced entity is invalid.",
          });
        visit(dependency, dependency.entity.state.data);
      }
    };
    const entry = this.#entries.get(identity);
    if (entry) visit(entry, candidate);
    return issues;
  }
  #refresh(): void {
    if (this.#disposed || this.#refreshing || this.#hydrating) return;
    if (this.scope.running) {
      if (this.#pendingRefresh) return;
      this.#pendingRefresh = true;
      void this.scope.submit(() => {
        this.#pendingRefresh = false;
        this.#refreshNow();
        return { status: "unchanged" };
      });
    } else this.#refreshNow();
  }
  #refreshNow(): void {
    if (this.#disposed) return;
    this.#refreshing = true;
    try {
      for (const entry of this.#entries.values())
        if (!entry.entity.disposed) entry.entity.revalidate();
    } finally {
      this.#refreshing = false;
    }
  }
  validate(context: ValidationContext): void {
    this.#assertOpen();
    // Change every local policy context before traversing dependency validity again.
    this.#refreshing = true;
    try {
      for (const entry of this.#entries.values())
        if (!entry.entity.disposed)
          entry.entity.setValidationMode(context.mode ?? "draft");
    } finally {
      this.#refreshing = false;
    }
    this.#refresh();
  }
  serialize(): SerializedEntityGraph {
    this.#assertOpen();
    return {
      schemaVersion: 1,
      nodes: [...this.#entries.values()]
        .filter((entry) => !entry.entity.disposed)
        .map((entry) => ({
          reference: copyEntityData(entry.reference),
          ...(entry.owner ? { owner: copyEntityData(entry.owner) } : {}),
          entity: entry.entity.serialize(),
        })),
    };
  }
  /** Factory owns codecs/reference grammar; hydration never consults another graph. */
  static hydrate(
    snapshot: SerializedEntityGraph,
    factory: (
      serialized: SerializedEntity<object>,
      options: { scope: EntityScope },
      reference: EntityReference,
    ) => {
      entity: GraphEntity;
      references?: EntityGraphRegistration["references"];
      context?: EntityGraphRegistration["context"];
    },
    context: ValidationContext,
  ): EntityGraph {
    const captured = copyEntityData(snapshot);
    if (captured.schemaVersion !== 1 || !Array.isArray(captured.nodes))
      throw new TypeError("Unsupported entity graph snapshot.");
    const graph = new EntityGraph();
    graph.#hydrating = true;
    try {
      for (const node of captured.nodes) {
        const created = factory(
          node.entity,
          { scope: graph.scope },
          node.reference,
        );
        try {
          graph.add(node.reference, created.entity, {
            owner: node.owner,
            references: created.references,
            context: created.context,
          });
        } catch (error) {
          created.entity.dispose();
          throw error;
        }
      }
      graph.#hydrating = false;
      graph.validate(context);
      return graph;
    } catch (error) {
      graph.dispose();
      throw error;
    }
  }
  /** Removing an owner also disposes all of its persistently registered children. */
  remove(reference: EntityReference): void {
    this.#assertOpen();
    const identity = key(reference);
    const entry = this.#entries.get(identity);
    if (!entry) return;
    this.#refreshing = true;
    try {
      const remove = (id: string): void => {
        for (const [childId, child] of this.#entries)
          if (child.owner && key(child.owner) === id) remove(childId);
        const current = this.#entries.get(id);
        if (current) {
          current.release();
          this.#entries.delete(id);
          current.entity.dispose();
        }
      };
      remove(identity);
    } finally {
      this.#refreshing = false;
    }
    this.#refresh();
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    for (const entry of entries) entry.release();
    for (const entry of entries) entry.entity.dispose();
  }
}
