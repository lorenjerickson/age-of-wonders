import { CharacterTemplate } from "../src";

const character = CharacterTemplate.deserializePayload({});
character.command("rename", {
  initiator: "author",
  params: { name: "Guide" },
  context: {},
});
// @ts-expect-error Authored templates do not process runtime attacks.
character.command("attack");
character.command("rename", {
  initiator: "author",
  // @ts-expect-error Character names are strings.
  params: { name: 7 },
  context: {},
});
character.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Emitted event context is immutable.
  event.context.name = name;
});
