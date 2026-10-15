import { CreatureDefinition } from "../src";

const creature = CreatureDefinition.deserialize({ kind: "creature" });
creature.command("rename", {
  initiator: {},
  params: { name: "Raven" },
  context: {},
});
creature.command("rename", {
  initiator: {},
  // @ts-expect-error Creature names must be strings.
  params: { name: 42 },
  context: {},
});
// @ts-expect-error Creature Definitions do not accept engine actions.
creature.command("attack");
creature.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
