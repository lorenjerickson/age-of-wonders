import { Discovery } from "../src/discovery";
declare const discovery: Discovery;
discovery.command("rename", {
  initiator: "gm",
  params: { name: "Clue" },
  context: {},
});
// @ts-expect-error Discovery owns authoring, not runtime knowledge progression.
discovery.command("reveal");
// @ts-expect-error Exposed entity state is immutable.
discovery.state.data.name = "Rewritten";
// @ts-expect-error Unknown Discovery events are rejected.
discovery.events.revealed.listen(() => {});
// @ts-expect-error Validation policy is private; metadata is exposed only in entity state.
Discovery.isPayload({});
