import { FeatDefinition } from "../src";
const feat = FeatDefinition.deserializePayload({
  kind: "feat",
});
const kind: "feat" = feat.state.data.kind;
void kind;
feat.command("rename", {
  initiator: "author",
  params: { name: "Alert" },
  context: {},
});
// @ts-expect-error Feat authoring has no runtime use command.
feat.command("use");
feat.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
feat.state.data.kind = "feat";
