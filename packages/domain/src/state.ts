/** Dotted object keys; arrays and functions are leaf values. */
export type StatePath<TState> = TState extends readonly unknown[]
  ? never
  : TState extends (...args: never[]) => unknown
    ? never
    : TState extends object
      ? {
          [TKey in keyof TState & string]:
            TKey | `${TKey}.${StatePath<TState[TKey]>}`;
        }[keyof TState & string]
      : never;

type PathValue<TState, TPath extends string> = TState extends null | undefined
  ? undefined
  : TPath extends keyof TState
    ? TState[TPath]
    : TPath extends `${infer TKey}.${infer TRest}`
      ? TKey extends keyof TState
        ? PathValue<TState[TKey], TRest>
        : undefined
      : undefined;

/** Optional/null intermediate objects yield a possibly undefined value. */
export type StatePathValue<TState, TPath extends StatePath<TState>> = PathValue<
  TState,
  TPath
>;
