import { PlacementDefinition } from "../src/placement-definition";
const placement = PlacementDefinition.deserializePayload(
  {},
  { scope: "world" },
);
placement.command("replacePayload", {
  initiator: "gm",
  params: { payload: {} },
  context: {},
});
// @ts-expect-error Placement scope must be explicit.
PlacementDefinition.deserializePayload({});
// @ts-expect-error Runtime realization is not a Placement Definition command.
placement.command("realize");
placement.events.payloadReplaced.listen((event) => {
  const id: string = event.context.id;
  // @ts-expect-error Events are immutable.
  event.context.id = id;
});
// @ts-expect-error State is immutable.
placement.state.data.name = "changed";
