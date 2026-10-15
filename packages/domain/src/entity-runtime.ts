import { BehaviorSubject, type Observable } from "rxjs";

export type DeepReadonly<T> = T extends
  string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
export interface ValidationContext {
  mode?: "draft" | "publication" | "runtime";
}
export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly blocking?: boolean;
  readonly unresolved?: boolean;
}
export interface EntityState<S> {
  readonly data: S;
  readonly metadata: {
    readonly revision: number;
    readonly validity: {
      readonly status: "unchecked" | "valid" | "invalid" | "unresolved";
      readonly mode: "draft" | "publication" | "runtime";
      readonly issues: readonly ValidationIssue[];
      readonly checkedRevision?: number;
    };
  };
}
export interface SerializedEntity<S> {
  readonly type: string;
  readonly schemaVersion: 1;
  readonly data: S;
}
export interface CommandSpec {
  params: object;
  context: object;
}
export interface CommandInvocation<T extends CommandSpec> {
  initiator: unknown;
  params: T["params"];
  context: T["context"];
}
export interface CommandReceipt {
  readonly status: "committed" | "unchanged" | "queued" | "rejected";
  readonly revision?: number;
  readonly reason?: string;
}
export type CommandEndpoint<T extends CommandSpec> = {
  (invocation: CommandInvocation<T>): Promise<CommandReceipt>;
  bind<I>(binding: {
    map: (input: I) => CommandInvocation<T>;
  }): (input: I) => Promise<void>;
};
export interface EmittedEntityEvent<T> {
  readonly name: string;
  readonly context: DeepReadonly<T>;
  readonly initiator: unknown;
  readonly source: { readonly type: string; readonly instanceId: string };
  readonly revision: number;
  readonly eventId: string;
  readonly causalParentId?: string;
}
export interface EventChannel<T> {
  listen(
    handler: (event: EmittedEntityEvent<T>) => void | Promise<void>,
  ): () => void;
}
export type EventChannels<E> = { readonly [K in keyof E]: EventChannel<E[K]> };
export type PendingEntityEvent<E> = {
  [K in keyof E & string]: { name: K; context: E[K] };
}[keyof E & string];
export interface EntityTransition<S, E> {
  data: S;
  events?: readonly PendingEntityEvent<E>[];
}
export interface EntityOptions {
  scope?: EntityScope;
  /** Deferred validation/teardown failures; RxJS observer failures use its host error handling. */
  onError?: (error: unknown) => void;
}
export interface IEntity<
  S extends object,
  C extends { [K in keyof C]: CommandSpec },
  E extends { [K in keyof E]: object },
  V extends ValidationContext = ValidationContext,
> {
  readonly state: DeepReadonly<EntityState<S>>;
  readonly state$: Observable<DeepReadonly<EntityState<S>>>;
  readonly events: EventChannels<E>;
  command<K extends keyof C & string>(name: K): CommandEndpoint<C[K]>;
  command<K extends keyof C & string>(
    name: K,
    invocation: CommandInvocation<C[K]>,
  ): Promise<CommandReceipt>;
  validate(context: V): void;
  serialize(): SerializedEntity<S>;
  dispose(): void;
}
/** Static factory contract; concrete classes decode and version their own payloads. */
export interface EntityConstructor<
  T,
  V extends ValidationContext = ValidationContext,
> {
  deserialize(input: unknown, context: V, options?: EntityOptions): T;
}

const eventScopes = new WeakMap<object, EntityScope>();
let scopeSequence = 0;

