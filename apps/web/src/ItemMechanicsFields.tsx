import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { useState } from "react";
import {
  Button,
  Field,
  Fieldset,
  Legend,
  Input,
  Select,
  Textarea,
} from "@aow/ui";
import type { JsonValue } from "./api";
import { D20TestFields, DurationFields } from "./RuleValueFields";
import { TriggerUsageLimitFields } from "./TriggerUsageLimitFields";

type RecordValue = Record<string, JsonValue>;
interface ValueProps {
  value: RecordValue;
  onChange: (value: RecordValue) => void;
}
const control = "min-h-11";
const columns = "grid gap-4 md:grid-cols-2";
const distanceUnits = ["foot", "mile", "square", "hex", "meter", "kilometer"];
const activationTypes = [
  "action",
  "bonus-action",
  "reaction",
  "free-action",
  "movement",
  "legendary-action",
  "lair-action",
  "mythic-action",
  "special",
  "passive",
];
const words = (value: string) => value.replaceAll("-", " ");
const record = (value: JsonValue | undefined): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value: JsonValue | undefined) =>
  typeof value === "string" ? value : "";
const number = (value: JsonValue | undefined) =>
  typeof value === "number" ? value : "";
function without(value: RecordValue, key: string): RecordValue {
  const next = { ...value };
  delete next[key];
  return next;
}

function NumberField({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: JsonValue | undefined;
  onChange: (value: number | undefined) => void;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <Input
        className={control}
        type="number"
        step="any"
        required={required}
        value={number(value)}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : event.target.valueAsNumber,
          )
        }
      />
    </Field>
  );
}

