import { describe, expect, it } from "vitest";
import {
  applyCharacterSelections,
  characterDisplayName,
  selectionsComplete,
} from "./characterCreationModel";

describe("character creation model", () => {
  it("preserves unrelated draft data while updating the first step", () => {
    expect(
      applyCharacterSelections(
        {
          id: "draft-1",
          name: "Iris Vale",
          status: "draft",
          revision: 4,
          selections: { backgroundId: "old" },
        },
        {
          backgroundId: "background-1",
          professionId: "profession-1",
          heritageIds: ["heritage-1", "heritage-2"],
        },
      ),
    ).toMatchObject({
      name: "Iris Vale",
      revision: 4,
      selections: {
        backgroundId: "background-1",
        professionId: "profession-1",
        heritageIds: ["heritage-1", "heritage-2"],
      },
    });
  });

  it("requires each first-step selection and falls back to a readable name", () => {
    expect(
      selectionsComplete({
        backgroundId: "background-1",
        professionId: "profession-1",
        heritageIds: ["heritage-1"],
      }),
    ).toBe(true);
    expect(
      characterDisplayName({ id: "opaque", status: "draft", revision: 1 }),
    ).toBe("New character");
  });
});