/** A single isolated execution graph. Nested work is queued, never recursively executed. */
export class EntityScope {
  #queue: Array<() => Promise<void>> = [];
  #running = false;
  #serial = 0;
  #parent: string | undefined;
  readonly #id = ++scopeSequence;
  readonly #maxWork: number;
  constructor(options: { maxWork?: number } = {}) {
    this.#maxWork = options.maxWork ?? 1000;
    if (!Number.isSafeInteger(this.#maxWork) || this.#maxWork < 1)
      throw new Error("Entity scope work limit must be a positive integer.");
  }
  nextId(): string {
    return `${this.#id}:${++this.#serial}`;
  }
  get running(): boolean {
    return this.#running;
  }
  get causalParentId(): string | undefined {
    return this.#parent;
  }
  async deliver(
    eventId: string,
    handler: () => void | Promise<void>,
  ): Promise<void> {
    const previous = this.#parent;
    this.#parent = eventId;
    try {
      await handler();
    } finally {
      this.#parent = previous;
    }
  }
  submit(
    work: () => CommandReceipt | Promise<CommandReceipt>,
  ): Promise<CommandReceipt> {
    let receipt: CommandReceipt = { status: "queued" };
    const nested = this.#running;
    this.#queue.push(async () => {
      receipt = await work();
      if (nested && receipt.status === "rejected")
        throw new Error(receipt.reason ?? "Queued command rejected.");
    });
    if (this.#running) return Promise.resolve({ status: "queued" });
    this.#running = true;
    return Promise.resolve().then(async () => {
      let count = 0;
      try {
        while (this.#queue.length) {
          if (++count > this.#maxWork)
            throw new Error("Entity causal work limit exceeded.");
          await this.#queue.shift()!();
        }
        return receipt;
      } finally {
        this.#queue = [];
        this.#running = false;
        this.#parent = undefined;
      }
    });
  }
}

/** Copy only JSON data. Reject executable values, cycles, exotic prototypes and nonfinite numbers. */
export function copyEntityData<T>(value: T): T {
  const active = new Set<object>();
  const copy = (v: unknown, depth = 0): unknown => {
    if (depth > 100) throw new Error("Entity data nesting limit exceeded.");
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || v === null)
      throw new Error("Entity state must contain JSON data.");
    if (active.has(v)) throw new Error("Entity state cannot contain cycles.");
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw new Error("Entity state must contain plain objects.");
    active.add(v);
    const result = Array.isArray(v)
      ? Array.from(v, (item) => copy(item, depth + 1))
      : Object.fromEntries(
          Object.entries(v)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, copy(item, depth + 1)]),
        );
    active.delete(v);
    return result;
  };
  return copy(value) as T;
}
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        same(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}

export abstract class Entity<
  S extends object,
  C extends { [K in keyof C]: CommandSpec },
  E extends { [K in keyof E]: object },
  V extends ValidationContext = ValidationContext,
