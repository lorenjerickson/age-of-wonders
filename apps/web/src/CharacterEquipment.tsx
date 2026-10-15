import { CharacterCreation } from "@aow/domain";
import { useState } from "react";
import { Button, Input, Label } from "@aow/ui";
import { MediaImage } from "./MediaImage";
import type { CharacterOption } from "./characterCreationModel";

export function CharacterEquipment({
  items,
  slots,
  selected,
  assignments,
  imageAssetId,
  disabled,
  onChange,
}: {
  items: readonly CharacterOption[];
  slots: readonly { id: string; name: string }[];
  selected: string[];
  assignments: Record<string, string[]>;
  imageAssetId?: string;
  disabled: boolean;
  onChange: (selected: string[], assignments: Record<string, string[]>) => void;
}) {
  const [activeSlot, setActiveSlot] = useState<string>();
  const [search, setSearch] = useState("");
  const occupied = (slot: string) =>
    Object.entries(assignments).find(([, values]) =>
      values.includes(slot),
    )?.[0];
  const anatomy = [
    "head",
    "neck",
    "shoulders",
    "chest",
    "arms",
    "hands",
    "main hand",
    "off hand",
    "waist",
    "belt",
    "legs",
    "feet",
    "back",
    "pack",
    "left finger",
    "right finger",
  ];
  const orderedSlots = [...slots].sort((a, b) => {
    const position = (name: string) => {
      const index = anatomy.indexOf(name.toLowerCase());
      return index < 0 ? 100 : index;
    };
    return position(a.name) - position(b.name) || a.name.localeCompare(b.name);
  });
  const choices = items.filter(
    (item) =>
      (!activeSlot ||
        item.compatibleSlotSets?.some((set) => set.includes(activeSlot))) &&
      `${item.name} ${item.description ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const fits = (set: readonly string[], itemId: string) => {
    const item = items.find((item) => item.id === itemId);
    return (
      !!item &&
      CharacterCreation.fittingSlotSets(item, assignments, slots).some(
        (candidate) =>
          candidate.length === set.length &&
          candidate.every((slot) => set.includes(slot)),
      )
    );
  };
  function equip(item: CharacterOption, set: readonly string[]) {
    if (!fits(set, item.id)) return;
    onChange([...new Set([...selected, item.id])], {
      ...assignments,
      [item.id]: [...set],
    });
  }
  return (
    <section
      className="rounded-box border-2 border-base-300 bg-base-100 p-5"
      aria-label="Equipment paper doll"
    >
      <h2 className="font-serif text-2xl font-semibold">Equipment</h2>
      <p className="mt-1 text-sm text-base-content/65">
        Choose a slot on the paper doll, then equip a compatible Item. Carried
        Items remain in your inventory.
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)]">
        <div>
          <div className="relative min-h-[560px] rounded-box border border-base-300 bg-base-200/50">
            {imageAssetId ? (
              <MediaImage
                image={{
                  assetId: imageAssetId,
                  altText: "Character equipment figure",
                }}
                name="Equipment figure"
                className="absolute inset-0 h-full w-full object-contain opacity-60"
              />
            ) : (
              <svg
                viewBox="0 0 300 440"
                className="absolute inset-0 h-full w-full text-base-content/15"
                aria-hidden="true"
              >
                <circle cx="150" cy="58" r="28" fill="currentColor" />
                <path
                  d="M119 94 Q150 80 181 94 L199 190 L178 198 L169 135 L170 242 L191 390 L162 397 L150 280 L138 397 L109 390 L130 242 L131 135 L122 198 L101 190 Z"
                  fill="currentColor"
                />
              </svg>
            )}
            <div className="relative grid min-h-[560px] grid-cols-2 content-between gap-x-16 gap-y-3 p-3">
              {orderedSlots.map((slot) => {
                const item = items.find(
                  (item) => item.id === occupied(slot.id),
                );
                return (
                  <Button
                    key={slot.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={activeSlot === slot.id}
                    onClick={() =>
                      setActiveSlot(
                        activeSlot === slot.id ? undefined : slot.id,
                      )
                    }
                    className={`block h-auto min-h-11 whitespace-normal rounded-lg border p-2 text-left shadow-sm ${activeSlot === slot.id ? "border-primary bg-primary text-primary-content" : "border-base-300 bg-base-100/95"}`}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wide">
                      {slot.name}
                    </span>
                    <span className="mt-1 block text-sm">
                      {item?.name ?? "Empty"}
                    </span>
                  </Button>
                );
              })}
              {!slots.length && (
                <p className="col-span-2 rounded bg-base-100 p-3 text-sm">
                  This capture has no equipment slots. Items can still be
                  carried.
                </p>
              )}
            </div>
          </div>
          <h3 className="mt-4 font-semibold">Pack & equipped Items</h3>
          {!selected.length && (
            <p className="mt-2 text-sm text-base-content/60">
              No Items selected.
            </p>
          )}
          <ul className="mt-2 divide-y divide-base-300">
            {selected.map((id) => {
              const item = items.find((item) => item.id === id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {item?.name ?? "Unavailable Item"}
                    </p>
                    <p className="text-xs text-base-content/60">
                      {assignments[id]
                        ?.map(
                          (s) =>
                            slots.find((slot) => slot.id === s)?.name ??
                            "Unavailable slot",
                        )
                        .join(" + ") || "Carried"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {assignments[id] && (
                      <Button
                        type="button"
                        size="sm"
                        tone="ghost"
                        disabled={disabled}
                        onClick={() => {
                          const next = { ...assignments };
                          delete next[id];
                          onChange(selected, next);
                        }}
                      >
                        Unequip
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      tone="ghost"
                      disabled={disabled}
                      onClick={() => {
                        const next = { ...assignments };
                        delete next[id];
                        onChange(
                          selected.filter((value) => value !== id),
                          next,
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <Label className="block text-sm font-medium">
            Find equipment
            <Input
              className="input mt-2 w-full"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Items"
            />
          </Label>
          {activeSlot && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm">
                For {slots.find((slot) => slot.id === activeSlot)?.name}
              </span>
              <Button
                type="button"
                size="sm"
                tone="ghost"
                onClick={() => setActiveSlot(undefined)}
              >
                Show all Items
              </Button>
            </div>
          )}
          <ul className="mt-3 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {choices.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-base-300 p-3"
              >
                <div className="flex gap-3">
                  {item.imageAssetId && (
                    <MediaImage
                      image={{ assetId: item.imageAssetId, altText: item.name }}
                      name={item.name}
                      className="h-16 w-16 shrink-0 rounded object-contain"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="mt-1 text-xs text-base-content/65">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    tone="outline"
                    disabled={disabled || selected.includes(item.id)}
                    onClick={() =>
                      onChange([...selected, item.id], assignments)
                    }
                  >
                    {selected.includes(item.id)
                      ? "In inventory"
                      : "Add to pack"}
                  </Button>
                  {item.compatibleSlotSets
                    ?.filter((set) => !activeSlot || set.includes(activeSlot))
                    .map((set) => (
                      <Button
                        key={set.join("|")}
                        type="button"
                        size="sm"
                        tone="primary"
                        disabled={disabled || !fits(set, item.id)}
                        onClick={() => equip(item, set)}
                      >
                        Equip ·{" "}
                        {set
                          .map(
                            (id) =>
                              slots.find((s) => s.id === id)?.name ??
                              "Unavailable slot",
                          )
                          .join(" + ")}
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
          {!choices.length && (
            <p className="mt-4 text-sm">No compatible Items match.</p>
          )}
        </div>
      </div>
    </section>
  );
}
