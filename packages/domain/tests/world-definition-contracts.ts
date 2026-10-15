import { WorldDefinition } from "../src";
const world = WorldDefinition.deserializePayload({});
world.command("replaceContent", {
  initiator: "gm",
  params: { content: {} },
  context: {},
});
// @ts-expect-error World has no direct child movement command.
world.command("moveCreature");
world.command("replaceContent", {
  initiator: "gm",
  // @ts-expect-error Authored content must be an object.
  params: { content: 42 },
  context: {},
});
world.events.contentReplaced.listen((event) => {
  const root: string | undefined = event.context.rootLocationId;
  // @ts-expect-error Event context is readonly.
  event.context.rootLocationId = root;
});
// @ts-expect-error Only declared World membership collections may change.
WorldDefinition.withMember({}, "adjacentLocationIds", "other");
