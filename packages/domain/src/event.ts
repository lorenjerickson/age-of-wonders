export type EventName = `${string}.events.${string}`;

/** Context is the mapped data declared as required by this event. */
export type DomainEvent<
  TName extends EventName,
  TContext extends object,
  TInitiator,
> = TName extends EventName
  ? {
      initiator: TInitiator;
      name: TName;
      context: TContext;
    }
  : never;

export type EventHandler<
  TEvent extends DomainEvent<EventName, object, unknown>,
> = (event: TEvent) => void | Promise<void>;

/** Each subscription receives only the payload for its event name. */
export type EventHandlers<
  TEvents extends DomainEvent<EventName, object, unknown>,
> = {
  [TName in TEvents["name"]]?: readonly EventHandler<
    Extract<TEvents, { name: TName }>
  >[];
};