function DistanceFields({
  value,
  onChange,
  label,
}: ValueProps & { label: string }) {
  return (
    <div className={columns}>
      <NumberField
        label={`${label} distance`}
        value={value.value}
        onChange={(next) =>
          onChange(
            next === undefined
              ? without(value, "value")
              : { ...value, value: next },
          )
        }
      />
      <Field label={`${label} unit`} required>
        <Select
          className={control}
          required
          value={text(value.unit)}
          onChange={(event) => onChange({ ...value, unit: event.target.value })}
        >
          <option value="">Choose a unit</option>
          {distanceUnits.map((unit) => (
            <option key={unit} value={unit}>
              {words(unit)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/** Edits visible definition fields while retaining identity, extensions, and unexposed rules. */
export function ItemDefinitionFields({
  value,
  onChange,
  action = false,
  recordIds,
  definitions = [],
}: ValueProps & {
  action?: boolean;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const identity = record(value.identity);
  const components = record(value.components);
  const updateComponents = (next: RecordValue) =>
    onChange({ ...value, components: next });
  return (
    <div className="space-y-5">
      <div className={columns}>
        <Field label="Name" required>
          <Input
            className={control}
            value={
              protectedComparisonText(identity.name, recordIds)
                ? ""
                : text(identity.name)
            }
            placeholder={
              protectedComparisonText(identity.name, recordIds)
                ? "Existing name preserved"
                : undefined
            }
            required={!protectedComparisonText(identity.name, recordIds)}
            onChange={(event) =>
              onChange({
                ...value,
                identity: { ...identity, name: event.target.value },
              })
            }
          />
        </Field>
        {action && (
          <Field label="Activation" required>
            <Select
              className={control}
              required
              value={text(components.activation)}
              onChange={(event) =>
                updateComponents({
                  ...components,
                  activation: event.target.value,
                })
              }
            >
              <option value="">Choose activation</option>
              {activationTypes.map((activation) => (
                <option key={activation} value={activation}>
                  {words(activation)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Description">
        <Textarea
          className="min-h-28"
          value={
            protectedComparisonText(identity.description, recordIds)
              ? ""
              : text(identity.description)
          }
          placeholder={
            protectedComparisonText(identity.description, recordIds)
              ? "Existing description preserved"
              : undefined
          }
          onChange={(event) =>
            onChange({
              ...value,
              identity: { ...identity, description: event.target.value },
            })
          }
        />
      </Field>
      {action && (
        <TriggerUsageLimitFields
          value={components}
          onChange={updateComponents}
          recordIds={recordIds}
          definitions={definitions}
        />
      )}
      {action && (
        <>
          <p>
            Save this Action, then use Manage Targets to edit its target
            definitions.
          </p>
          {components.test === undefined ? (
            <Button
              className="min-h-11"
              type="button"
              onClick={() =>
                updateComponents({
                  ...components,
                  test: { kind: "attribute-check" },
                })
              }
            >
              Add test
            </Button>
          ) : (
            <>
              <D20TestFields
                value={components.test}
                onChange={(test) => updateComponents({ ...components, test })}
                recordIds={recordIds}
                definitions={definitions}
              />
              <Button
                className="min-h-11"
                type="button"
                onClick={() => {
                  if (window.confirm("Remove test?"))
                    updateComponents(without(components, "test"));
                }}
              >
                Remove test
              </Button>
            </>
          )}
          {components.duration === undefined ? (
            <Button
              className="min-h-11"
              type="button"
              onClick={() =>
                updateComponents({
                  ...components,
                  duration: { kind: "instantaneous" },
                })
              }
            >
              Add duration
            </Button>
          ) : (
            <>
              <DurationFields
                value={components.duration}
                onChange={(duration) =>
                  updateComponents({ ...components, duration })
                }
                recordIds={recordIds}
                definitions={definitions}
              />
              <Button
                className="min-h-11"
                type="button"
                onClick={() => {
                  if (window.confirm("Remove duration?"))
                    updateComponents(without(components, "duration"));
                }}
              >
                Remove duration
              </Button>
            </>
          )}
          <Field label="Sustained operation">
            <Select
              className="min-h-11"
              value={
                typeof components.sustainedOperation === "boolean"
                  ? String(components.sustainedOperation)
                  : components.sustainedOperation === undefined
                    ? ""
                    : "preserved"
              }
              onChange={(e) =>
                updateComponents(
                  e.target.value
                    ? {
                        ...components,
                        sustainedOperation: e.target.value === "true",
                      }
                    : without(components, "sustainedOperation"),
                )
              }
            >
              <option value="">Unspecified</option>
              <option value="preserved" disabled>
                Existing value preserved
              </option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          </Field>
        </>
      )}
    </div>
  );
}

function VehicleSpeed({
  name,
  value,
  onRename,
  onChange,
  onRemove,
}: ValueProps & {
  name: string;
  onRename: (name: string) => boolean;
  onRemove: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  return (
    <Fieldset className="space-y-4 rounded border p-4">
      <Legend className="px-1">Movement speed</Legend>
      <Field label="Movement name" required>
        <Input
          className={control}
          required
          value={draftName}
          onChange={(event) => {
            const next = event.target.value;
            setDraftName(next);
            event.target.setCustomValidity(
              next.trim() && onRename(next)
                ? ""
                : "Enter a unique movement name.",
            );
          }}
        />
      </Field>
      <DistanceFields label="Speed" value={value} onChange={onChange} />
      <Button
        className={control}
        type="button"
        tone="outline"
        onClick={onRemove}
      >
        Remove speed
      </Button>
    </Fieldset>
  );
}

export function VehicleFields({
  value,
  onChange,
  itemOptions,
}: ValueProps & {
  itemOptions: readonly { id: string; name: string }[];
}) {
  const [speedKey, setSpeedKey] = useState(0);
  const speeds = record(value.speeds);
  const components = Array.isArray(value.components) ? value.components : [];
  const update = (key: string, next: JsonValue | undefined) =>
    onChange(
      next === undefined ? without(value, key) : { ...value, [key]: next },
    );
  const cargo = record(value.cargoCapacity);
  return (
    <div className="space-y-5">
      <div className={columns}>
        <Field
          label="Vehicle type"
          required
          help="For example: land, waterborne, airborne, or space."
        >
          <Input
            className={control}
            required
            value={text(value.vehicleType)}
            onChange={(event) => update("vehicleType", event.target.value)}
          />
        </Field>
        <Field label="Size" required help="For example: large or huge.">
          <Input
            className={control}
            required
            value={text(value.size)}
            onChange={(event) => update("size", event.target.value)}
          />
        </Field>
        <NumberField
          label="Armor class"
          value={value.armorClass}
          onChange={(next) => update("armorClass", next)}
        />
        <NumberField
          label="Hit points"
          value={value.hitPoints}
          onChange={(next) => update("hitPoints", next)}
        />
        {(
          [
            ["damageThreshold", "Damage threshold"],
            ["crew", "Crew"],
            ["passengers", "Passengers"],
          ] as const
        ).map(([key, label]) => (
          <div className="space-y-2" key={key}>
            {value[key] !== undefined ? (
              <>
                <NumberField
                  label={label}
                  value={value[key]}
                  onChange={(next) =>
                    update(key, next === undefined ? "" : next)
                  }
                />
                <Button
                  className={control}
                  type="button"
                  tone="outline"
                  onClick={() => update(key, undefined)}
                >
                  Remove {label.toLowerCase()}
                </Button>
              </>
            ) : (
              <Button
                className={control}
                type="button"
                tone="outline"
                onClick={() => update(key, "")}
              >
                Add {label.toLowerCase()}
              </Button>
            )}
          </div>
        ))}
      </div>
      <section className="space-y-4" aria-label="Vehicle speeds">
        <h3 className="font-semibold">Movement speeds</h3>
        {Object.keys(speeds).length === 0 && (
          <p>No movement speeds specified.</p>
        )}
        {Object.entries(speeds).map(([name, speed], index) => (
          <VehicleSpeed
            key={`${speedKey}-${index}`}
            name={name}
            value={record(speed)}
            onChange={(next) => update("speeds", { ...speeds, [name]: next })}
            onRename={(next) => {
              if (next !== name && Object.hasOwn(speeds, next)) return false;
              update(
                "speeds",
                Object.fromEntries(
                  Object.entries(speeds).map(([key, entry]) => [
                    key === name ? next : key,
                    entry,
                  ]),
                ),
              );
              return true;
            }}
            onRemove={() => {
              update("speeds", without(speeds, name));
              setSpeedKey((key) => key + 1);
            }}
          />
        ))}
        <Button
          className={control}
          type="button"
          tone="outline"
          onClick={() => {
            let name = "Movement";
            let suffix = 2;
            while (Object.hasOwn(speeds, name)) name = `Movement ${suffix++}`;
            update("speeds", { ...speeds, [name]: { unit: "foot" } });
          }}
        >
          Add movement speed
        </Button>
      </section>
      <section className="space-y-4" aria-label="Cargo capacity">
        <h3 className="font-semibold">Cargo capacity</h3>
        {value.cargoCapacity !== undefined ? (
          <>
            <div className={columns}>
              <NumberField
                label="Cargo weight"
                value={cargo.value}
                onChange={(next) =>
                  update(
                    "cargoCapacity",
                    next === undefined
                      ? without(cargo, "value")
                      : { ...cargo, value: next },
                  )
                }
              />
              <Field label="Cargo weight unit" required>
                <Select
                  className={control}
                  required
                  value={text(cargo.unit)}
                  onChange={(event) =>
                    update("cargoCapacity", {
                      ...cargo,
                      unit: event.target.value,
                    })
                  }
                >
                  <option value="">Choose a unit</option>
                  {["pound", "ounce", "kilogram"].map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              className={control}
              type="button"
              tone="outline"
              onClick={() => update("cargoCapacity", undefined)}
            >
              Remove cargo capacity
            </Button>
          </>
        ) : (
          <Button
            className={control}
            type="button"
            tone="outline"
            onClick={() => update("cargoCapacity", { unit: "pound" })}
          >
            Add cargo capacity
          </Button>
        )}
      </section>
      <section className="space-y-4" aria-label="Vehicle components">
        <h3 className="font-semibold">Component items</h3>
        {components.length === 0 && <p>No component items specified.</p>}
        {components.map((component, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 md:flex-row md:items-end"
          >
            <Field
              className="flex-1"
              label={`Component item ${index + 1}`}
              required
            >
              <Select
                className={control}
                required
                value={text(component)}
                onChange={(event) =>
                  update(
                    "components",
                    components.map((entry, position) =>
                      position === index ? event.target.value : entry,
                    ),
                  )
                }
              >
                <option value="">Choose an item</option>
                {typeof component === "string" &&
                  component !== "" &&
                  !itemOptions.some((item) => item.id === component) && (
                    <option value={component}>Unavailable item</option>
                  )}
                {itemOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || "Unnamed item"}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              className={control}
              type="button"
              tone="outline"
              onClick={() =>
                update(
                  "components",
                  components.filter((_, position) => position !== index),
                )
              }
            >
              Remove component {index + 1}
            </Button>
          </div>
        ))}
        <Button
          className={control}
          type="button"
          tone="outline"
          onClick={() => update("components", [...components, ""])}
        >
          Add component item
        </Button>
      </section>
    </div>
  );
}
