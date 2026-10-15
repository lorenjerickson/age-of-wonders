import { EffectDefinition, ConditionDefinition } from "../src";

const effect = EffectDefinition.deserialize({});
const condition = ConditionDefinition.deserialize({});
effect.command("rename", {
  initiator: "author",
  params: { name: "Haste" },
  context: {},
});
condition.command("rename", {
  initiator: "author",
  // @ts-expect-error The Condition name must be textual.
  params: { name: 3 },
  context: {},
});
// @ts-expect-error Definition authoring does not implement runtime activation.
effect.command("activate");
effect.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
