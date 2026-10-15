import { Button, Field, Input, Select, Alert } from "@aow/ui";
import type { ReactNode } from "react";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { ScalarExpressionFields } from "./RuleValueFields";
const kinds = [
  "self",
  "creature",
  "object",
  "point",
  "area",
  "willing-creature",
  "custom",
];
const dimensions: Record<string, string[]> = {
  cone: ["length"],
  cube: ["size"],
  cylinder: ["radius", "height"],
  emanation: ["radius"],
  sphere: ["radius"],
  line: ["length", "width"],
  wall: ["length", "height", "thickness"],
};
const units = ["foot", "mile", "square", "hex", "meter", "kilometer"];
export function RuleDistanceFields({
  value,
  onChange,
  label = "Distance",
}: {
  value: unknown;
  onChange: (v: MechanicsObject) => void;
  label?: string;
}) {
  const v = mechanicsObject(value);
  if (value !== undefined && v !== value)
    return (
      <Alert tone="warning">
        Existing distance is unsupported and preserved.
      </Alert>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={`${label} value`}>
        <Input
          className="min-h-11"
          required
          type="number"
          step="any"
          value={typeof v.value === "number" ? v.value : ""}
          onChange={(e) =>
            onChange({
              ...v,
              value: e.target.value === "" ? "" : e.target.valueAsNumber,
            })
          }
        />
      </Field>
      <Field label={`${label} unit`}>
        <Select
          className="min-h-11"
          value={
            typeof v.unit === "string" && units.includes(v.unit) ? v.unit : ""
          }
          onChange={(e) => onChange({ ...v, unit: e.target.value })}
        >
          <option value="">Choose unit</option>
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
export function RuleTargetFields({
  value,
  onChange,
  recordIds,
  definitions = [],
  renderCollection,
}: {
  value: MechanicsObject;
  onChange: (v: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
  renderCollection: (key: string, label: string) => ReactNode;
}) {
  const set = (key: string, v: unknown) =>
    onChange({ ...value, [key]: v } as MechanicsObject);
  const drop = (key: string) => {
    const n = { ...value };
    delete n[key];
    onChange(n);
  };
  const area = mechanicsObject(value.area);
  const areaKind = typeof area.kind === "string" ? area.kind : "";
  return (
    <div className="space-y-4">
      <Field label="Target kind">
        <Select
          className="min-h-11"
          value={kinds.includes(String(value.kind)) ? String(value.kind) : ""}
          onChange={(e) => set("kind", e.target.value)}
        >
          <option value="">Choose target</option>
          {kinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </Field>
      <Field label="Range">
        <Select
          className="min-h-11"
          value={
            typeof value.range === "string" &&
            ["touch", "sight", "unlimited", "self"].includes(value.range)
              ? value.range
              : value.range === undefined
                ? ""
                : value.range && typeof value.range === "object"
                  ? "distance"
                  : "preserved"
          }
          onChange={(e) => {
            if (value.range !== undefined && !window.confirm("Replace range?"))
              return;
            if (e.target.value)
              set(
                "range",
                e.target.value === "distance"
                  ? { value: 0, unit: "foot" }
                  : e.target.value,
              );
            else drop("range");
          }}
        >
          <option value="">Not specified</option>
          <option value="preserved" disabled>
            Existing range preserved
          </option>
          {["distance", "touch", "sight", "unlimited", "self"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </Field>
      {value.range && typeof value.range === "object" && (
        <RuleDistanceFields
          label="Range"
          value={value.range}
          onChange={(v) => set("range", v)}
        />
      )}
      {value.count === undefined ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => set("count", { kind: "constant", value: 1 })}
        >
          Add count
        </Button>
      ) : (
        <>
          <ScalarExpressionFields
            label="Count"
            value={value.count}
            numericOnly
            recordIds={recordIds}
            definitions={definitions}
            onChange={(v) => set("count", v)}
          />
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              if (window.confirm("Remove count?")) drop("count");
            }}
          >
            Remove count
          </Button>
        </>
      )}
      <Field label="Area shape">
        <Select
          className="min-h-11"
          value={
            Object.hasOwn(dimensions, areaKind)
              ? areaKind
              : value.area === undefined
                ? ""
                : "preserved"
          }
          onChange={(e) => {
            if (
              value.area !== undefined &&
              !window.confirm("Replace area shape?")
            )
              return;
            if (e.target.value) set("area", { kind: e.target.value });
            else drop("area");
          }}
        >
          <option value="">Not specified</option>
          <option value="preserved" disabled>
            Existing custom area preserved
          </option>
          {Object.keys(dimensions).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </Field>
      {(Object.hasOwn(dimensions, areaKind) ? dimensions[areaKind]! : []).map(
        (key) => (
          <section key={key}>
            {key === "thickness" && area[key] === undefined ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={() =>
                  set("area", {
                    ...area,
                    thickness: { value: 0, unit: "foot" },
                  })
                }
              >
                Add thickness
              </Button>
            ) : (
              <RuleDistanceFields
                label={key}
                value={area[key]}
                onChange={(v) => set("area", { ...area, [key]: v })}
              />
            )}
            {key === "thickness" && area[key] !== undefined && (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  const n = { ...area };
                  delete n[key];
                  set("area", n);
                }}
              >
                Remove thickness
              </Button>
            )}
          </section>
        ),
      )}
      {["requiresSight", "canTargetSelf"].map((key) => (
        <Field
          key={key}
          label={key === "requiresSight" ? "Requires sight" : "Can target self"}
        >
          <Select
            className="min-h-11"
            value={
              typeof value[key] === "boolean"
                ? String(value[key])
                : value[key] === undefined
                  ? ""
                  : "preserved"
            }
            onChange={(e) =>
              e.target.value ? set(key, e.target.value === "true") : drop(key)
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
      ))}
      <Field label="Relationship">
        <Select
          className="min-h-11"
          value={
            ["ally", "enemy", "neutral", "any"].includes(
              String(value.relationship),
            )
              ? String(value.relationship)
              : value.relationship === undefined
                ? ""
                : "preserved"
          }
          onChange={(e) =>
            e.target.value
              ? set("relationship", e.target.value)
              : drop("relationship")
          }
        >
          <option value="">Unspecified</option>
          <option value="preserved" disabled>
            Existing value preserved
          </option>
          {["ally", "enemy", "neutral", "any"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </Field>
      {renderCollection("filters", "Filters")}
    </div>
  );
}
