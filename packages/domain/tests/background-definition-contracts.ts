import { BackgroundDefinition } from "../src";
const background = BackgroundDefinition.deserializePayload({
  kind: "background",
});
const kind: "background" = background.state.data.kind;
void kind;
background.command("rename", {
  initiator: "author",
  params: { name: "Pilot" },
  context: {},
});
// @ts-expect-error Background authoring has no runtime use command.
background.command("use");
background.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
background.state.data.kind = "background";
