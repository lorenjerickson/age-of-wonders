import type { ReactNode } from "react";
import type { JsonValue } from "@aow/common";
import { Alert, Button, Field, Select } from "@aow/ui";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import {
  DiceExpressionFields,
  RuleListFields,
  RuleNumberField,
  RuleReferenceField,
  RuleTextField,
  ScalarExpressionFields,
} from "./RuleValueFields";
import { RuleDistanceFields } from "./RuleTargetFields";
import {
  actorRuleChildren,
  newActorRule,
  type ActorRuleType,
} from "./actorMechanicsModel";
export function ActorRuleFields({
  type,
  value,
  onChange,
  recordIds,
  definitions = [],
  renderCollection,
}: {
  type: ActorRuleType;
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
  renderCollection: (key: string, label: string) => ReactNode;
}) {
  const context = { recordIds, definitions };
  const set = (key: string, next: JsonValue) =>
    onChange({ ...value, [key]: next });
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const text = (key: string, label: string) => (
    <RuleTextField
      {...context}
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const number = (key: string, label: string) => (
    <RuleNumberField
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const reference = (key: string, label: string) => (
    <RuleReferenceField
      {...context}
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const select = (key: string, label: string, options: string[]) => (
    <Field label={label}>
      <Select
        className="min-h-11"
        value={
          typeof value[key] === "string" &&
          options.includes(value[key] as string)
            ? (value[key] as string)
            : ""
        }
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="" disabled>
          {value[key] === undefined
            ? "Choose an option"
            : "Existing value preserved"}
        </option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v.replaceAll("-", " ")}
          </option>
        ))}
      </Select>
    </Field>
  );
  const optional = (
    key: string,
    label: string,
    initial: JsonValue,
    fields: ReactNode,
  ) =>
    value[key] === undefined ? (
      <Button
        type="button"
        className="min-h-11"
        onClick={() => set(key, initial)}
      >
        Add {label}
      </Button>
    ) : (
      <section className="space-y-3">
        {fields}
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            if (window.confirm(`Remove ${label}?`)) remove(key);
          }}
        >
          Remove {label}
        </Button>
      </section>
    );
  const checkbox = (key: string, label: string) => (
    <Field label={label}>
      <Select
        className="min-h-11"
        value={typeof value[key] === "boolean" ? String(value[key]) : ""}
        onChange={(e) => set(key, e.target.value === "true")}
      >
        <option value="" disabled>
          Existing value preserved
        </option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    </Field>
  );
  const expression = (key: string, label: string) => (
    <ScalarExpressionFields
      {...context}
      numericOnly
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const list = (key: string, label: string, refs = false) => (
    <RuleListFields
      {...context}
      label={label}
      value={value[key]}
      create={() => ""}
      onChange={(next) => set(key, next)}
    >
      {(entry, change) =>
        refs ? (
          <RuleReferenceField
            {...context}
            label="Definition"
            value={entry}
            onChange={change}
          />
        ) : (
          <RuleTextField
            {...context}
            label="Value"
            value={entry}
            onChange={change}
          />
        )
      }
    </RuleListFields>
  );
  const range = () =>
    optional(
      "range",
      "Range",
      { value: 30, unit: "foot" },
      <RuleDistanceFields
        label="Range"
        value={value.range}
        onChange={(next) => set("range", next)}
      />,
    );
  const basis = () => (
    <>
      {text("operatingBasis", "Operating basis")}
      {text("understanding", "Understanding")}
    </>
  );
  let fields: ReactNode;
  switch (type) {
    case "skill":
      fields = (
        <>
          {reference("skillDefinitionId", "Skill")}
          {number("bonus", "Bonus")}
        </>
      );
      break;
    case "speed":
      fields = (
        <>
          {text("mode", "Movement mode")}
          <RuleDistanceFields
            label="Speed"
            value={value.distance}
            onChange={(next) => set("distance", next)}
          />
          {optional("hover", "Hover", false, checkbox("hover", "Hover"))}
        </>
      );
      break;
    case "damage-adjustment":
      fields = (
        <>
          {text("damageType", "Damage type")}
          {select("response", "Response", [
            "resistance",
            "immunity",
            "vulnerability",
            "reduction",
            "multiplier",
          ])}
          {optional(
            "amount",
            "Amount",
            { kind: "constant", value: 0 },
            expression("amount", "Amount"),
          )}
          {optional(
            "multiplier",
            "Multiplier",
            1,
            number("multiplier", "Multiplier"),
          )}
        </>
      );
      break;
    case "sense":
      fields = (
        <>
          {text("sense", "Sense")}
          {range()}
          {optional("detail", "Detail", "", text("detail", "Detail"))}
          {optional(
            "operatingBasis",
            "Operating basis",
            "unknown",
            text("operatingBasis", "Operating basis"),
          )}
          {optional(
            "understanding",
            "Understanding",
            "unknown",
            text("understanding", "Understanding"),
          )}
          {optional(
            "mechanismDescription",
            "Mechanism description",
            "",
            text("mechanismDescription", "Mechanism description"),
          )}
        </>
      );
      break;
    case "communication":
      fields = (
        <>
          {text("medium", "Medium")}
          {select("directionality", "Directionality", [
            "one-way",
            "bidirectional",
            "broadcast",
          ])}
          {basis()}
          {range()}
          {optional(
            "description",
            "Description",
            "",
            text("description", "Description"),
          )}
          {list("requirements", "Requirements")}
        </>
      );
      break;
    case "discipline-state":
      fields = (
        <>
          {optional(
            "currentlyActivating",
            "Currently activating",
            "",
            reference("currentlyActivating", "Currently activating"),
          )}
          {value.integratedUses !== undefined && (
            <p>Existing integrated uses are preserved.</p>
          )}
        </>
      );
      break;
    case "discipline-source":
      fields = (
        <>
          {reference("sourceDefinitionId", "Source definition")}
          {text("attribute", "Attribute key")}
          {text("accessMode", "Access mode")}
          {expression("targetingBonus", "Targeting bonus")}
          {expression("resistanceDifficulty", "Resistance difficulty")}
          {list("disciplinesLearned", "Disciplines learned", true)}
          {list("disciplinesConfigured", "Disciplines configured", true)}
          {list("procedureLibrary", "Procedure library", true)}
          {optional(
            "controlInterfaceItemId",
            "Control interface item",
            "",
            reference("controlInterfaceItemId", "Control interface item"),
          )}
          {optional(
            "requiredToolItemId",
            "Required tool item",
            "",
            reference("requiredToolItemId", "Required tool item"),
          )}
          {optional(
            "extendedProcedureAccess",
            "Extended procedure access",
            false,
            checkbox("extendedProcedureAccess", "Extended procedure access"),
          )}
          {list("bypassesInputs", "Bypassed inputs")}
        </>
      );
      break;
    case "attribute-generation":
      fields = (
        <AttributeGenerationFields
          value={value}
          onChange={onChange}
          recordIds={recordIds}
          definitions={definitions}
        />
      );
      break;
  }
  return (
    <div className="min-w-0 space-y-4">
      {fields}
      {actorRuleChildren(type).map((child) => (
        <div key={child.key}>{renderCollection(child.key, child.label)}</div>
      ))}
    </div>
  );
}
function AttributeGenerationFields({
  value,
  onChange,
  recordIds,
  definitions,
}: {
  value: MechanicsObject;
  onChange: (v: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions: readonly { id: string; label: string }[];
}) {
  const known = ["standard-array", "point-buy", "roll", "custom"];
  const context = { recordIds, definitions };
  const set = (key: string, next: JsonValue) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="space-y-4">
      <Field label="Attribute generation method">
        <Select
          className="min-h-11"
          value={known.includes(String(value.kind)) ? String(value.kind) : ""}
          onChange={(e) => {
            if (!window.confirm("Replace attribute generation settings?"))
              return;
            const kind = e.target.value;
            onChange(
              kind === "standard-array"
                ? newActorRule("attribute-generation")
                : kind === "point-buy"
                  ? { kind, points: 0, costs: {} }
                  : kind === "roll"
                    ? {
                        kind,
                        expression: {
                          terms: [{ kind: "dice", count: 4, size: 6 }],
                        },
                        count: 6,
                      }
                    : { kind, description: "" },
            );
          }}
        >
          <option value="" disabled>
            Existing method preserved
          </option>
          {known.map((kind) => (
            <option key={kind} value={kind}>
              {kind.replaceAll("-", " ")}
            </option>
          ))}
        </Select>
      </Field>
      {value.kind === "standard-array" && (
        <RuleListFields
          {...context}
          label="Attribute scores"
          value={value.values}
          create={() => 10}
          onChange={(v) => set("values", v)}
        >
          {(entry, change) => (
            <RuleNumberField label="Score" value={entry} onChange={change} />
          )}
        </RuleListFields>
      )}
      {value.kind === "point-buy" && (
        <>
          <RuleNumberField
            label="Points"
            value={value.points}
            onChange={(v) => set("points", v)}
          />
          <PointCosts value={value.costs} onChange={(v) => set("costs", v)} />
        </>
      )}
      {value.kind === "roll" && (
        <>
          <DiceExpressionFields
            {...context}
            value={value.expression}
            onChange={(v) => set("expression", v)}
            label="Attribute roll"
          />
          <RuleNumberField
            label="Roll count"
            value={value.count}
            onChange={(v) => set("count", v)}
          />
        </>
      )}
      {value.kind === "custom" && (
        <RuleTextField
          {...context}
          label="Description"
          value={value.description}
          onChange={(v) => set("description", v)}
        />
      )}
      {!known.includes(String(value.kind)) && (
        <Alert tone="warning">
          Existing generation settings are preserved.
        </Alert>
      )}
    </div>
  );
}
function PointCosts({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: MechanicsObject) => void;
}) {
  const costs = mechanicsObject(value);
  if (value !== undefined && costs !== value)
    return (
      <Alert tone="warning">
        Existing point costs are unsupported and preserved.
      </Alert>
    );
  const keys = Object.keys(costs);
  if (keys.some((key) => !/^\d+$/.test(key)))
    return (
      <Alert tone="warning">
        Existing point costs are unsupported and preserved.
      </Alert>
    );
  return (
    <section className="space-y-3">
      <h3>Score costs</h3>
      {keys.map((key) => (
        <div key={key} className="grid gap-3 md:grid-cols-3">
          <RuleNumberField
            label="Attribute score"
            value={Number(key)}
            onChange={(next) => {
              if (
                typeof next !== "number" ||
                !Number.isInteger(next) ||
                next < 0 ||
                Object.hasOwn(costs, String(next))
              )
                return;
              const copy = { ...costs };
              delete copy[key];
              copy[String(next)] = costs[key];
              onChange(copy);
            }}
          />
          <RuleNumberField
            label="Point cost"
            value={costs[key]}
            onChange={(next) => onChange({ ...costs, [key]: next })}
          />
          <Button
            className="min-h-11"
            type="button"
            onClick={() => {
              const copy = { ...costs };
              delete copy[key];
              onChange(copy);
            }}
          >
            Remove score cost
          </Button>
        </div>
      ))}
      <Button
        className="min-h-11"
        type="button"
        onClick={() => {
          let score = 8;
          while (Object.hasOwn(costs, String(score))) score++;
          onChange({ ...costs, [score]: 0 });
        }}
      >
        Add score cost
      </Button>
    </section>
  );
}
