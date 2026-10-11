export type CommandName = `${string}.commands.${string}`;

/** An action payload, independent of the code that executes it. */
export interface Command<
  TName extends CommandName,
  TParams extends object,
  TInitiator,
  TContext extends object = Record<string, unknown>,
  TMetadata extends object = Record<string, unknown>,
> {
  initiator: TInitiator;
  name: TName;
  params: TParams;
  context: TContext;
  /** Additional metadata cannot replace the required envelope fields. */
  metadata?: TMetadata;
}
