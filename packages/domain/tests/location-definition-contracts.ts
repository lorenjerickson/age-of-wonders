import { LocationDefinition } from "../src";

const location = LocationDefinition.deserializePayload({});
location.command("rename", {
  initiator: "gm",
  params: { name: "Valley" },
  context: {},
});
// @ts-expect-error No domain travel graph remains.
location.command("setAdjacentLocations");
location.command("rename", {
  initiator: "gm",
  // @ts-expect-error Location names must be strings.
  params: { name: 9 },
  context: {},
});
location.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
