import { Button, Input, Label, Select } from "@aow/ui";
import { ItemDefinition } from "@aow/domain";
import { ITEM_QUALITIES } from "@aow/common";

export type ItemStorageEdits = {
  slottedContainer?: unknown;
  beltSlotCategory?: unknown;
  rarity?: unknown;
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function ItemStorageFields({
  initial,
  edits,
  onChange,
}: {
  initial: Record<string, unknown>;
  edits: ItemStorageEdits;
  onChange: (value: ItemStorageEdits) => void;
}) {
  const value = (key: keyof ItemStorageEdits) =>
    Object.hasOwn(edits, key) ? edits[key] : initial[key];
  const storage = value("slottedContainer");
  const valid = storage == null || ItemDefinition.validStorage(storage);
  const data = object(storage);
  const rows = Array.isArray(data.capacityByQuality)
    ? (data.capacityByQuality as Record<string, unknown>[])
    : [];
  const set = (key: keyof ItemStorageEdits, next: unknown) =>
    onChange({ ...edits, [key]: next });
  const updateRows = (next: Record<string, unknown>[]) =>
    set("slottedContainer", { ...data, capacityByQuality: next });
  return (
    <section
      aria-label="Item storage"
      className="mt-4 space-y-4 rounded-box border border-base-300 p-4"
    >
      <h3 className="font-semibold">Storage and access</h3>
      <p>
        Belts provide immediate access. Retrieving and equipping an Item from a
        Pack costs a bonus action. Author capacities explicitly; omitted
        qualities have no capacity.
      </p>
      {(["rarity", "beltSlotCategory"] as const).map((key) => {
        const current = value(key);
        if (current != null && typeof current !== "string")
          return (
            <div key={key}>
              <p>
                Existing {key === "rarity" ? "rarity" : "Belt category"} is
                preserved.
              </p>
              <Button type="button" onClick={() => set(key, null)}>
                Replace {key === "rarity" ? "rarity" : "Belt category"}
              </Button>
            </div>
          );
        return (
          <Label key={key}>
            {key === "rarity" ? "Rarity" : "Belt storage category"}
            <Input
              value={typeof current === "string" ? current : ""}
              list={
                key === "beltSlotCategory"
                  ? "belt-storage-categories"
                  : undefined
              }
              onChange={(event) => set(key, event.target.value || null)}
            />
          </Label>
        );
      })}
      <datalist id="belt-storage-categories">
        {["consumable", "tool", "wallet", "purse", "small-gear"].map(
          (category) => (
            <option key={category} value={category} />
          ),
        )}
      </datalist>
      {!valid && !Object.hasOwn(edits, "slottedContainer") ? (
        <div>
          <p>
            Existing storage settings cannot be edited here. They are preserved
            until explicitly replaced.
          </p>
          <Button type="button" onClick={() => set("slottedContainer", null)}>
            Replace storage settings
          </Button>
        </div>
      ) : (
        <>
          <Label>
            Container type
            <Select
              value={String(data.kind ?? "")}
              onChange={(event) => {
                const kind = event.target.value;
                set(
                  "slottedContainer",
                  kind
                    ? {
                        ...data,
                        kind,
                        accepts:
                          kind === "belt"
                            ? "belt-compatible-items"
                            : "any-item",
                        capacityByQuality: rows,
                      }
                    : null,
                );
              }}
            >
              <option value="">Not a container</option>
              <option value="belt">Belt</option>
              <option value="pack">Pack</option>
              <option value="bag">Bag</option>
            </Select>
          </Label>
          {storage != null && (
            <>
              {rows.map((row, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-4">
                  <Label>
                    Quality
                    <Select
                      value={String(row.quality ?? "")}
                      onChange={(event) =>
                        updateRows(
                          rows.map((entry, i) =>
                            i === index
                              ? { ...entry, quality: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="">Choose quality</option>
                      {ITEM_QUALITIES.map((quality) => (
                        <option key={quality} value={quality}>
                          {quality}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Rarity override
                    <Input
                      value={String(row.rarity ?? "")}
                      placeholder="Any rarity"
                      onChange={(event) =>
                        updateRows(
                          rows.map((entry, i) => {
                            if (i !== index) return entry;
                            const rest = { ...entry };
                            delete rest.rarity;
                            return event.target.value
                              ? { ...rest, rarity: event.target.value }
                              : rest;
                          }),
                        )
                      }
                    />
                  </Label>
                  <Label>
                    Slots
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={typeof row.slots === "number" ? row.slots : ""}
                      onChange={(event) =>
                        updateRows(
                          rows.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  slots:
                                    event.target.value === ""
                                      ? undefined
                                      : Number(event.target.value),
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </Label>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() =>
                      updateRows(rows.filter((_, i) => i !== index))
                    }
                  >
                    Remove capacity
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                className="min-h-11"
                onClick={() => updateRows([...rows, {}])}
              >
                Add capacity
              </Button>
              {!valid && (
                <p role="alert">
                  Choose a quality and nonnegative whole slot count for every
                  row. Each quality and rarity combination must be unique.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
