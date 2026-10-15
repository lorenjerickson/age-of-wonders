import type { ReactNode } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@aow/ui";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import {
  ScalarExpressionFields,
  DiceExpressionFields,
  D20TestFields,
  DurationFields,
  RuleTextField,
  RuleReferenceField,
} from "./RuleValueFields";
import {
  createRuleEffect,
  effectChildCollections,
  ruleEffectKinds,
} from "./ruleEffectModel";
const emptyIds = new Set<string>();
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function EffectFields({
  value,
  onChange,
  isNew,
  recordIds = emptyIds,
  definitions = [],
  renderCollection,
  renderDetail,
}: {
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  isNew: boolean;
  recordIds?: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
  renderCollection?: (field: string, label: string) => ReactNode;
  renderDetail?: (field: string, label: string) => ReactNode;
}) {
  const kind = text(value.kind);
  if (!(ruleEffectKinds as readonly string[]).includes(kind))
    return (
      <Alert tone="warning">
        This Effect is preserved as imported. You can reorder or explicitly
        remove it.
      </Alert>
    );
  const update = (key: string, next: unknown) =>
    onChange({ ...value, [key]: next } as MechanicsObject);
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const shared = { recordIds, definitions };
  const field = (key: string, label: string) => (
    <RuleTextField
      {...shared}
      key={key}
      label={label}
      value={value[key]}
      onChange={(next) => update(key, next)}
    />
  );
  const ref = (key: string, label: string) => (
    <RuleReferenceField
      {...shared}
      key={key}
      label={label}
      value={value[key]}
      onChange={(next) => update(key, next)}
    />
  );
  const scalar = (key: string, label: string, numericOnly = false) => (
    <ScalarExpressionFields
      {...shared}
      label={label}
      numericOnly={numericOnly}
      value={value[key]}
      onChange={(next) => update(key, next)}
    />
  );
  const optional = (
    key: string,
    label: string,
    initial: unknown,
    content: ReactNode,
  ) =>
    value[key] === undefined ? (
      <Button
        type="button"
        className="min-h-11"
        onClick={() => update(key, initial)}
      >
        Add {label}
      </Button>
    ) : (
      <section className="space-y-3">
        {content}
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
  const select = (key: string, label: string, choices: readonly string[]) => (
    <Field label={label}>
      <Select
        className="min-h-11"
        value={
          choices.includes(text(value[key]))
            ? text(value[key])
            : value[key] === undefined
              ? ""
              : "preserved"
        }
        onChange={(e) =>
          e.target.value ? update(key, e.target.value) : remove(key)
        }
      >
        <option value="">Not specified</option>
        {value[key] !== undefined && !choices.includes(text(value[key])) && (
          <option value="preserved" disabled>
            Existing value preserved
          </option>
        )}
        {choices.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
    </Field>
  );
  const bool = (key: string, label: string) => (
    <Field label={label}>
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
          e.target.value ? update(key, e.target.value === "true") : remove(key)
        }
      >
        <option value="">Not specified</option>
        {value[key] !== undefined && typeof value[key] !== "boolean" && (
          <option value="preserved" disabled>
            Existing value preserved
          </option>
        )}
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    </Field>
  );
  const distance = (key: string, label: string) => {
    const data = mechanicsObject(value[key]);
    if (value[key] !== undefined && data !== value[key])
      return (
        <Alert tone="warning">
          Existing {label.toLowerCase()} is preserved.
        </Alert>
      );
    return (
      <section className="space-y-3">
        <Field label={label}>
          <Input
            className="min-h-11"
            type="number"
            step="any"
            required
            value={typeof data.value === "number" ? data.value : ""}
            onChange={(e) =>
              update(key, {
                ...data,
                value: e.target.value === "" ? "" : e.target.valueAsNumber,
              })
            }
          />
        </Field>
        <Field label="Distance unit">
          <Select
            className="min-h-11"
            value={
              ["foot", "mile", "square", "hex", "meter", "kilometer"].includes(
                text(data.unit),
              )
                ? text(data.unit)
                : ""
            }
            onChange={(e) => update(key, { ...data, unit: e.target.value })}
          >
            <option value="" disabled>
              Choose unit
            </option>
            {["foot", "mile", "square", "hex", "meter", "kilometer"].map(
              (unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ),
            )}
          </Select>
        </Field>
      </section>
    );
  };
  const detail = (key: string, label: string) =>
    renderDetail?.(key, label) ?? (
      <p>Save this Effect to manage {label.toLowerCase()}.</p>
    );
  return (
    <div className="space-y-5">
      <Field label="Effect kind">
        <Select
          className="min-h-11"
          disabled={!isNew}
          value={kind}
          onChange={(e) => {
            if (window.confirm("Replace this unsaved Effect and its fields?"))
              onChange(createRuleEffect(e.target.value));
          }}
        >
          {ruleEffectKinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </Field>
      {[
        "damage",
        "heal",
        "temporary-hit-points",
        "change-resource",
        "set-value",
        "apply-condition",
        "remove-condition",
        "apply-modifier",
        "move",
        "transit",
        "grant-action",
        "award-profession-points",
        "repeat-save",
        "destroy-entity",
      ].includes(kind) && field("target", "Target binding")}
      {kind === "narrative" && (
        <>
          <Field label="Narrative text" required>
            {protectedComparisonText(value.text, recordIds) ? (
              <p>Existing text reference preserved.</p>
            ) : (
              <Textarea
                className="min-h-28"
                required
                value={text(value.text)}
                onChange={(e) => update("text", e.target.value)}
              />
            )}
          </Field>
          {select("visibility", "Visibility", ["public", "controller", "gm"])}
        </>
      )}
      {(kind === "damage" || kind === "heal") && (
        <DiceExpressionFields
          {...shared}
          label="Amount"
          value={value.amount}
          onChange={(next) => update("amount", next)}
        />
      )}
      {kind === "damage" && field("damageType", "Damage type")}
      {kind === "heal" && bool("upToMaximum", "Limit to maximum hit points")}
      {kind === "temporary-hit-points" && (
        <>
          {scalar("amount", "Amount")}
          {bool("replaceOnly", "Replace only")}
        </>
      )}
      {kind === "change-resource" && (
        <>
          {field("resource", "Resource")}
          {scalar("delta", "Change")}
          {bool("allowOverflow", "Allow overflow")}
        </>
      )}
      {kind === "set-value" && (
        <>
          {field("path", "Value path")}
          {scalar("value", "Value")}
        </>
      )}
      {(kind === "apply-condition" || kind === "remove-condition") &&
        field("condition", "Condition")}
      {kind === "apply-condition" &&
        optional(
          "saveEnds",
          "ending test",
          { kind: "saving-throw" },
          <D20TestFields
            {...shared}
            label="Ending test"
            value={value.saveEnds}
            onChange={(next) => update("saveEnds", next)}
          />,
        )}
      {kind === "apply-modifier" && detail("modifier", "Modifier")}
      {kind === "remove-effect" && field("effectId", "Effect reference")}
      {kind === "move" && (
        <>
          {distance("distance", "Movement distance")}
          {bool("forced", "Forced movement")}
          {optional(
            "direction",
            "direction",
            "",
            field("direction", "Direction"),
          )}
        </>
      )}
      {kind === "transit" && (
        <>
          {field("destination", "Destination binding")}
          {optional(
            "maximumDistance",
            "maximum distance",
            { value: 0, unit: "foot" },
            distance("maximumDistance", "Maximum distance"),
          )}
        </>
      )}
      {kind === "grant-action" && ref("actionId", "Action")}
      {kind === "award-profession-points" && (
        <>
          {ref("professionId", "Profession")}
          {scalar("amount", "Amount")}
          {optional("actionId", "Action", "", ref("actionId", "Action"))}
        </>
      )}
      {kind === "make-test" && (
        <>
          {field("actor", "Actor binding")}
          {optional(
            "bindResultAs",
            "result binding",
            "",
            field("bindResultAs", "Result binding"),
          )}
        </>
      )}
      {(kind === "make-test" || kind === "repeat-save") && (
        <D20TestFields
          {...shared}
          label="Test"
          value={value.test}
          onChange={(next) => update("test", next)}
        />
      )}
      {kind === "choose" && (
        <>
          {field("chooser", "Chooser binding")}
          {field("bindAs", "Choice binding")}
          {detail("choice", "Choice")}
        </>
      )}
      {kind === "branch" && detail("predicate", "Predicate")}
      {kind === "for-each" && (
        <>
          {scalar("collection", "Collection")}
          {field("bindAs", "Entry binding")}
        </>
      )}
      {(kind === "deploy" || kind === "create-object") &&
        ref("definitionId", "Definition")}
      {kind === "deploy" && (
        <>
          {optional(
            "controller",
            "controller",
            "",
            field("controller", "Controller binding"),
          )}
          {optional(
            "count",
            "count",
            { kind: "constant", value: 1 },
            scalar("count", "Count", true),
          )}
        </>
      )}
      {kind === "create-object" &&
        optional(
          "position",
          "position",
          "",
          field("position", "Position binding"),
        )}
      {[
        "apply-condition",
        "apply-modifier",
        "grant-action",
        "deploy",
        "create-object",
      ].includes(kind) &&
        optional(
          "duration",
          "duration",
          { kind: "instantaneous" },
          <DurationFields
            {...shared}
            label="Duration"
            value={value.duration}
            onChange={(next) => update("duration", next)}
          />,
        )}
      {kind === "emit-event" && (
        <>
          {field("event", "Event")}
          {value.payload !== undefined && (
            <p>Existing event payload is preserved.</p>
          )}
        </>
      )}
      {effectChildCollections(kind).map(({ key, label }) => (
        <section key={key}>
          {renderCollection?.(key, label) ?? (
            <p>Save this Effect to manage {label.toLowerCase()}.</p>
          )}
        </section>
      ))}
    </div>
  );
}
