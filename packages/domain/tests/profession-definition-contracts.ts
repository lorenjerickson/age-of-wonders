import { ProfessionDefinition } from "../src";
const profession = ProfessionDefinition.deserializePayload({
  kind: "profession",
});
const kind: "profession" = profession.state.data.kind;
void kind;
profession.command("rename", {
  initiator: "author",
  params: { name: "Pilot" },
  context: {},
});
// @ts-expect-error Profession authoring has no runtime use command.
profession.command("use");
profession.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
profession.state.data.kind = "profession";
