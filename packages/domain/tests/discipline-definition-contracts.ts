import { DisciplineDefinition } from "../src";
const discipline = DisciplineDefinition.deserializePayload({
  kind: "discipline",
});
const kind: "discipline" = discipline.state.data.kind;
void kind;
discipline.command("rename", {
  initiator: "author",
  params: { name: "Pilot" },
  context: {},
});
// @ts-expect-error Discipline authoring has no runtime use command.
discipline.command("use");
discipline.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
discipline.state.data.kind = "discipline";
