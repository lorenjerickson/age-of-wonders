import { ItemDefinition } from "../src";

const item = ItemDefinition.deserialize({ kind: "item" });
item.command("rename", {
  initiator: "author",
  params: { name: "Key" },
  context: {},
});
item.command("rename", {
  initiator: "author",
  // @ts-expect-error Item names must be strings.
  params: { name: 2 },
  context: {},
});
// @ts-expect-error Authored Item Definitions have no engine attack command.
item.command("attack");
item.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Observed event state is immutable.
  event.context.name = name;
});
