import { RouterButtonLink } from "./navigation";
import { useEffect, useState } from "react";
import { Button, Input, Label, Select } from "@aow/ui";
import {
  getActorEquipment,
  updateActorEquipment,
  type ActorEquipmentProjection,
  type ActorEquipmentRequest,
} from "./api";

export function ActorEquipmentPanel({
  campaignId,
  instanceId,
  actorId,
  selectedItemId,
  itemDetailLinks = false,
}: {
  campaignId: string;
  instanceId: string;
  actorId: string;
  selectedItemId?: string;
  itemDetailLinks?: boolean;
}) {
  const [open, setOpen] = useState(!!selectedItemId);
  const [data, setData] = useState<ActorEquipmentProjection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [definition, setDefinition] = useState("");
  const [allowance, setAllowance] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(await getActorEquipment(campaignId, instanceId, actorId));
    } catch {
      setError("Equipment could not be loaded. Try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (selectedItemId) void load();
  }, [selectedItemId, actorId]);
  async function mutate(
    command: Omit<ActorEquipmentRequest, "expectedRuntimeRevision">,
  ) {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      setData(
        await updateActorEquipment(campaignId, instanceId, actorId, {
          ...command,
          expectedRuntimeRevision: data.runtimeRevision,
        }),
      );
    } catch {
      setError(
        "This equipment change could not be saved. Check available slots and bonus actions, or refresh if the Instance changed. Your selections are retained.",
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || data?.readOnly;
  const slotsLabel = (slots: string[]) =>
    slots
      .map(
        (id) =>
          data?.slots.find((slot) => slot.id === id)?.name ?? "Equipment slot",
      )
      .join(" + ");
  return (
    <section className="mt-4">
      <Button
        type="button"
        className="min-h-11"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open && !data) void load();
        }}
      >
        Equipment
      </Button>
      {open && (
        <div className="mt-3 space-y-4">
          <Button
            type="button"
            className="min-h-11"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh equipment
          </Button>
          {busy && <p role="status">Updating equipment…</p>}
          {error && <p role="alert">{error}</p>}
          {data && (
            <>
              <p>
                Available bonus actions: {data.bonusActions ?? "Not set"}. Pack
                retrieval requires one; an equipped Belt provides immediate
                access.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <Label>
                  Available bonus actions
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={allowance}
                    onChange={(e) => setAllowance(e.target.value)}
                  />
                </Label>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={
                    disabled ||
                    allowance === "" ||
                    !Number.isSafeInteger(Number(allowance)) ||
                    Number(allowance) < 0
                  }
                  onClick={() =>
                    void mutate({
                      action: "allowance",
                      bonusActions: Number(allowance),
                    })
                  }
                >
                  Set bonus actions
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Label>
                  Add carried Item
                  <Select
                    value={definition}
                    onChange={(e) => setDefinition(e.target.value)}
                  >
                    <option value="">Choose captured Item</option>
                    {data.definitions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={disabled || !definition}
                  onClick={() =>
                    void mutate({
                      action: "create",
                      definitionId: definition,
                      quantity: 1,
                    })
                  }
                >
                  Add Item
                </Button>
              </div>
              {!data.items.length && <p>No carried Items yet.</p>}
              {itemDetailLinks && !selectedItemId && (
                <ul className="space-y-2">
                  {data.items.map((item) => (
                    <li key={item.id}>
                      <RouterButtonLink
                        className="min-h-11"
                        href={`/campaigns/instances/${encodeURIComponent(instanceId)}/actors/${encodeURIComponent(actorId)}/items/${encodeURIComponent(item.id)}`}
                      >
                        {item.name}
                      </RouterButtonLink>{" "}
                      · {item.locationLabel}
                    </li>
                  ))}
                </ul>
              )}
              {selectedItemId &&
                !data.items.some((item) => item.id === selectedItemId) && (
                  <p>The selected Item is unavailable.</p>
                )}
              {data.items
                .filter((item) =>
                  selectedItemId
                    ? item.id === selectedItemId
                    : !itemDetailLinks,
                )
                .map((item) => (
                  <article
                    key={item.id}
                    className="min-w-0 space-y-3 rounded-box border border-base-300 p-3"
                  >
                    <h4 className="font-semibold">{item.name}</h4>
                    <p>
                      {item.locationLabel} · Quantity {item.quantity}
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <Label>
                        Item quantity
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={quantities[item.id] ?? String(item.quantity)}
                          onChange={(event) =>
                            setQuantities({
                              ...quantities,
                              [item.id]: event.target.value,
                            })
                          }
                        />
                      </Label>
                      <Button
                        type="button"
                        className="min-h-11"
                        disabled={
                          disabled ||
                          !Number.isSafeInteger(
                            Number(quantities[item.id] ?? item.quantity),
                          ) ||
                          Number(quantities[item.id] ?? item.quantity) < 1
                        }
                        onClick={() =>
                          void mutate({
                            action: "quantity",
                            itemId: item.id,
                            quantity: Number(
                              quantities[item.id] ?? item.quantity,
                            ),
                          })
                        }
                      >
                        Save quantity
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.compatibleSlotSets.map((slots, i) => (
                        <Button
                          key={i}
                          type="button"
                          className="min-h-11"
                          disabled={disabled}
                          onClick={() =>
                            void mutate({
                              action: "equip",
                              itemId: item.id,
                              slots,
                            })
                          }
                        >
                          Equip: {slotsLabel(slots)}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        className="min-h-11"
                        disabled={disabled}
                        onClick={() =>
                          void mutate({ action: "unequip", itemId: item.id })
                        }
                      >
                        Unequip
                      </Button>
                    </div>
                    <Label>
                      Store in an empty container slot
                      <Select
                        disabled={disabled}
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const [containerId, index] = JSON.parse(
                            e.target.value,
                          ) as [string, number];
                          void mutate({
                            action: "stow",
                            itemId: item.id,
                            containerId,
                            index,
                          });
                        }}
                      >
                        <option value="">Choose container and slot</option>
                        {data.items
                          .filter((container) => container.id !== item.id)
                          .flatMap(
                            (container) =>
                              container.container?.slots
                                .filter((slot) => !slot.itemId)
                                .map((slot) => (
                                  <option
                                    key={`${container.id}-${slot.index}`}
                                    value={JSON.stringify([
                                      container.id,
                                      slot.index,
                                    ])}
                                  >
                                    {container.name} · Slot {slot.index + 1}
                                  </option>
                                )) ?? [],
                          )}
                      </Select>
                    </Label>
                    {item.container && (
                      <div>
                        <p>
                          {item.container.kind} ·{" "}
                          {item.container.capacity ?? "No authored"} slots
                        </p>
                        {item.container.slots.map((slot) => (
                          <div
                            key={slot.index}
                            className="mt-2 flex flex-wrap items-center gap-2"
                          >
                            <span>
                              Slot {slot.index + 1}: {slot.itemName ?? "Empty"}
                            </span>
                            {slot.itemId && (
                              <>
                                <Button
                                  type="button"
                                  className="min-h-11"
                                  disabled={disabled}
                                  onClick={() =>
                                    void mutate({
                                      action: "retrieve",
                                      containerId: item.id,
                                      index: slot.index,
                                    })
                                  }
                                >
                                  Retrieve to inventory
                                </Button>
                                {data.items
                                  .find((entry) => entry.id === slot.itemId)
                                  ?.compatibleSlotSets.map((slots, i) => (
                                    <Button
                                      key={i}
                                      type="button"
                                      className="min-h-11"
                                      disabled={disabled}
                                      onClick={() =>
                                        void mutate({
                                          action: "retrieve",
                                          containerId: item.id,
                                          index: slot.index,
                                          slots,
                                        })
                                      }
                                    >
                                      Retrieve and equip: {slotsLabel(slots)}
                                    </Button>
                                  ))}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
