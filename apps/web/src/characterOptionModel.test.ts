import { describe, expect, it } from "vitest";
import { characterOptionDefinition } from "./characterOptionModel";

describe("characterOptionDefinition", () => {
  it.each(["background", "profession", "heritage"] as const)(
    "builds a world-scoped %s definition",
    (kind) => {
      const definition = characterOptionDefinition({
        kind,
        id: `definition:${kind}`,
        key: `aow:${kind}`,
        worldId: "world-1",
        name: "Example",
        description: "A player-facing option.",
        heritageBenefit: "A useful edge.",
        heritageDrawback: "A meaningful cost.",
      });

      expect(definition).toMatchObject({
        kind,
        identity: { name: "Example" },
        extensions: { "aow:worldId": "world-1" },
      });
      if (kind === "profession") {
        expect(definition.components).toMatchObject({
          expertiseOrder: ["unskilled"],
        });
      }
      if (kind === "heritage") {
        expect(definition.components).toMatchObject({
          modifierPairs: [
            {
              beneficial: [{ payload: "A useful edge." }],
              harmful: [{ payload: "A meaningful cost." }],
            },
          ],
        });
      }
    },
  );
});
