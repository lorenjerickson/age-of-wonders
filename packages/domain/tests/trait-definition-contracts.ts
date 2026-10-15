import { TraitDefinition } from "../src";
import type { TraitComponents } from "@aow/common";

const components = {
  prerequisites: [{ kind: "always" }],
  modifiers: [
    {
      id: "armor",
      target: "stats.armor",
      operation: "add",
      value: { kind: "literal", value: 1 },
    },
  ],
  triggers: [
    {
      event: "turn-start",
      timing: "after",
      optional: true,
      effects: [
        { kind: "narrative", text: "The bell rings", visibility: "gm" },
      ],
    },
  ],
  choices: [
    { id: "choice", prompt: "Choose", minimum: 0, maximum: 1, options: [] },
  ],
} satisfies TraitComponents;
const empty: TraitComponents = {};
void empty;
const trait = TraitDefinition.deserializePayload({ kind: "trait", components });
const kind: "trait" = trait.state.data.kind;
void kind;
trait.command("rename", {
  initiator: "author",
  params: { name: "Alert" },
  context: {},
});
// @ts-expect-error Trait authoring has no runtime use command.
trait.command("use");
trait.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
trait.state.data.kind = "trait";
