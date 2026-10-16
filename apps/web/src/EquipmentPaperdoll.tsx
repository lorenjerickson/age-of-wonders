import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input } from "@aow/ui";
import { MediaImage } from "./MediaImage";
import {
  clearEquipmentSlot,
  equipmentAtSlot,
  equipmentChoices,
  equipmentCombatSummary,
  equipmentSlotPosition,
  equipPaperdollItem,
  type EquipmentAssignment,
  type EquipmentPaperdollItem,
  type EquipmentPaperdollSlot,
} from "./equipmentPaperdollModel";
import "./EquipmentPaperdoll.css";
export type {
  EquipmentAssignment,
  EquipmentPaperdollItem,
  EquipmentPaperdollSlot,
} from "./equipmentPaperdollModel";

function ItemIcon({
  item,
  slot,
}: {
  item?: EquipmentPaperdollItem;
  slot?: EquipmentPaperdollSlot;
}) {
  const key = slot?.id.replace(/^aow:equipment-slot-/, "") ?? "";
  const emptyGlyph =
    key === "head"
      ? "M6 23V15a10 10 0 0 1 20 0v8M6 18h20M10 18v7m12-7v7"
      : key === "neck"
        ? "M7 5q0 13 9 18Q25 18 25 5M12 23l4 5 4-5-4-4z"
        : ["chest", "shoulders", "back"].includes(key)
          ? "M11 5 4 10l3 8 4-2v12h10V16l4 2 3-8-7-5q-5 6-10 0z"
          : ["arms", "wrists", "hands", "main-hand", "off-hand"].includes(key)
            ? "M10 28 6 17q-1-4 2-4l3 4V6q0-3 3-1v10-11q3-3 4 0v11-9q3-2 4 1v10-6q3-1 4 2v9l-5 6z"
            : ["left-finger", "right-finger"].includes(key)
              ? "M11 7l5-4 5 4-5 5zM12 11a9 9 0 1 0 8 0"
              : ["waist", "belt"].includes(key)
                ? "M3 11h26v10H3zM12 9h8v14h-8zM16 16h7"
                : key === "legs"
                  ? "M7 4h18l-2 24h-7V13h-1v15H8zM7 9h18"
                  : key === "feet"
                    ? "M10 4h11v15l7 3v6H5v-8l5-3zM5 24h23"
                    : key === "pack"
                      ? "M11 7V4h10v3M7 8h18v20H7zM10 18h12v7H10z"
                      : "M16 8v16M8 16h16";
  return (
    <span className="equipment-paperdoll-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path
          d={
            item
              ? "M16 3 28 10v12l-12 7L4 22V10Zm0 0v26M4 10l12 7 12-7"
              : emptyGlyph
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {!!item?.image && (
        <MediaImage
          image={item.image}
          name={item.name}
          className="equipment-paperdoll-media"
        />
      )}
    </span>
  );
}
function ItemDetails({
  item,
  fallback,
}: {
  item?: EquipmentPaperdollItem;
  fallback: string;
}) {
  return (
    <div className="equipment-paperdoll-details">
      <strong>{item?.name ?? fallback}</strong>
      {!!item?.bonuses?.length && (
        <ul>
          {item.bonuses.map((bonus, index) => (
            <li key={index}>{bonus}</li>
          ))}
        </ul>
      )}
      {item?.description && <p>{item.description}</p>}
    </div>
  );
}
export function EquipmentPaperdoll({
  slots,
  items,
  equipment,
  onChange,
  disabled = false,
}: {
  slots: readonly EquipmentPaperdollSlot[];
  items: readonly EquipmentPaperdollItem[];
  equipment: readonly EquipmentAssignment[];
  onChange: (equipment: EquipmentAssignment[]) => void;
  disabled?: boolean;
}) {
  const [active, setActive] = useState<string>();
  const [search, setSearch] = useState("");
  const [tooltip, setTooltip] = useState<{
    slot: string;
    left: number;
    top: number;
  }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const titleId = useId(),
    tooltipId = useId();
  const combat = equipmentCombatSummary(equipment, items);
  const activeSlot = slots.find((slot) => slot.id === active);
  const occupants = active ? equipmentAtSlot(equipment, active, slots) : [];
  const current =
    occupants.length === 1
      ? items.find((item) => item.id === occupants[0].itemDefinitionId)
      : undefined;
  const close = () => {
    setActive(undefined);
    setTooltip(undefined);
  };
  useEffect(() => {
    if (!activeSlot || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      element.close();
      returnFocus.current?.focus();
    };
  }, [activeSlot]);
  const slotNames = (set: readonly string[]) =>
    set
      .map(
        (id) =>
          slots.find((slot) => slot.id === id)?.name ?? "Unavailable slot",
      )
      .join(" + ");
  const open = (slot: EquipmentPaperdollSlot, button: HTMLButtonElement) => {
    returnFocus.current = button;
    setSearch("");
    setTooltip(undefined);
    setActive(slot.id);
  };
  const tip = (slot: EquipmentPaperdollSlot, button: HTMLButtonElement) => {
    if (active) return;
    const rect = button.getBoundingClientRect();
    setTooltip({
      slot: slot.id,
      left: Math.max(
        8,
        Math.min(window.innerWidth - 264, rect.left + rect.width / 2 - 124),
      ),
      top: Math.max(8, Math.min(window.innerHeight - 320, rect.bottom + 8)),
    });
  };
  const renderSlot = (slot: EquipmentPaperdollSlot, supplementary = false) => {
    const rows = equipmentAtSlot(equipment, slot.id, slots);
    const item =
      rows.length === 1
        ? items.find((item) => item.id === rows[0].itemDefinitionId)
        : undefined;
    const label =
      rows.length > 1
        ? "Multiple assignments"
        : rows.length
          ? (item?.name ?? "Unavailable item")
          : "Empty";
    const position = equipmentSlotPosition(slot);
    return (
      <div
        key={slot.id}
        className={
          supplementary
            ? "equipment-paperdoll-extra-slot"
            : "equipment-paperdoll-slot"
        }
        style={
          !supplementary && position
            ? { left: `${position.x}%`, top: `${position.y}%` }
            : undefined
        }
      >
        <button
          type="button"
          className={`equipment-paperdoll-slot-button ${rows.length ? "has-equipment" : ""}`}
          aria-label={`${slot.name}: ${label}`}
          aria-haspopup="dialog"
          aria-describedby={tooltip?.slot === slot.id ? tooltipId : undefined}
          onClick={(event) => open(slot, event.currentTarget)}
          onMouseEnter={(event) => tip(slot, event.currentTarget)}
          onMouseLeave={() => setTooltip(undefined)}
          onFocus={(event) => tip(slot, event.currentTarget)}
          onBlur={() => setTooltip(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setTooltip(undefined);
          }}
        >
          <ItemIcon
            slot={slot}
            item={
              item ??
              (rows.length
                ? { id: "", name: "Unavailable item", compatibleSlotSets: [] }
                : undefined)
            }
          />
        </button>
        {supplementary && <span>{slot.name}</span>}
      </div>
    );
  };
  const hoveredSlot = slots.find((slot) => slot.id === tooltip?.slot);
  const hoveredRows = hoveredSlot
    ? equipmentAtSlot(equipment, hoveredSlot.id, slots)
    : [];
  const hoveredItem =
    hoveredRows.length === 1
      ? items.find((item) => item.id === hoveredRows[0].itemDefinitionId)
      : undefined;
  return (
    <section className="equipment-paperdoll" aria-label="Equipment paperdoll">
      <h2>Equipment</h2>
      <p>Choose a body slot to view or change its equipment.</p>
      {!slots.length ? (
        <p>No equipment slots are available for this creature.</p>
      ) : (
        <>
          <div className="equipment-paperdoll-figure">
            <svg
              className="equipment-paperdoll-silhouette"
              viewBox="0 0 340 620"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="170" cy="56" r="34" />
              <path d="M146 88h48l9 30 43 23 65 248-28 12-62-191-7 103 24 234-42 9-26-178-26 178-42-9 24-234-7-103-62 191-28-12 65-248 43-23z" />
            </svg>
            {slots
              .filter((slot) => equipmentSlotPosition(slot))
              .map((slot) => renderSlot(slot))}
          </div>
          {slots.some((slot) => !equipmentSlotPosition(slot)) && (
            <section
              className="equipment-paperdoll-extras"
              aria-label="Additional equipment slots"
            >
              <h3>Additional slots</h3>
              <div>
                {slots
                  .filter((slot) => !equipmentSlotPosition(slot))
                  .map((slot) => renderSlot(slot, true))}
              </div>
            </section>
          )}
        </>
      )}
      <section
        className="equipment-paperdoll-bonuses"
        aria-label="Net equipment bonuses"
      >
        <h3>Net equipment bonuses</h3>
        <p>
          Equipped items only. Base actor rolls and attributes are excluded.
        </p>
        <dl>
          <div>
            <dt>Attack</dt>
            <dd>
              {combat.weapons.length === 1
                ? combat.weapons[0].attack
                : combat.weapons.length
                  ? "By weapon below"
                  : combat.attack}
            </dd>
          </div>
          <div>
            <dt>Defense</dt>
            <dd>{combat.defense}</dd>
          </div>
          <div>
            <dt>Damage</dt>
            <dd>
              {combat.weapons.length === 1
                ? combat.weapons[0].damage
                : combat.weapons.length
                  ? "By weapon below"
                  : combat.damage}
            </dd>
          </div>
          <div>
            <dt>Resistance</dt>
            <dd>{combat.resistance}</dd>
          </div>
        </dl>
        {!!combat.weapons.length && (
          <>
            <p>
              Use one weapon's attack and damage at a time. Shared equipment
              bonuses are included.
            </p>
            <ul>
              {combat.weapons.map((weapon, index) => (
                <li key={index}>
                  <strong>{weapon.name}</strong>
                  <span>Attack: {weapon.attack}</span>
                  <span>Damage: {weapon.damage}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {combat.incomplete && (
          <p>Incomplete totals: an equipped item is unavailable.</p>
        )}
        {!!combat.notes.length && (
          <details>
            <summary>Conditional and variable bonuses</summary>
            <ul>
              {combat.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {equipment.some((entry) => entry.slot === "carried") && (
        <p className="equipment-paperdoll-note">
          Carried items are kept unless you choose to equip them.
        </p>
      )}
      {tooltip &&
        hoveredSlot &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            id={tooltipId}
            className="equipment-paperdoll-tooltip"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <small>{hoveredSlot.name}</small>
            <ItemDetails
              item={hoveredItem}
              fallback={hoveredRows.length ? "Unavailable item" : "Empty slot"}
            />
          </div>,
          document.body,
        )}
      {activeSlot &&
        typeof document !== "undefined" &&
        createPortal(
          <dialog
            ref={dialog}
            className="equipment-paperdoll-dialog"
            aria-labelledby={titleId}
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <header>
              <h2 id={titleId}>{activeSlot.name} equipment</h2>
              <Button type="button" onClick={close}>
                Close
              </Button>
            </header>
            <section
              className="equipment-paperdoll-current"
              aria-label="Current equipment"
            >
              <ItemIcon item={current} />
              <ItemDetails
                item={current}
                fallback={
                  occupants.length > 1
                    ? "Multiple assignments preserved"
                    : occupants.length
                      ? "Unavailable item"
                      : "Empty slot"
                }
              />
            </section>
            {!!occupants.length && (
              <>
                <p>
                  Replacing or clearing this item also clears all of its
                  occupied slots.
                </p>
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(
                      clearEquipmentSlot(equipment, activeSlot.id, slots),
                    );
                    close();
                  }}
                >
                  Clear equipment
                </Button>
              </>
            )}
            {disabled ? (
              <p>This equipment is read only.</p>
            ) : (
              <p>
                Choose an item and a complete slot assignment. Other equipped
                items are kept.
              </p>
            )}
            <Input
              aria-label="Find equipment"
              placeholder="Find equipment"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="equipment-paperdoll-choices">
              {items
                .filter(
                  (item) =>
                    equipmentChoices(item, activeSlot.id, slots, equipment)
                      .length &&
                    `${item.name} ${item.description ?? ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((item) => (
                  <section key={item.id} className="equipment-paperdoll-choice">
                    <ItemIcon item={item} />
                    <div>
                      <strong>{item.name}</strong>
                      {equipmentChoices(
                        item,
                        activeSlot.id,
                        slots,
                        equipment,
                      ).map((choice) => (
                        <div key={choice.slots.join("|")}>
                          <Button
                            type="button"
                            aria-label={`Equip ${item.name} · ${slotNames(choice.slots)}`}
                            disabled={disabled || choice.blocked}
                            onClick={() => {
                              onChange(
                                equipPaperdollItem(
                                  equipment,
                                  activeSlot.id,
                                  slots,
                                  item,
                                  choice.slots,
                                ),
                              );
                              close();
                            }}
                          >
                            Equip · {slotNames(choice.slots)}
                          </Button>
                          {choice.blocked && (
                            <small>
                              Clear the conflicting equipment first.
                            </small>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              {!items.some(
                (item) =>
                  equipmentChoices(item, activeSlot.id, slots, equipment)
                    .length &&
                  `${item.name} ${item.description ?? ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              ) && <p>No compatible items found.</p>}
            </div>
          </dialog>,
          document.body,
        )}
    </section>
  );
}
