import { Modifier } from "../src/modifier";
const entity = Modifier.deserializePayload({});
entity.command("rename", {
  initiator: null,
  params: { label: "Might" },
  context: {},
});
// @ts-expect-error Authored Modifier recipes cannot roll runtime dice.
entity.command("roll");
entity.command("rename", {
  initiator: null,
  // @ts-expect-error Labels are strings.
  params: { label: 1 },
  context: {},
});
entity.events.renamed.listen((event) => {
  const label: string = event.context.label;
  void label;
  // @ts-expect-error Event payloads are immutable.
  event.context.label = "other";
});
// @ts-expect-error Observable state is immutable.
entity.state.data.label = "other";
