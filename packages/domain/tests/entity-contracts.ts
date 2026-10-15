import { Entity } from "../src";
import type {
  CommandInvocation,
  DeepReadonly,
  EntityTransition,
  ValidationContext,
  ValidationIssue,
} from "../src";

type DoorData = { open: boolean; nested: { tags: string[] } };
type DoorCommands = {
  open: { params: { force: number }; context: { locationId: string } };
  close: { params: { quietly: boolean }; context: { locationId: string } };
};
type DoorEvents = {
  opened: { locationId: string };
  closed: { quietly: boolean };
};

class Door extends Entity<DoorData, DoorCommands, DoorEvents> {
  constructor() {
    super("door", { open: false, nested: { tags: [] } }, ["opened", "closed"], {
      mode: "runtime",
    });
    this.validate({ mode: "runtime" });
  }
  protected validateState(
    data: DeepReadonly<DoorData>,
    context: ValidationContext,
  ): readonly ValidationIssue[] {
    // @ts-expect-error Concept validation cannot mutate state.
    data.nested.tags.push("mutation");
    return [];
  }
  protected handleCommand<K extends keyof DoorCommands & string>(
    name: K,
    invocation: CommandInvocation<DoorCommands[K]>,
  ): EntityTransition<DoorData, DoorEvents> {
    return {
      data: { open: true, nested: { tags: [] } },
      events: [
        {
          name: "opened",
          context: { locationId: invocation.context.locationId },
        },
      ],
    };
  }
}

declare const door: Door;
door.command("open", {
  initiator: {},
  params: { force: 2 },
  context: { locationId: "hall" },
});
door.command("open", {
  initiator: {},
  // @ts-expect-error Command parameters are correlated to the selected endpoint.
  params: { quietly: true },
  context: { locationId: "hall" },
});
// @ts-expect-error Missing mandatory command context.
door.command("open", { initiator: {}, params: { force: 2 }, context: {} });
// @ts-expect-error Undeclared command.
door.command("activate");
// @ts-expect-error Synchronous state is deeply readonly.
door.state.data.nested.tags.push("mutation");
// @ts-expect-error State metadata is readonly.
door.state.metadata.revision = 12;
// @ts-expect-error Consumers cannot publish state.
door.state$.next(door.state);
door.state$.subscribe((state) => {
  const open: boolean = state.data.open;
  // @ts-expect-error Observable snapshots are deeply readonly.
  state.data.open = false;
});
door.events.opened.listen((event) => {
  const location: string = event.context.locationId;
  // @ts-expect-error Event payloads are correlated with their channel.
  event.context.quietly;
});
// @ts-expect-error Wrong channel handler context.
door.events.opened.listen((event: { context: { quietly: boolean } }) => {});
// @ts-expect-error Incompatible raw event-to-command binding needs explicit mapping.
door.events.opened.listen(door.command("open"));
const endpoint = door.command("open").bind({
  map: (input: { location: string }) => ({
    initiator: {},
    params: { force: 1 },
    context: { locationId: input.location },
  }),
});
endpoint({ location: "hall" });
// @ts-expect-error Bound endpoint preserves input type.
endpoint({ quietly: true });
door.command("open").bind({
  // @ts-expect-error Bind-time mapping must supply mandatory context.
  map: (input: { force: number }) => ({
    initiator: {},
    params: input,
    context: {},
  }),
});
const invalidTransition: EntityTransition<DoorData, DoorEvents> = {
  data: { open: true, nested: { tags: [] } },
  // @ts-expect-error Event name and payload remain correlated in transitions.
  events: [{ name: "opened", context: { quietly: true } }],
};

// Branded common identifiers remain primitive values through observable readonly state.
type BrandedId = string & { readonly __brand: "test-id" };
declare const brandedState: DeepReadonly<{
  id: BrandedId;
  nested: { count: number };
}>;
const primitiveId: string = brandedState.id;
const preservedBrand: BrandedId = brandedState.id;
// @ts-expect-error Preserving primitive brands must not make containing state writable.
brandedState.nested.count = 1;
void primitiveId;
void preservedBrand;
