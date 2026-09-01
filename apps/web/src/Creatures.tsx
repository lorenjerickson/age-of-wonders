import { EQUIPMENT_SLOTS, type EquipmentSlot } from "@aow/common";
import { FormEvent, useEffect, useState } from "react";
import {
  createArmorSetWithAi,
  createCreatureWithAi,
  createDomainRecord,
  deleteMedia,
  type DomainRecord,
  getDomainRecord,
  getMediaDownloadUrl,
  listDomainRecords,
  replaceDomainRecord,
  uploadMedia,
} from "./api";
import { ItemArtwork } from "./Items";

type CreationMode = "ai" | "manual";
type ImageRole = "portrait" | "overheadToken" | "paperDollToken";

const CREATURE_NATURES = [
  "organism",
  "engineered-organism",
  "machine",
  "composite",
  "collective",
  "field-phenomenon",
  "unknown",
] as const;

const IMAGE_FIELDS: Array<{
  role: ImageRole;
  label: string;
  help: string;
}> = [
  {
    role: "portrait",
    label: "Portrait",
    help: "A full-size, full-body player-facing illustration.",
  },
  {
    role: "overheadToken",
    label: "Overhead token",
    help: "A true top-down view for maps viewed from above.",
  },
  {
    role: "paperDollToken",
    label: "Paper-doll token",
    help: "A compact full-body side view for multi-level maps.",
  },
];

function objectAt(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function creatureClassificationLabel(data: Record<string, unknown>) {
  const classification = objectAt(data.classification);
  const nature =
    typeof classification.nature === "string"
      ? classification.nature
      : "unknown";
  const morphology =
    typeof classification.morphology === "string"
      ? classification.morphology
      : "";
  return morphology ? `${nature} · ${morphology}` : nature;
}

function setAt(data: Record<string, unknown>, path: string[], value: unknown) {
  const clone = structuredClone(data);
  let target = clone;
  for (const key of path.slice(0, -1)) {
    const child = objectAt(target[key]);
    target[key] = child;
    target = child;
  }
  target[path.at(-1) ?? ""] = value;
  return clone;
}

function fileDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

function CreaturePortrait({ creature }: { creature: DomainRecord }) {
  const portrait = objectAt(objectAt(creature.data.images).portrait);
  const assetId =
    typeof portrait.assetId === "string" ? portrait.assetId : undefined;
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!assetId) return;
    let active = true;
    void getMediaDownloadUrl(assetId).then(
      (result) => {
        if (active) setUrl(result.url);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [assetId]);

  if (!url) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-base-300 text-4xl text-base-content/25">
        ◈
      </div>
    );
  }
  return (
    <figure className="aspect-[4/3] bg-base-300">
      <img
        src={url}
        alt={
          typeof portrait.altText === "string"
            ? portrait.altText
            : `Portrait of ${creature.name ?? "creature"}`
        }
        className="h-full w-full object-cover object-top"
      />
    </figure>
  );
}

interface EquipmentSlotPlacement {
  label: string;
  left: string;
  top: string;
  opensUp?: boolean;
}

const EQUIPMENT_SLOT_LAYOUT: Record<EquipmentSlot, EquipmentSlotPlacement> = {
  head: { label: "Head", left: "50%", top: "6%" },
  neck: { label: "Neck", left: "50%", top: "17%" },
  shoulders: { label: "Shoulders", left: "34%", top: "27%" },
  chest: { label: "Chest", left: "50%", top: "32%" },
  arms: { label: "Arms", left: "29%", top: "39%" },
  hands: { label: "Hands", left: "18%", top: "50%" },
  waist: { label: "Waist", left: "50%", top: "51%" },
  legs: { label: "Legs", left: "50%", top: "70%", opensUp: true },
  feet: { label: "Feet", left: "50%", top: "91%", opensUp: true },
  back: { label: "Back", left: "89%", top: "18%" },
  "off-hand": { label: "Off hand", left: "10%", top: "39%" },
  "main-hand": { label: "Main hand", left: "90%", top: "39%" },
  "left-finger": {
    label: "Left finger",
    left: "10%",
    top: "60%",
    opensUp: true,
  },
  "right-finger": {
    label: "Right finger",
    left: "90%",
    top: "60%",
    opensUp: true,
  },
};

const BODY_EQUIPMENT_SLOTS = EQUIPMENT_SLOTS.map((slot) => ({
  slot,
  ...EQUIPMENT_SLOT_LAYOUT[slot],
}));

interface InventoryEquipmentOption {
  item: DomainRecord;
  definition: DomainRecord;
}

function definitionPresentation(definition: DomainRecord | undefined) {
  const identity = objectAt(definition?.data.identity);
  return {
    name: typeof identity.name === "string" ? identity.name : "Equipped item",
    description:
      typeof identity.description === "string" ? identity.description : "",
  };
}

function compatibleSlotSets(definition: DomainRecord, slot: string) {
  const components = objectAt(definition.data.components);
  const equippable = objectAt(components.equippable);
  const slotSets = Array.isArray(equippable.compatibleSlotSets)
    ? equippable.compatibleSlotSets
    : [];
  return slotSets.filter(
    (candidate): candidate is string[] =>
      Array.isArray(candidate) &&
      candidate.includes(slot) &&
      candidate.every((value) => typeof value === "string"),
  );
}

function isBeltCompatible(definition: DomainRecord) {
  const components = objectAt(definition.data.components);
  return (
    components.consumable === true ||
    Object.keys(objectAt(components.tool)).length > 0 ||
    typeof components.beltSlotCategory === "string"
  );
}

function containerKind(definition: DomainRecord | undefined) {
  const slottedContainer = objectAt(
    objectAt(definition?.data.components).slottedContainer,
  );
  return typeof slottedContainer.kind === "string"
    ? slottedContainer.kind
    : undefined;
}

