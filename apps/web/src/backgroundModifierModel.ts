import { BackgroundDefinition } from "@aow/domain";
import type { JsonValue } from "./api";

/** Editor feedback checks grants only; publication resolves Model and World context. */
export function backgroundModifiersValid(
  grants: readonly Record<string, JsonValue>[],
): boolean {
  const background = BackgroundDefinition.deserializePayload({
    kind: "background",
    components: { modifierGrants: grants },
  });
  try {
    return !background.state.metadata.validity.issues.some(
      (issue) => issue.code === "background-canonical-components",
    );
  } finally {
    background.dispose();
  }
}
