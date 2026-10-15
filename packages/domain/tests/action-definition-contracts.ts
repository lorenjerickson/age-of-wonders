import { ActionDefinition } from "../src";
import type { ActionComponents } from "@aow/common";

const components = {
  activation: "reaction",
  outcomes: [
    {
      id: "alarm",
      when: { kind: "always" },
      effects: [
        { kind: "narrative", text: "The bell rings", visibility: "gm" },
      ],
    },
  ],
  costs: [{ kind: "custom", key: "test:cost", payload: { secret: true } }],
  targets: [{ kind: "self" }],
  choices: [
    { id: "choice", prompt: "Choose", minimum: 0, maximum: 1, options: [] },
  ],
  test: { kind: "attack-roll", ties: "reroll" },
  limit: { kind: "once-per-turn" },
  duration: { kind: "instantaneous" },
  sustainedOperation: false,
} satisfies ActionComponents;
const action = ActionDefinition.deserializePayload({
  kind: "action",
  components,
});
const kind: "action" = action.state.data.kind;
void kind;
action.command("rename", {
  initiator: "author",
  params: { name: "Alert" },
  context: {},
});
// @ts-expect-error Action authoring has no runtime use command.
action.command("use");
action.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
action.state.data.kind = "action";