> implements IEntity<S, C, E, V> {
  readonly state$: Observable<DeepReadonly<EntityState<S>>>;
  readonly events: EventChannels<E>;
  readonly #subject: BehaviorSubject<DeepReadonly<EntityState<S>>>;
  readonly #listeners = new Map<
    string,
    Set<(event: EmittedEntityEvent<unknown>) => void | Promise<void>>
  >();
  readonly #owned = new Set<() => void>();
  readonly #scope: EntityScope;
  readonly #type: string;
  readonly #instanceId: string;
  readonly #report: (error: unknown) => void;
  #context: V;
  #disposed = false;
  #publishing = false;
  #contextProvider: (() => object) | undefined;
  readonly #validationContributors = new Set<
    (data: DeepReadonly<S>, context: V) => readonly ValidationIssue[]
  >();

  protected constructor(
    type: string,
    data: S,
    eventNames: readonly (keyof E & string)[],
    context: V,
    options: EntityOptions = {},
  ) {
    this.#type = type;
    this.#scope = options.scope ?? new EntityScope();
    this.#instanceId = this.#scope.nextId();
    this.#context = freeze(copyEntityData(context)) as V;
    this.#report =
      options.onError ??
      ((error) => {
        void Promise.reject(error);
      });
    this.#subject = new BehaviorSubject(
      freeze(
        copyEntityData({
          data,
          metadata: {
            revision: 0,
            validity: {
              status: "unchecked" as const,
              mode: context.mode ?? "draft",
              issues: [],
            },
          },
        }),
      ) as DeepReadonly<EntityState<S>>,
    );
    this.state$ = this.#subject.asObservable();
    this.events = Object.freeze(
      Object.fromEntries(
        eventNames.map((name) => {
          this.#listeners.set(name, new Set());
          return [
            name,
            Object.freeze({
              listen: (
                handler: (
                  event: EmittedEntityEvent<unknown>,
                ) => void | Promise<void>,
              ) => {
                if (this.#disposed) throw new Error("Entity is disposed.");
                const listeners = this.#listeners.get(name)!;
                listeners.add(handler);
                return () => {
                  listeners.delete(handler);
                };
              },
            }),
          ];
        }),
      ),
    ) as EventChannels<E>;
  }
  get state(): DeepReadonly<EntityState<S>> {
    return this.#subject.value;
  }
  /** Execution scope is observable for graph registration, never persisted. */
  get executionScope(): EntityScope {
    return this.#scope;
  }
  get disposed(): boolean {
    return this.#disposed;
  }
  /** Local policy only; graph traversal uses this to terminate cyclic references. */
  localValidationIssues(): readonly ValidationIssue[] {
    return copyEntityData(
      this.validateState(
        this.state.data,
        this.#effectiveContext(this.#context),
      ),
    );
  }
  revalidate(): void {
    this.validate(this.#context);
  }
  setValidationMode(mode: NonNullable<ValidationContext["mode"]>): void {
    this.validate({ ...this.#context, mode });
  }
  provideValidationContext(provider: () => object): () => void {
    if (this.#contextProvider)
      throw new Error(
        "Entity already has a graph validation context provider.",
      );
    this.#contextProvider = provider;
    return () => {
      this.#contextProvider = undefined;
    };
  }
  #effectiveContext(context: V): V {
    return this.#contextProvider
      ? (freeze(
          copyEntityData({
            ...context,
            ...this.#contextProvider(),
            mode: context.mode ?? "draft",
          }),
        ) as V)
      : context;
  }
  /** A graph owns this contribution and releases it at teardown. */
  contributeValidation(
    validate: (data: DeepReadonly<S>, context: V) => readonly ValidationIssue[],
  ): () => void {
    if (this.#disposed) throw new Error("Entity is disposed.");
    this.#validationContributors.add(validate);
    return () => {
      this.#validationContributors.delete(validate);
    };
  }
  protected abstract validateState(
    data: DeepReadonly<S>,
    context: V,
  ): readonly ValidationIssue[];
  protected abstract handleCommand<K extends keyof C & string>(
    name: K,
    invocation: CommandInvocation<C[K]>,
  ): EntityTransition<S, E>;
  protected ownSubscription(unsubscribe: () => void): void {
    if (this.#disposed) unsubscribe();
    else this.#owned.add(unsubscribe);
  }
  #validity(
    data: DeepReadonly<S>,
    context: V,
    revision: number,
  ): EntityState<S>["metadata"]["validity"] {
    context = this.#effectiveContext(context);
    const issues = copyEntityData([
      ...this.validateState(data, context),
      ...[...this.#validationContributors].flatMap((validate) =>
        validate(data, context),
      ),
    ]);
    return {
      status: issues.some((issue) => issue.unresolved)
        ? "unresolved"
        : issues.length
          ? "invalid"
          : "valid",
      mode: context.mode ?? "draft",
      issues,
      checkedRevision: revision,
    };
  }
  validate(context: V): void {
    if (this.#disposed) throw new Error("Entity is disposed.");
    const snapshot = freeze(copyEntityData(context)) as V;
    if (this.#publishing || this.#scope.running) {
      void this.#scope
        .submit(() => {
          if (this.#disposed) throw new Error("Entity is disposed.");
          this.#validateNow(snapshot);
          return { status: "unchanged" };
        })
        .catch((error) => this.#report(error));
    } else this.#validateNow(snapshot);
  }
  #publish(state: DeepReadonly<EntityState<S>>): void {
    this.#publishing = true;
    try {
      this.#subject.next(state);
    } finally {
      this.#publishing = false;
    }
  }
  #validateNow(context: V): void {
    const current = this.state;
    const validity = this.#validity(
      current.data,
      context,
      current.metadata.revision,
    );
    this.#context = context;
    if (!same(validity, current.metadata.validity))
      this.#publish(
        freeze({
          data: current.data,
          metadata: { ...current.metadata, validity },
        }) as DeepReadonly<EntityState<S>>,
      );
  }
  serialize(): SerializedEntity<S> {
    return {
      type: this.#type,
      schemaVersion: 1,
      data: copyEntityData(this.state.data) as S,
    };
  }
  command<K extends keyof C & string>(name: K): CommandEndpoint<C[K]>;
  command<K extends keyof C & string>(
    name: K,
    invocation: CommandInvocation<C[K]>,
  ): Promise<CommandReceipt>;
  command<K extends keyof C & string>(
    name: K,
    invocation?: CommandInvocation<C[K]>,
  ): CommandEndpoint<C[K]> | Promise<CommandReceipt> {
    if (invocation === undefined) {
      const endpoint = ((input: CommandInvocation<C[K]>) =>
        this.command(name, input)) as CommandEndpoint<C[K]>;
      endpoint.bind = <I>(binding: {
        map: (input: I) => CommandInvocation<C[K]>;
      }) => {
        const map = binding.map;
        return async (input: I) => {
          const sourceScope =
            input && typeof input === "object"
              ? eventScopes.get(input)
              : undefined;
          if (sourceScope && sourceScope !== this.#scope)
            throw new Error("Bound entities must share an EntityScope.");
          const receipt = await this.command(name, map(input));
          if (receipt.status === "rejected")
            throw new Error(receipt.reason ?? "Command rejected.");
        };
      };
      return endpoint;
    }
    if (this.#disposed) return Promise.reject(new Error("Entity is disposed."));
    let input: CommandInvocation<C[K]>;
    try {
      if (
        !invocation ||
        typeof invocation !== "object" ||
        !Object.hasOwn(invocation, "initiator") ||
        !invocation.params ||
        typeof invocation.params !== "object" ||
        Array.isArray(invocation.params) ||
        !invocation.context ||
        typeof invocation.context !== "object" ||
        Array.isArray(invocation.context)
      )
        throw new TypeError(
          "A command requires initiator, parameters and context.",
        );
      input = freeze(copyEntityData(invocation)) as CommandInvocation<C[K]>;
    } catch (error) {
      return Promise.reject(error);
    }
    const parent = this.#scope.causalParentId;
    return this.#scope.submit(async () => {
      if (this.#disposed) throw new Error("Entity is disposed.");
      const transition = this.handleCommand(name, input);
      const data = freeze(copyEntityData(transition.data));
      const events = freeze(copyEntityData(transition.events ?? []));
      for (const event of events)
        if (!this.#listeners.has(event.name))
          throw new Error("Undeclared entity event.");
      const changed = !same(data, this.state.data);
      const revision = this.state.metadata.revision + (changed ? 1 : 0);
      const validity = this.#validity(data, this.#context, revision);
      if (validity.issues.some((issue) => issue.blocking !== false))
        return {
          status: "rejected",
          revision: this.state.metadata.revision,
          reason: "The command would violate entity invariants.",
        };
      if (changed || !same(validity, this.state.metadata.validity))
        this.#publish(
          freeze({
            data,
            metadata: { revision, validity },
          }) as DeepReadonly<EntityState<S>>,
        );
      for (const event of events) {
        const envelope = freeze(
          copyEntityData({
            name: `${this.#type}.events.${event.name}`,
            context: event.context,
            initiator: input.initiator,
            source: { type: this.#type, instanceId: this.#instanceId },
            revision,
            eventId: this.#scope.nextId(),
            ...(parent ? { causalParentId: parent } : {}),
          }),
        );
        eventScopes.set(envelope, this.#scope);
        const listeners = this.#listeners.get(event.name)!;
        for (const handler of [...listeners]) {
          if (listeners.has(handler))
            await this.#scope.deliver(envelope.eventId, () =>
              handler(envelope),
            );
        }
      }
      return { status: changed ? "committed" : "unchanged", revision };
    });
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const unsubscribe of this.#owned) {
      try {
        unsubscribe();
      } catch (error) {
        try {
          this.#report(error);
        } catch {
          /* Finish all cleanup. */
        }
      }
    }
    this.#owned.clear();
    this.#validationContributors.clear();
    this.#contextProvider = undefined;
    for (const listeners of this.#listeners.values()) listeners.clear();
    this.#subject.complete();
  }
}
