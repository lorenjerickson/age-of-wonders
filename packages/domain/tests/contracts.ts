import type {
  Command,
  DomainEntity,
  DomainEvent,
  EventHandlers,
  StatePath,
  StatePathValue,
} from "../src";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

interface Actor {
  id: string;
}
interface OpenParams {
  force: number;
}
interface OpenContext {
  location: string;
}
interface State {
  door: {
    lock?: { difficulty: number };
    open: boolean;
    tags: string[];
  };
}

type Open = Command<"door.commands.open", OpenParams, Actor, OpenContext>;
type Close = Command<"door.commands.close", { quietly: boolean }, Actor>;
type Opened = DomainEvent<"door.events.opened", { force: number }, Actor>;
type Closed = DomainEvent<"door.events.closed", { quietly: boolean }, Actor>;
type Contract = DomainEntity<State, Open | Close, Opened | Closed>;

type RequiredValue = Assert<Equal<StatePathValue<State, "door.open">, boolean>>;
type OptionalValue = Assert<
  Equal<StatePathValue<State, "door.lock.difficulty">, number | undefined>
>;
type NullableValue = Assert<
  Equal<
    StatePathValue<{ item: { value: number } | null }, "item.value">,
    number | undefined
  >
>;
type ArrayLeaf = Assert<Equal<StatePathValue<State, "door.tags">, string[]>>;
type ParamsPreserved = Assert<
  Equal<
    Extract<Contract["commands"], { name: "door.commands.open" }>["params"],
    OpenParams
  >
>;

const path: StatePath<State> = "door.lock.difficulty";
// @ts-expect-error Unknown state path.
const invalidPath: StatePath<State> = "door.lock.missing";
// @ts-expect-error Arrays are leaves, not method/property namespaces.
const arrayPath: StatePath<State> = "door.tags.length";
// @ts-expect-error Invalid paths cannot be dereferenced.
type InvalidValue = StatePathValue<State, "door.missing">;
// @ts-expect-error Commands use the commands namespace.
type InvalidCommand = Command<"door.open", OpenParams, Actor>;
// @ts-expect-error Events use the events namespace.
type InvalidEvent = DomainEvent<"door.commands.open", OpenContext, Actor>;

const actor: Actor = { id: "test-actor" };
const command: Contract["commands"] = {
  initiator: actor,
  name: "door.commands.open",
  params: { force: 2 },
  context: { location: "hall" },
};
const wrongParams: Contract["commands"] = {
  initiator: actor,
  name: "door.commands.open",
  // @ts-expect-error A command name determines its required params.
  params: { quietly: true },
  context: { location: "hall" },
};
const wrongContext: Open = {
  initiator: actor,
  name: "door.commands.open",
  params: { force: 2 },
  // @ts-expect-error A command's required context cannot be omitted.
  context: {},
};
const wrongInitiator: Opened = {
  // @ts-expect-error Initiators retain their declared entity type.
  initiator: "test-actor",
  name: "door.events.opened",
  context: { force: 2 },
};
const missingContext: Opened = {
  initiator: actor,
  name: "door.events.opened",
  // @ts-expect-error Event context includes all declared required fields.
  context: {},
};

const handlers: Contract["handlers"] = {
  "door.events.opened": [
    (event) => {
      const force: number = event.context.force;
      // @ts-expect-error The closed event's context is unavailable here.
      event.context.quietly;
    },
  ],
};
const wrongHandler: EventHandlers<Opened | Closed> = {
  // @ts-expect-error A closed-event handler cannot subscribe to opened events.
  "door.events.opened": [(event: Closed) => {}],
};

type ExternalSubscription = DomainEntity<State, Open, Opened, Closed>;
const externalHandlers: ExternalSubscription["handlers"] = {
  "door.events.closed": [
    (event) => {
      const quietly: boolean = event.context.quietly;
    },
  ],
};

// Paths into union branches retain the possibility of an absent property.
type UnionValue = Assert<
  Equal<
    StatePathValue<{ variant: { a: number } | { b: string } }, "variant.a">,
    number | undefined
  >
>;
type SharedEvents = DomainEvent<
  "door.events.opened" | "door.events.closed",
  { reason: string },
  Actor
>;
const sharedHandlers: EventHandlers<SharedEvents> = {
  "door.events.opened": [
    (event) => {
      const name: "door.events.opened" = event.name;
      const reason: string = event.context.reason;
    },
  ],
};
