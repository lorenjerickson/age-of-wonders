import { PlotDefinition } from "../src/plot-definition";
const plot = PlotDefinition.deserializePayload({});
plot.command("rename", {
  initiator: "gm",
  params: { name: "Heir" },
  context: {},
});
// @ts-expect-error Undeclared runtime command.
plot.command("complete");
plot.command("replaceContent", {
  initiator: "gm",
  // @ts-expect-error Content is an object.
  params: { content: 42 },
  context: {},
});
plot.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Events are immutable.
  event.context.name = name;
});
// @ts-expect-error State writes must use commands.
plot.state.data.name = "changed";
