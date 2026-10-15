import { HeritageDefinition } from "../src";
const heritage = HeritageDefinition.deserializePayload({
  kind: "heritage",
});
const kind: "heritage" = heritage.state.data.kind;
void kind;
heritage.command("rename", {
  initiator: "author",
  params: { name: "Pilot" },
  context: {},
});
// @ts-expect-error Heritage authoring has no runtime use command.
heritage.command("use");
heritage.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
heritage.state.data.kind = "heritage";
