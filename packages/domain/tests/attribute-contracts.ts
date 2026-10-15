import { Attribute } from "../src/attribute";
import type { ModelElementRevision } from "@aow/common";
declare const attribute: Attribute;
declare const revision: ModelElementRevision;
attribute.command("selectRevision", {
  initiator: "gm",
  params: { revision },
  context: {},
});
// @ts-expect-error Attribute does not expose gameplay mutation commands.
attribute.command("increase");
attribute.command("selectRevision", {
  initiator: "gm",
  // @ts-expect-error Revision selection requires a complete common Model revision.
  params: { revision: { label: "Might" } },
  context: {},
});
// @ts-expect-error Entity state is read only.
attribute.state.data.revision.presentation.label = "Might";