function containerCapacity(
  container: InventoryEquipmentOption | undefined,
): number {
  if (!container) return 0;
  const slottedContainer = objectAt(
    objectAt(container.definition.data.components).slottedContainer,
  );
  const capacities = Array.isArray(slottedContainer.capacityByQuality)
    ? slottedContainer.capacityByQuality
    : [];
  const quality = container.item.data.quality;
  const matching = capacities.find(
    (entry) => objectAt(entry).quality === quality,
  );
  const slots = objectAt(matching).slots;
  return typeof slots === "number" && Number.isInteger(slots) && slots > 0
    ? slots
    : 0;
}

function EquipmentSlotPicker({
  label,
  equipped,
  compatible,
  loading,
  isOpen,
  opensUp = false,
  onToggle,
  onSelect,
}: {
  label: string;
  equipped?: InventoryEquipmentOption;
  compatible: InventoryEquipmentOption[];
  loading: boolean;
  isOpen: boolean;
  opensUp?: boolean;
  onToggle: () => void;
  onSelect: (selected?: InventoryEquipmentOption) => void;
}) {
  const presentation = definitionPresentation(equipped?.definition);

  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${label}: ${equipped ? presentation.name : "empty"}`}
        aria-expanded={isOpen}
        className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 bg-base-200 shadow-md transition hover:-translate-y-0.5 hover:border-primary hover:shadow-xl sm:h-20 sm:w-20 sm:rounded-2xl ${equipped ? "border-primary/35" : "border-dashed border-base-content/20"}`}
        onClick={onToggle}
      >
        {equipped ? (
          <ItemArtwork
            compact
            data={equipped.definition.data}
            name={presentation.name}
          />
        ) : (
          <span className="text-2xl text-base-content/25">＋</span>
        )}
      </button>

      {!isOpen && (
        <div className="pointer-events-none absolute bottom-[calc(100%+0.6rem)] left-1/2 z-30 w-64 -translate-x-1/2 rounded-box border border-base-300 bg-neutral p-3 text-neutral-content opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="text-xs font-semibold tracking-wide text-neutral-content/55 uppercase">
            {label}
          </div>
          <div className="mt-1 font-semibold">
            {equipped ? presentation.name : "Empty slot"}
          </div>
          {presentation.description ? (
            <p className="mt-1 line-clamp-3 text-sm leading-5 text-neutral-content/70">
              {presentation.description}
            </p>
          ) : (
            <p className="mt-1 text-sm leading-5 text-neutral-content/55">
              Select a compatible item from this creature’s inventory.
            </p>
          )}
        </div>
      )}

      {isOpen && (
        <div
          className={`absolute left-1/2 z-40 flex h-80 w-[min(20rem,calc(100vw-3rem))] -translate-x-1/2 flex-col overflow-hidden rounded-box border border-base-300 bg-base-200 shadow-2xl ${opensUp ? "bottom-[calc(100%+0.6rem)]" : "top-[calc(100%+0.6rem)]"}`}
        >
          <div className="border-b border-base-300 px-3 py-2 text-xs font-semibold tracking-wide text-base-content/55 uppercase">
            Choose {label.toLowerCase()} item
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {equipped && (
              <button
                type="button"
                className="btn btn-ghost h-auto min-h-12 w-full justify-start px-3 py-2 text-left text-sm"
                onClick={() => onSelect()}
              >
                Remove item
              </button>
            )}
            {compatible.map((option) => {
              const details = definitionPresentation(option.definition);
              const selected = option.item.id === equipped?.item.id;
              return (
                <button
                  key={option.item.id}
                  type="button"
                  className={`grid h-20 w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-box px-2 text-left transition hover:bg-base-300 ${selected ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                  onClick={() => onSelect(option)}
                >
                  <span className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
                    <ItemArtwork
                      compact
                      data={option.definition.data}
                      name={details.name}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {details.name}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-base-content/55">
                      {details.description || "No description available."}
                    </span>
                  </span>
                </button>
              );
            })}
            {!loading && !compatible.length && (
              <div className="px-3 py-6 text-center text-sm text-base-content/50">
                No compatible items in this creature’s inventory.
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-base-content/50">
                <span className="loading loading-spinner loading-sm" />
                Loading inventory…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentPaperDoll({
  draft,
  onChange,
}: {
  draft: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const inventory = objectAt(draft.inventory);
  const itemIds = Array.isArray(inventory.itemIds)
    ? inventory.itemIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const inventoryKey = itemIds.join("|");
  const [options, setOptions] = useState<InventoryEquipmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [openSlot, setOpenSlot] = useState<string>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all(
      itemIds.map(async (itemId) => {
        const item = await getDomainRecord("items", itemId);
        const definitionId = item.data.definitionId;
        if (typeof definitionId !== "string") return undefined;
        const definition = await getDomainRecord("definitions", definitionId);
        return definition.kind === "item" ? { item, definition } : undefined;
      }),
    )
      .then((loaded) => {
        if (!active) return;
        setOptions(
          loaded.filter(
            (value): value is InventoryEquipmentOption => value !== undefined,
          ),
        );
      })
      .catch(() => {
        if (active) setOptions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [inventoryKey]);

  const equipment = objectAt(draft.equipment);
  const equippedSlots = objectAt(equipment.slots);
  const containerStates = Array.isArray(equipment.containers)
    ? equipment.containers
    : [];
  const defenseRating = objectAt(draft.defenseRating);
  const contributions = Array.isArray(defenseRating.contributions)
    ? defenseRating.contributions
    : [];

  const displayedContainers = containerStates.flatMap(
    (candidate, containerIndex) => {
      const state = objectAt(candidate);
      const containerItemId = state.containerItemId;
      if (typeof containerItemId !== "string") return [];
      const container = options.find(
        (option) => option.item.id === containerItemId,
      );
      const kind = containerKind(container?.definition);
      const persistedSlots = Array.isArray(state.slots) ? state.slots : [];
      const slotsByIndex = new Map<number, Record<string, unknown>>();
      for (const persisted of persistedSlots) {
        const slotState = objectAt(persisted);
        const index = slotState.index;
        if (
          typeof index === "number" &&
          Number.isInteger(index) &&
          index >= 0
        ) {
          slotsByIndex.set(index, slotState);
        }
      }
      const slotCount = Math.max(
        containerCapacity(container),
        ...Array.from(slotsByIndex.keys(), (index) => index + 1),
        0,
      );
      const slots = Array.from({ length: slotCount }, (_, index) => ({
        index,
        itemId:
          typeof slotsByIndex.get(index)?.itemId === "string"
            ? (slotsByIndex.get(index)?.itemId as string)
            : undefined,
      }));
      return [
        {
          containerIndex,
          containerItemId,
          container,
          kind,
          slots,
        },
      ];
    },
  );
  const beltContainers = displayedContainers.filter(
    (container) => container.kind === "belt",
  );
  const packContainers = displayedContainers.filter(
    (container) => container.kind === "pack" || container.kind === "bag",
  );
  const otherContainers = displayedContainers.filter(
    (container) =>
      container.kind !== "belt" &&
      container.kind !== "pack" &&
      container.kind !== "bag",
  );

  function clearContainerItems(itemIdsToClear: Set<string>) {
    return containerStates.map((candidate) => {
      const state = objectAt(candidate);
      const slots = Array.isArray(state.slots) ? state.slots : [];
      return {
        ...state,
        slots: slots.map((candidateSlot) => {
          const slotState = objectAt(candidateSlot);
          return typeof slotState.itemId === "string" &&
            itemIdsToClear.has(slotState.itemId)
            ? { ...slotState, itemId: undefined }
            : slotState;
        }),
      };
    });
  }

  function equip(slot: EquipmentSlot, selected?: InventoryEquipmentOption) {
    const nextSlots: Record<string, unknown> = { ...equippedSlots };
    const removedItemIds = new Set<string>();
    const currentItemId = nextSlots[slot];
    if (typeof currentItemId === "string") removedItemIds.add(currentItemId);
    if (selected) removedItemIds.add(selected.item.id);

    for (const [candidateSlot, candidateItemId] of Object.entries(nextSlots)) {
      if (
        typeof candidateItemId === "string" &&
        removedItemIds.has(candidateItemId)
      ) {
        delete nextSlots[candidateSlot];
      }
    }

    let occupiedSlots: string[] = [];
    if (selected) {
      occupiedSlots = compatibleSlotSets(selected.definition, slot)[0] ?? [
        slot,
      ];
      for (const occupiedSlot of occupiedSlots) {
        const displacedItemId = nextSlots[occupiedSlot];
        if (typeof displacedItemId === "string") {
          removedItemIds.add(displacedItemId);
          for (const [candidateSlot, candidateItemId] of Object.entries(
            nextSlots,
          )) {
            if (candidateItemId === displacedItemId)
              delete nextSlots[candidateSlot];
          }
        }
      }
      for (const occupiedSlot of occupiedSlots) {
        nextSlots[occupiedSlot] = selected.item.id;
      }
    }

    const nextContributions = contributions.filter((candidate) => {
      const itemId = objectAt(candidate).itemId;
      return typeof itemId !== "string" || !removedItemIds.has(itemId);
    });
    if (selected) {
      const components = objectAt(selected.definition.data.components);
      const armor = objectAt(components.armor);
      const defenseDice = objectAt(armor.defenseDice);
      if (Array.isArray(defenseDice.terms) && defenseDice.terms.length) {
        nextContributions.push({
          itemId: selected.item.id,
          equipmentSlots: occupiedSlots,
          dice: defenseDice,
        });
      }
    }

    let nextContainers = clearContainerItems(removedItemIds).filter(
      (candidate) => {
        const containerItemId = objectAt(candidate).containerItemId;
        return (
          typeof containerItemId !== "string" ||
          !removedItemIds.has(containerItemId) ||
          containerItemId === selected?.item.id
        );
      },
    );
    if (selected && containerKind(selected.definition)) {
      const existingIndex = nextContainers.findIndex(
        (candidate) => objectAt(candidate).containerItemId === selected.item.id,
      );
      const existing =
        existingIndex >= 0 ? objectAt(nextContainers[existingIndex]) : {};
      const existingSlots = Array.isArray(existing.slots)
        ? existing.slots.map((candidate) => objectAt(candidate))
        : [];
      const capacity = containerCapacity(selected);
      const normalizedSlots = Array.from({ length: capacity }, (_, index) => {
        const persisted = existingSlots.find(
          (candidate) => candidate.index === index,
        );
        return persisted ?? { index };
      });
      const nextContainer = {
        ...existing,
        containerItemId: selected.item.id,
        slots: normalizedSlots,
      };
      if (existingIndex >= 0) nextContainers[existingIndex] = nextContainer;
      else nextContainers = [...nextContainers, nextContainer];
    }
    let next = setAt(draft, ["equipment", "slots"], nextSlots);
    next = setAt(next, ["equipment", "containers"], nextContainers);
    next = setAt(next, ["defenseRating", "contributions"], nextContributions);
    onChange(next);
    setOpenSlot(undefined);
  }

  function placeInContainer(
    containerIndex: number,
    slotIndex: number,
    selected?: InventoryEquipmentOption,
  ) {
    const targetContainer = objectAt(containerStates[containerIndex]);
    const targetSlots = Array.isArray(targetContainer.slots)
      ? targetContainer.slots
      : [];
    const currentItemId = objectAt(
      targetSlots.find((candidate) => objectAt(candidate).index === slotIndex),
    ).itemId;
    const movedItemIds = new Set<string>();
    if (typeof currentItemId === "string") movedItemIds.add(currentItemId);
    if (selected) movedItemIds.add(selected.item.id);

    const nextSlots: Record<string, unknown> = { ...equippedSlots };
    for (const [equipmentSlot, itemId] of Object.entries(nextSlots)) {
      if (typeof itemId === "string" && movedItemIds.has(itemId)) {
        delete nextSlots[equipmentSlot];
      }
    }

    const nextContainers = clearContainerItems(movedItemIds);
    const nextTarget = objectAt(nextContainers[containerIndex]);
    const normalizedTargetSlots = Array.isArray(nextTarget.slots)
      ? nextTarget.slots.map((candidate) => objectAt(candidate))
      : [];
    const existingIndex = normalizedTargetSlots.findIndex(
      (candidate) => candidate.index === slotIndex,
    );
    const replacement = {
      ...(existingIndex >= 0 ? normalizedTargetSlots[existingIndex] : {}),
      index: slotIndex,
      ...(selected ? { itemId: selected.item.id } : {}),
    };
    if (existingIndex >= 0) normalizedTargetSlots[existingIndex] = replacement;
    else normalizedTargetSlots.push(replacement);
    normalizedTargetSlots.sort(
      (left, right) => Number(left.index) - Number(right.index),
    );
    nextContainers[containerIndex] = {
      ...nextTarget,
      slots: normalizedTargetSlots,
    };

    const nextContributions = contributions.filter((candidate) => {
      const itemId = objectAt(candidate).itemId;
      return typeof itemId !== "string" || !movedItemIds.has(itemId);
    });
    let next = setAt(draft, ["equipment", "slots"], nextSlots);
    next = setAt(next, ["equipment", "containers"], nextContainers);
    next = setAt(next, ["defenseRating", "contributions"], nextContributions);
    onChange(next);
    setOpenSlot(undefined);
  }

  function renderContainerGroup(
    label: string,
    containers: typeof displayedContainers,
  ) {
    if (!containers.length) return null;
    return (
      <section>
        <h3 className="text-xs font-semibold tracking-[0.16em] text-base-content/45 uppercase">
          {label}
        </h3>
        <div className="mt-3 grid gap-4">
          {containers.map((container) => {
            const details = definitionPresentation(
              container.container?.definition,
            );
            return (
              <div
                key={`${container.containerIndex}:${container.containerItemId}`}
                className="rounded-box bg-base-100/50 p-3"
              >
                <div className="mb-3 text-sm font-medium">{details.name}</div>
                <div className="flex flex-wrap gap-3">
                  {container.slots.map((slot) => {
                    const equipped = slot.itemId
                      ? options.find((option) => option.item.id === slot.itemId)
                      : undefined;
                    const compatible = options.filter((option) => {
                      if (option.item.id === container.containerItemId)
                        return false;
                      return container.kind === "belt"
                        ? isBeltCompatible(option.definition)
                        : true;
                    });
                    const slotKey = `container:${container.containerIndex}:${slot.index}`;
                    return (
                      <EquipmentSlotPicker
                        key={slotKey}
                        label={`${label.replace(/ slots$/i, "")} slot ${slot.index + 1}`}
                        equipped={equipped}
                        compatible={compatible}
                        loading={loading}
                        isOpen={openSlot === slotKey}
                        opensUp
                        onToggle={() =>
                          setOpenSlot(
                            openSlot === slotKey ? undefined : slotKey,
                          )
                        }
                        onSelect={(selected) =>
                          placeInContainer(
                            container.containerIndex,
                            slot.index,
                            selected,
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative h-[46rem] w-full overflow-visible rounded-box border border-base-300 bg-base-100/60">
        <svg
          aria-hidden="true"
          viewBox="0 0 400 650"
          className="pointer-events-none absolute inset-0 h-full w-full text-base-content/[0.11]"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse
            cx="200"
            cy="616"
            rx="125"
            ry="13"
            strokeWidth="2"
            strokeDasharray="7 10"
            opacity="0.45"
          />
          <circle
            cx="200"
            cy="65"
            r="42"
            fill="currentColor"
            fillOpacity="0.2"
            strokeWidth="3"
          />
          <path
            d="M178 109c0 13-7 18-23 21l-31 6c-13 3-20 12-25 26l-27 74-33 93c-5 15 2 25 14 26 10 1 15-6 20-16l35-79 17-46 9 43-8 46c-3 17 6 35 8 60l-6 85-10 117-27 26c-9 9-4 17 9 17l39-5c10-1 15-6 15-16l3-102 32-103h20l32 103 3 102c0 10 5 15 15 16l39 5c13 0 18-8 9-17l-27-26-10-117-6-85c2-25 11-43 8-60l-8-46 9-43 17 46 35 79c5 10 10 17 20 16 12-1 19-11 14-26l-33-93-27-74c-5-14-12-23-25-26l-31-6c-16-3-23-8-23-21"
            fill="currentColor"
            fillOpacity="0.2"
            strokeWidth="3"
          />
        </svg>

        {BODY_EQUIPMENT_SLOTS.map(({ slot, label, left, top, opensUp }) => {
          const equippedItemId = equippedSlots[slot];
          const equipped =
            typeof equippedItemId === "string"
              ? options.find((option) => option.item.id === equippedItemId)
              : undefined;
          const compatible = options.filter(
            (option) => compatibleSlotSets(option.definition, slot).length > 0,
          );
          const slotKey = `body:${slot}`;
          return (
            <div
              key={slot}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left, top }}
            >
              <EquipmentSlotPicker
                label={label}
                equipped={equipped}
                compatible={compatible}
                loading={loading}
                isOpen={openSlot === slotKey}
                opensUp={opensUp}
                onToggle={() =>
                  setOpenSlot(openSlot === slotKey ? undefined : slotKey)
                }
                onSelect={(selected) => equip(slot, selected)}
              />
            </div>
          );
        })}
      </div>

      {(beltContainers.length > 0 ||
        packContainers.length > 0 ||
        otherContainers.length > 0) && (
        <div className="mt-5 rounded-box border border-base-300 bg-base-100/60 p-4">
          {renderContainerGroup("Belt slots", beltContainers)}
          {beltContainers.length > 0 && packContainers.length > 0 && (
            <div className="divider my-4" />
          )}
          {renderContainerGroup("Pack slots", packContainers)}
          {otherContainers.length > 0 &&
            (beltContainers.length > 0 || packContainers.length > 0) && (
              <div className="divider my-4" />
            )}
          {renderContainerGroup("Container slots", otherContainers)}
        </div>
      )}
    </div>
  );
}

async function loadWorldCreatures(worldId: string) {
  const creatures: DomainRecord[] = [];
  let offset = 0;
  let total = 0;
  do {
    const result = await listDomainRecords("creatures", {
      worldId,
      limit: 200,
      offset,
      sort: "updatedAt",
      order: "desc",
    });
    creatures.push(...result.items);
    total = result.total;
    if (result.items.length === 0) break;
    offset += result.items.length;
  } while (offset < total);
  return creatures;
}

export function CreatureListPage({ worldId }: { worldId: string }) {
  const [world, setWorld] = useState<DomainRecord>();
  const [creatures, setCreatures] = useState<DomainRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getDomainRecord("locations", worldId),
      loadWorldCreatures(worldId),
    ]).then(
      ([loadedWorld, loadedCreatures]) => {
        if (!active) return;
        setWorld(loadedWorld);
        setCreatures(loadedCreatures);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load creatures",
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [worldId]);

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="w-full px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-base-300 pb-8">
          <div>
            <a
              href={`/worlds/${encodeURIComponent(worldId)}`}
              className="text-sm text-primary"
            >
              {world?.name ?? "World"}
            </a>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">
              Creatures
            </h1>
            <p className="mt-3 text-base-content/55">
              Every creature created for this world.
            </p>
          </div>
          <a
            href={`/worlds/${encodeURIComponent(worldId)}/creatures/new`}
            className="btn btn-primary"
          >
            + Create creature
          </a>
        </div>

        {error && <div className="alert alert-error mt-8">{error}</div>}
        {loading ? (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(180px,200px))] justify-start gap-4">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="skeleton aspect-[4/5] w-full max-w-[200px]"
              />
            ))}
          </div>
        ) : creatures.length ? (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(180px,200px))] justify-start gap-4">
            {creatures.map((creature) => (
              <a
                key={creature.id}
                href={`/worlds/${encodeURIComponent(worldId)}/creatures/${encodeURIComponent(creature.id)}`}
                className="card w-full max-w-[200px] overflow-hidden border border-base-300 bg-base-200 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
              >
                <CreaturePortrait creature={creature} />
                <div className="card-body gap-2 p-3">
                  <div>
                    <h2 className="line-clamp-2 text-base leading-5 font-semibold">
                      {creature.name}
                    </h2>
                    <span className="badge badge-ghost badge-sm mt-2 max-w-full truncate">
                      {String(creature.data.size ?? "unknown")}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-5 text-base-content/55">
                    {creatureClassificationLabel(creature.data)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="card mt-8 border border-dashed border-base-300 bg-base-200/40">
            <div className="card-body items-center py-16 text-center">
              <span className="text-5xl text-primary/70" aria-hidden="true">
                ◈
              </span>
              <h2 className="mt-3 text-xl font-semibold">No creatures yet</h2>
              <p className="max-w-md text-base-content/55">
                Create one manually or let the AI design a creature grounded in
                this world.
              </p>
              <a
                href={`/worlds/${encodeURIComponent(worldId)}/creatures/new`}
                className="btn btn-primary mt-4"
              >
                Create your first creature
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CreatureImageEditor({
  role,
  image,
  name,
  uploading,
  onReplace,
  onAltText,
}: {
  role: ImageRole;
  image: Record<string, unknown>;
  name: string;
  uploading: boolean;
  onReplace: (file: File) => void;
  onAltText: (value: string) => void;
}) {
  const field = IMAGE_FIELDS.find((candidate) => candidate.role === role)!;
  const assetId = typeof image.assetId === "string" ? image.assetId : "";
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    setUrl("");
    if (!assetId) return;
    void getMediaDownloadUrl(assetId).then(
      (result) => {
        if (active) setUrl(result.url);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    <section className="card overflow-hidden border border-base-300 bg-base-200">
      <figure
        className={`relative bg-base-300 ${role === "portrait" ? "aspect-[3/4]" : "aspect-square"}`}
      >
        {url ? (
          <img
            src={url}
            alt={
              typeof image.altText === "string"
                ? image.altText
                : `${field.label} of ${name}`
            }
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-base-content/20">
            ◈
          </div>
        )}
        <label className="btn btn-neutral btn-sm absolute right-3 bottom-3 cursor-pointer shadow-lg">
          {uploading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "Replace"
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onReplace(file);
              event.target.value = "";
            }}
          />
        </label>
      </figure>
      <div className="card-body gap-3 p-4">
        <div>
          <h2 className="font-semibold">{field.label}</h2>
          <p className="mt-1 text-xs leading-5 text-base-content/50">
            {field.help}
          </p>
        </div>
        <label className="fieldset">
          <span className="fieldset-legend">Alternative text</span>
          <textarea
            className="textarea textarea-bordered min-h-20 w-full text-sm"
            value={typeof image.altText === "string" ? image.altText : ""}
            onChange={(event) => onAltText(event.target.value)}
          />
        </label>
        <p className="text-xs text-base-content/40">
          {typeof image.width === "number" && typeof image.height === "number"
            ? `${image.width} × ${image.height}`
            : "Dimensions unavailable"}
        </p>
      </div>
    </section>
  );
}

const ATTRIBUTE_FIELDS = [
  "might",
  "intellect",
  "will",
  "hardiness",
  "charisma",
  "agility",
  "fortune",
  "sanity",
] as const;

export function CreatureEditorPage({
  creatureId,
  worldId: routeWorldId,
}: {
  creatureId: string;
  worldId?: string;
}) {
  const [record, setRecord] = useState<DomainRecord>();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [generatingArmor, setGeneratingArmor] = useState(false);
  const [uploadingRole, setUploadingRole] = useState<ImageRole>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getDomainRecord("creatures", creatureId).then(
      (loaded) => {
        if (!active) return;
        const loadedWorldId = loaded.data.worldId;
        if (
          routeWorldId &&
          typeof loadedWorldId === "string" &&
          loadedWorldId !== routeWorldId
        ) {
          setError("This creature belongs to a different world.");
          return;
        }
        setRecord(loaded);
        setDraft(structuredClone(loaded.data));
      },
      (caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load creature",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [creatureId, routeWorldId]);

  function patch(path: string[], value: unknown) {
    setDraft((current) => setAt(current, path, value));
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await replaceDomainRecord(record, draft);
      setRecord(updated);
      setDraft(structuredClone(updated.data));
      setMessage("Creature saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save creature",
      );
    } finally {
      setSaving(false);
    }
  }

  async function generateArmorSet() {
    if (!record || !worldId) return;
    setGeneratingArmor(true);
    setError("");
    setMessage("");
    try {
      const result = await createArmorSetWithAi(worldId, record.id);
      setRecord(result.creature);
      setDraft(structuredClone(result.creature.data));
      setMessage(
        `Created and equipped ${result.definitions.length} armor pieces.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create armor set",
      );
    } finally {
      setGeneratingArmor(false);
    }
  }

  async function replaceImage(role: ImageRole, file: File) {
    if (!record) return;
    setUploadingRole(role);
    setError("");
    setMessage("");
    let newAssetId = "";
    try {
      const dimensions = await fileDimensions(file);
      const worldId =
        typeof draft.worldId === "string"
          ? draft.worldId
          : (routeWorldId ?? "");
      const asset = await uploadMedia(file, "creatures", [
        "creature-image",
        `world:${worldId}`,
        `role:${role}`,
      ]);
      newAssetId = asset.id;
      const images = objectAt(draft.images);
      const previous = objectAt(images[role]);
      const previousAssetId =
        typeof previous.assetId === "string" ? previous.assetId : "";
      const nextData = setAt(draft, ["images", role], {
        ...previous,
        assetId: asset.id,
        altText:
          typeof previous.altText === "string" && previous.altText.trim()
            ? previous.altText
            : `${IMAGE_FIELDS.find((field) => field.role === role)?.label ?? role} of ${String(draft.name ?? "creature")}`,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: asset.mimeType,
      });
      const updated = await replaceDomainRecord(record, nextData);
      setRecord(updated);
      setDraft(structuredClone(updated.data));
      setMessage(
        `${IMAGE_FIELDS.find((field) => field.role === role)?.label} replaced.`,
      );
      if (previousAssetId && previousAssetId !== asset.id) {
        await deleteMedia(previousAssetId).catch(() => undefined);
      }
    } catch (caught) {
      if (newAssetId) await deleteMedia(newAssetId).catch(() => undefined);
      setError(
        caught instanceof Error ? caught.message : "Could not replace image",
      );
    } finally {
      setUploadingRole(undefined);
    }
  }

  if (!record && !error) {
    return (
      <main className="min-h-screen bg-base-100 p-8">
        <div className="skeleton h-[70vh] w-full" />
      </main>
    );
  }

  const worldId =
    typeof draft.worldId === "string" ? draft.worldId : routeWorldId;
  const backHref = worldId
    ? `/worlds/${encodeURIComponent(worldId)}/creatures`
    : "/creatures";
  const images = objectAt(draft.images);
  const hitPoints = objectAt(draft.hitPoints);
  const standardAttributes = objectAt(objectAt(draft.attributes).standard);
  const profile = objectAt(objectAt(draft.extensions)["aow:creature-profile"]);
  const classification = objectAt(draft.classification);
  const defenseRating = objectAt(draft.defenseRating);
  const defenseContributions: unknown[] = Array.isArray(
    defenseRating.contributions,
  )
    ? defenseRating.contributions
    : [];

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <form
        onSubmit={(event) => void save(event)}
        className="grid w-full gap-8 px-6 py-8 lg:px-10"
      >
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-base-300 pb-7">
          <div>
            <a href={backHref} className="text-sm text-primary">
              ← Back to creatures
            </a>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Edit creature
            </h1>
            <p className="mt-2 text-sm text-base-content/45">
              Revision {record?.revision}
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={saving || Boolean(uploadingRole) || !record}
          >
            {saving && <span className="loading loading-spinner loading-sm" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </header>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <section className="card border border-base-300 bg-base-200">
          <div className="card-body grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="fieldset sm:col-span-2">
              <span className="fieldset-legend">Name</span>
              <input
                required
                className="input input-bordered w-full text-lg font-semibold"
                value={typeof draft.name === "string" ? draft.name : ""}
                onChange={(event) => patch(["name"], event.target.value)}
              />
            </label>
            <label className="fieldset">
              <span className="fieldset-legend">Size</span>
              <select
                className="select select-bordered w-full"
                value={typeof draft.size === "string" ? draft.size : "medium"}
                onChange={(event) => patch(["size"], event.target.value)}
              >
                {["tiny", "small", "medium", "large", "huge", "gargantuan"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label className="fieldset">
              <span className="fieldset-legend">Physical nature</span>
              <select
                className="select select-bordered w-full"
                value={
                  typeof classification.nature === "string"
                    ? classification.nature
                    : "unknown"
                }
                onChange={(event) =>
                  patch(["classification", "nature"], event.target.value)
                }
              >
                {CREATURE_NATURES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="fieldset">
              <span className="fieldset-legend">Morphology</span>
              <input
                className="input input-bordered w-full"
                value={
                  typeof classification.morphology === "string"
                    ? classification.morphology
                    : ""
                }
                onChange={(event) =>
                  patch(["classification", "morphology"], event.target.value)
                }
              />
            </label>
            <label className="fieldset sm:col-span-2 lg:col-span-4">
              <span className="fieldset-legend">Description</span>
              <textarea
                className="textarea textarea-bordered min-h-32 w-full text-base leading-7"
                value={
                  typeof profile.description === "string"
                    ? profile.description
                    : ""
                }
                onChange={(event) =>
                  patch(
                    ["extensions", "aow:creature-profile", "description"],
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Creature images</h2>
            <p className="mt-1 text-sm text-base-content/50">
              Preview or replace each required gameplay view.
            </p>
          </div>
          <div className="grid items-start gap-5 md:grid-cols-3">
            {IMAGE_FIELDS.map(({ role }) => (
              <CreatureImageEditor
                key={`${role}:${String(objectAt(images[role]).assetId ?? "")}`}
                role={role}
                image={objectAt(images[role])}
                name={String(draft.name ?? "creature")}
                uploading={uploadingRole === role}
                onReplace={(file) => void replaceImage(role, file)}
                onAltText={(value) => patch(["images", role, "altText"], value)}
              />
            ))}
          </div>
        </section>

        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Combat statistics</h2>
            <div className="mt-2 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Initiative", "initiativeBonus", draft.initiativeBonus],
                ["Proficiency", "proficiencyBonus", draft.proficiencyBonus],
                ["Current HP", "current", hitPoints.current],
                ["Maximum HP", "maximum", hitPoints.maximum],
              ].map(([label, key, value]) => (
                <label key={String(key)} className="fieldset">
                  <span className="fieldset-legend">{String(label)}</span>
                  <input
                    type="number"
                    min={key === "maximum" ? 1 : undefined}
                    className="input input-bordered w-full"
                    value={typeof value === "number" ? value : 0}
                    onChange={(event) =>
                      patch(
                        key === "current" || key === "maximum"
                          ? ["hitPoints", String(key)]
                          : [String(key)],
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="card-title">Defense rating</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-base-content/55">
                  Equipped armor contributes dice that are rolled again for
                  every incoming attack and opposed by the attacker’s d20 hit
                  roll.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={
                  generatingArmor ||
                  !record ||
                  !worldId ||
                  defenseContributions.length > 0
                }
                onClick={() => void generateArmorSet()}
              >
                {generatingArmor && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                {generatingArmor ? "Creating armor…" : "Create AI armor set"}
              </button>
            </div>
            <div className="mt-5">
              <EquipmentPaperDoll
                draft={draft}
                onChange={(next) => {
                  setDraft(next);
                  setMessage("");
                }}
              />
              <p className="mt-3 text-center text-xs text-base-content/45">
                Select a body, belt, or pack slot to choose compatible items
                from this creature’s inventory. Equipment changes are applied
                when you save the creature.
              </p>
            </div>
          </div>
        </section>

        <section className="card border border-base-300 bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Attributes</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Attribute</th>
                    <th>Score</th>
                    <th>Modifier</th>
                    <th>Save</th>
                    <th>Proficient</th>
                  </tr>
                </thead>
                <tbody>
                  {ATTRIBUTE_FIELDS.map((attribute) => {
                    const state = objectAt(standardAttributes[attribute]);
                    return (
                      <tr key={attribute}>
                        <th className="capitalize">{attribute}</th>
                        {(["score", "modifier", "savingThrow"] as const).map(
                          (field) => (
                            <td key={field}>
                              <input
                                aria-label={`${attribute} ${field}`}
                                type="number"
                                min={field === "score" ? 0 : undefined}
                                max={field === "score" ? 100 : undefined}
                                className="input input-bordered input-sm w-24"
                                value={
                                  typeof state[field] === "number"
                                    ? state[field]
                                    : 0
                                }
                                onChange={(event) =>
                                  patch(
                                    [
                                      "attributes",
                                      "standard",
                                      attribute,
                                      field,
                                    ],
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </td>
                          ),
                        )}
                        <td>
                          <input
                            aria-label={`${attribute} save proficiency`}
                            type="checkbox"
                            className="checkbox checkbox-primary"
                            checked={state.proficientInSave === true}
                            onChange={(event) =>
                              patch(
                                [
                                  "attributes",
                                  "standard",
                                  attribute,
                                  "proficientInSave",
                                ],
                                event.target.checked,
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </form>
    </main>
  );
}

function defaultAttribute(score = 10) {
  return {
    score,
    modifier: 0,
    savingThrow: 0,
    proficientInSave: false,
  };
}

export function CreatureCreatePage({ worldId }: { worldId: string }) {
  const [world, setWorld] = useState<DomainRecord>();
  const [mode, setMode] = useState<CreationMode>("ai");
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState("medium");
  const [creatureNature, setCreatureNature] = useState("organism");
  const [morphology, setMorphology] = useState("animal");
  const [description, setDescription] = useState("");
  const [hitPoints, setHitPoints] = useState(1);
  const [files, setFiles] = useState<Partial<Record<ImageRole, File>>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getDomainRecord("locations", worldId).then(
      setWorld,
      (caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load world",
        ),
    );
  }, [worldId]);

  async function createWithAi(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const result = await createCreatureWithAi(worldId, prompt.trim());
      window.location.assign(
        `/worlds/${encodeURIComponent(worldId)}/creatures/${encodeURIComponent(result.creature.id)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create creature",
      );
      setWorking(false);
    }
  }

  async function createManually(event: FormEvent) {
    event.preventDefault();
    const selected = IMAGE_FIELDS.map(({ role }) => files[role]);
    if (selected.some((file) => !file)) {
      setError("Choose all three required creature images.");
      return;
    }
    setWorking(true);
    setError("");
    const uploadedIds: string[] = [];
    try {
      const imageEntries: Array<
        readonly [
          ImageRole,
          {
            assetId: string;
            altText: string;
            width: number;
            height: number;
            mimeType: string;
          },
        ]
      > = [];
      for (const [index, { role, label }] of IMAGE_FIELDS.entries()) {
        const file = selected[index] as File;
        const dimensions = await fileDimensions(file);
        const asset = await uploadMedia(file, "creatures", [
          "creature-image",
          `world:${worldId}`,
          `role:${role}`,
        ]);
        uploadedIds.push(asset.id);
        imageEntries.push([
          role,
          {
            assetId: asset.id,
            altText: `${label} of ${name.trim()}`,
            width: dimensions.width,
            height: dimensions.height,
            mimeType: asset.mimeType,
          },
        ]);
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const creature = await createDomainRecord("creatures", {
        identity: { id, version: { revision: 1, updatedAt: now } },
        entityId: crypto.randomUUID(),
        worldId,
        name: name.trim(),
        images: Object.fromEntries(imageEntries),
        controllerIds: [],
        size,
        classification: {
          nature: creatureNature,
          ...(morphology.trim() ? { morphology: morphology.trim() } : {}),
          aliases: [],
        },
        attributes: {
          standard: {
            might: defaultAttribute(),
            intellect: defaultAttribute(),
            will: defaultAttribute(),
            hardiness: defaultAttribute(),
            charisma: defaultAttribute(),
            agility: defaultAttribute(),
            fortune: defaultAttribute(),
            sanity: defaultAttribute(50),
          },
        },
        skills: [],
        proficiencies: [],
        proficiencyBonus: 0,
        defenseRating: { contributions: [] },
        initiativeBonus: 0,
        hitPoints: { current: hitPoints, maximum: hitPoints, temporary: 0 },
        speeds: [{ mode: "walk", distance: { value: 30, unit: "foot" } }],
        senses: [{ sense: "normal" }],
        languages: [],
        communicationCapabilities: [],
        inventory: { itemIds: [], currencies: [], attunementLimit: 0 },
        equipment: { slots: {}, containers: [] },
        actions: [],
        activeEffects: [],
        conditions: [],
        resources: {},
        damageAdjustments: [],
        disposition: "unknown",
        extensions: {
          "aow:creature-profile": { description: description.trim() },
        },
      });
      window.location.assign(
        `/worlds/${encodeURIComponent(worldId)}/creatures/${encodeURIComponent(creature.id)}`,
      );
    } catch (caught) {
      await Promise.all(
        uploadedIds.map((id) => deleteMedia(id).catch(() => undefined)),
      );
      setError(
        caught instanceof Error ? caught.message : "Could not create creature",
      );
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="w-full px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-base-300 pb-8">
          <div>
            <a
              href={`/worlds/${encodeURIComponent(worldId)}/creatures`}
              className="text-sm text-primary"
            >
              ← {world?.name ?? "Creatures"}
            </a>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Create creature
            </h1>
            <p className="mt-3 max-w-2xl text-base-content/55">
              Start from the essentials or let AI use the complete world record
              to design the creature and its three images.
            </p>
          </div>
        </header>

        <div role="tablist" className="tabs tabs-box mt-8 w-fit">
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "ai" ? "tab-active" : ""}`}
            onClick={() => setMode("ai")}
          >
            Create with AI
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "manual" ? "tab-active" : ""}`}
            onClick={() => setMode("manual")}
          >
            Create manually
          </button>
        </div>

        {error && <div className="alert alert-error mt-6">{error}</div>}

        {mode === "ai" ? (
          <form
            onSubmit={(event) => void createWithAi(event)}
            className="card mt-6 border border-primary/20 bg-primary/[0.06] shadow-xl"
          >
            <div className="card-body gap-5">
              <div>
                <h2 className="card-title">Describe the creature</h2>
                <p className="mt-2 text-sm leading-6 text-base-content/60">
                  Your direction is combined with the current world and the
                  project’s creature prompt. AI generation also creates the
                  portrait, overhead token, and paper-doll token.
                </p>
              </div>
              <textarea
                autoFocus
                required
                minLength={3}
                className="textarea textarea-bordered min-h-56 w-full text-base leading-7"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A glass-scaled ambush predator that nests in the moonlit reefs. Its antlers split light into false silhouettes, but crack audibly before it attacks…"
              />
              <div className="card-actions items-center justify-between">
                <span className="text-xs text-base-content/50">
                  Uses create-creature.md + full world context
                </span>
                <button
                  className="btn btn-primary"
                  disabled={working || prompt.trim().length < 3}
                >
                  {working && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  Generate creature and images
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => void createManually(event)}
            className="card mt-6 border border-base-300 bg-base-200 shadow-xl"
          >
            <div className="card-body gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <fieldset className="fieldset sm:col-span-2">
                  <legend className="fieldset-legend">Name</legend>
                  <input
                    required
                    className="input input-bordered w-full"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Size</legend>
                  <select
                    className="select select-bordered w-full"
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                  >
                    {[
                      "tiny",
                      "small",
                      "medium",
                      "large",
                      "huge",
                      "gargantuan",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Physical nature</legend>
                  <select
                    className="select select-bordered w-full"
                    value={creatureNature}
                    onChange={(event) => setCreatureNature(event.target.value)}
                  >
                    {CREATURE_NATURES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Morphology</legend>
                  <input
                    className="input input-bordered w-full"
                    value={morphology}
                    onChange={(event) => setMorphology(event.target.value)}
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Hit points</legend>
                  <input
                    required
                    min={1}
                    type="number"
                    className="input input-bordered w-full"
                    value={hitPoints}
                    onChange={(event) =>
                      setHitPoints(Number(event.target.value))
                    }
                  />
                </fieldset>
                <fieldset className="fieldset sm:col-span-2">
                  <legend className="fieldset-legend">Description</legend>
                  <textarea
                    className="textarea textarea-bordered min-h-28 w-full"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </fieldset>
              </div>

              <div className="divider">Required images</div>
              <div className="grid gap-4 sm:grid-cols-3">
                {IMAGE_FIELDS.map((field) => (
                  <label
                    key={field.role}
                    className="card cursor-pointer border border-base-300 bg-base-100 p-4"
                  >
                    <span className="font-semibold">{field.label}</span>
                    <span className="mt-1 min-h-10 text-xs leading-5 text-base-content/55">
                      {field.help}
                    </span>
                    <input
                      required
                      type="file"
                      accept="image/*"
                      className="file-input file-input-bordered file-input-sm mt-4 w-full"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        setFiles((current) => ({
                          ...current,
                          [field.role]: file,
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="card-actions justify-end pt-3">
                <button
                  className="btn btn-primary"
                  disabled={
                    working || !name.trim() || !world || world.kind !== "world"
                  }
                >
                  {working && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  Create creature
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
