import type { Command, CommandName } from "./command";
import type { DomainEvent, EventHandlers, EventName } from "./event";

export * from "./entity-runtime";

/**
 * Legacy type-level compatibility contract; executable concepts use Entity.
 * @deprecated Use the executable Entity base for new domain concepts.
 * Commands and events describe payload unions,
 * not methods, queues, or a dispatch implementation. Handler events may include
 * events emitted by other entities.
 */
export interface DomainEntity<
  TState extends object,
  TCommands extends Command<CommandName, object, unknown, object, object>,
  TEvents extends DomainEvent<EventName, object, unknown>,
  THandledEvents extends DomainEvent<EventName, object, unknown> = TEvents,
> {
  state: TState;
  commands: TCommands;
  events: TEvents;
  handlers: EventHandlers<THandledEvents>;
}
