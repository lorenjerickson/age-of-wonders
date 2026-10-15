import { SkillDefinition } from "../src";
const skill = SkillDefinition.deserializePayload({ kind: "skill" });
const kind: "skill" = skill.state.data.kind;
void kind;
skill.command("rename", {
  initiator: "author",
  params: { name: "Pilot" },
  context: {},
});
// @ts-expect-error Skill authoring has no runtime use command.
skill.command("use");
skill.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
skill.state.data.kind = "skill";
