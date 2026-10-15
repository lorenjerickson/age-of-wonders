import { describe, expect, it } from "vitest";
import { visibleRecordDescription, visibleRecordName } from "./recordDisplay";
import { recordDescription, recordName } from "./worldAuthoringModel";
describe("display-only record labels", () => {
  it("masks own/known identifiers without changing raw editor projections", () => {
    const record = {
      resourceType: "definitions",
      sourceId: "item-secret",
      payload: {
        identity: {
          id: "item-secret",
          name: "item-secret",
          description: "Reference: other-secret",
        },
      },
    };
    expect(visibleRecordName(record, "Item")).toBe("Item");
    expect(
      visibleRecordDescription(record, new Set(["other-secret"])),
    ).toBeUndefined();
    expect(recordName(record, "Item")).toBe("item-secret");
    expect(recordDescription(record)).toBe("Reference: other-secret");
  });
  it("retains friendly labels and masks imported UUID prose", () => {
    const record = {
      resourceType: "locations",
      sourceId: "place",
      payload: {
        name: "Lantern Wharf",
        description: "See 550e8400-e29b-41d4-a716-446655440000",
      },
    };
    expect(visibleRecordName(record, "Location")).toBe("Lantern Wharf");
    expect(visibleRecordDescription(record)).toBeUndefined();
  });
});
