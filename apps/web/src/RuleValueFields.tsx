import { useState, type ReactNode } from "react";
import type { JsonValue } from "@aow/common";
import { Alert, Button, Field, Fieldset, Input, Legend, Select } from "@aow/ui";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import {
  moveRuleEntry,
  newRuleExpression,
  numericExpressionKinds,
  renameJsonProperty,
  replaceRuleKind,
  ruleLabel,
  scalarExpressionKinds,
  setRuleField,
} from "./ruleValueModel";

type Context = {
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
};
type ValueProps<T = MechanicsObject> = Context & {
  value: unknown;
  onChange: (value: T) => void;
  label?: string;
};
const object = (v: unknown): v is MechanicsObject =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const confirmed = (label: string) =>
  window.confirm(
    `Replace ${label.toLowerCase()}? Existing settings will be replaced.`,
  );
const emptyIds: ReadonlySet<string> = new Set();
export function RuleNumberField({
  value,
  onChange,
  label = "Number",
}: {
  value: unknown;
  onChange: (value: number | string) => void;
  label?: string;
}) {
  return (
    <Field label={label} required>
      <Input
        className="min-h-11"
        required
        type="number"
        step="any"
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : e.target.valueAsNumber)
        }
      />
    </Field>
  );
}
export function RuleTextField({
  value,
  onChange,
  label = "Text",
  recordIds,
}: ValueProps<string>) {
  if (
    protectedComparisonText(value, recordIds) ||
    (value !== undefined && typeof value !== "string")
  )
    return (
      <div className="space-y-2">
        <p>Existing {label.toLowerCase()} preserved.</p>
        <Button
          className="min-h-11"
          type="button"
          onClick={() => {
            if (confirmed(label)) onChange("");
          }}
        >
          Replace {label.toLowerCase()}
        </Button>
      </div>
    );
  return (
    <Field label={label}>
      <Input
        className="min-h-11"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function RuleReferenceField({
  value,
  onChange,
  label = "Definition",
  definitions = [],
  recordIds,
}: ValueProps<string>) {
  const index = definitions.findIndex((option) => option.id === value);
  return (
    <div className="space-y-2">
      <Field label={label}>
        <Select
          className="min-h-11"
          value={index < 0 ? "" : String(index)}
          onChange={(e) => {
            const next = definitions[Number(e.target.value)];
            if (
              next &&
              (value === undefined || value === "" || confirmed(label))
            )
              onChange(next.id);
          }}
        >
          <option value="" disabled>
            {value ? "Existing reference preserved" : "Choose a definition"}
          </option>
          {definitions.map((option, i) => (
            <option key={i} value={i}>
              {protectedComparisonText(option.label, recordIds)
                ? `Definition ${i + 1}`
                : option.label}
            </option>
          ))}
        </Select>
      </Field>
      {definitions.length === 0 && <p>No named definitions available.</p>}
    </div>
  );
}
function EnumField({
  value,
  onChange,
  label,
  options,
}: {
  value: unknown;
  onChange: (value: string) => void;
  label: string;
  options: readonly string[];
}) {
  return (
    <Field label={label}>
      <Select
        className="min-h-11"
        value={
          typeof value === "string" && options.includes(value) ? value : ""
        }
        onChange={(e) => {
          if (
            value === undefined ||
            options.includes(String(value)) ||
            confirmed(label)
          )
            onChange(e.target.value);
        }}
      >
        <option value="" disabled>
          {value === undefined
            ? "Choose an option"
            : "Existing value preserved"}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {ruleLabel(option)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
export function RuleListFields({
  value,
  onChange,
  label = "Entries",
  create,
  children,
}: ValueProps<JsonValue[]> & {
  create: () => JsonValue;
  children: (
    entry: JsonValue,
    change: (value: JsonValue) => void,
    index: number,
  ) => ReactNode;
}) {
  // Stable row keys keep an unfinished numeric JSON edit with its row on reorder.
  const [rowKeys, setRowKeys] = useState<number[]>(() =>
    Array.isArray(value) ? value.map((_, index) => index) : [],
  );
  if (value !== undefined && !Array.isArray(value))
    return <Preserved label={label} replace={() => onChange([])} />;
  const values = (value ?? []) as JsonValue[];
  return (
    <section className="min-w-0 space-y-3" aria-label={label}>
      <h4 className="font-semibold">{label}</h4>
      {values.length === 0 && <p>No entries.</p>}
      {values.map((entry, index) => (
        <Fieldset
          key={rowKeys[index] ?? index}
          className="min-w-0 space-y-3 rounded border p-3"
        >
          <Legend>
            {label} {index + 1}
          </Legend>
          {children(
            entry,
            (next) => onChange(values.map((v, i) => (i === index ? next : v))),
            index,
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              type="button"
              disabled={index === 0}
              onClick={() => {
                setRowKeys(moveRuleEntry(rowKeys, index, -1) as number[]);
                onChange(moveRuleEntry(values, index, -1));
              }}
            >
              Move up
            </Button>
            <Button
              className="min-h-11"
              type="button"
              disabled={index === values.length - 1}
              onClick={() => {
                setRowKeys(moveRuleEntry(rowKeys, index, 1) as number[]);
                onChange(moveRuleEntry(values, index, 1));
              }}
            >
              Move down
            </Button>
            <Button
              className="min-h-11"
              type="button"
              onClick={() => {
                if (
                  window.confirm(`Remove ${label.toLowerCase()} ${index + 1}?`)
                ) {
                  setRowKeys(rowKeys.filter((_, i) => i !== index));
                  onChange(values.filter((_, i) => i !== index));
                }
              }}
            >
              Remove entry
            </Button>
          </div>
        </Fieldset>
      ))}
      <Button
        className="min-h-11"
        type="button"
        onClick={() => {
          setRowKeys([...rowKeys, Math.max(-1, ...rowKeys) + 1]);
          onChange([...values, create()]);
        }}
      >
        Add {label.toLowerCase()}
      </Button>
    </section>
  );
}
function Preserved({ label, replace }: { label: string; replace: () => void }) {
  return (
    <div className="space-y-2">
      <Alert tone="warning">Existing {label.toLowerCase()} preserved.</Alert>
      <Button
        className="min-h-11"
        type="button"
        onClick={() => {
          if (confirmed(label)) replace();
        }}
      >
        Replace {label.toLowerCase()}
      </Button>
    </div>
  );
}

type Editor =
  | "number"
  | "text"
  | "boolean"
  | "reference"
  | "numeric"
  | "scalar"
  | "dice"
  | "test"
  | "json"
  | "numbers"
  | "operands"
  | "terms"
  | "modifiers"
  | readonly string[];
type Spec = {
  key: string;
  editor: Editor;
  optional?: boolean;
  initial?: JsonValue;
  label?: string;
};
const field = (
  key: string,
  editor: Editor,
  optional = false,
  initial?: JsonValue,
): Spec => ({ key, editor, optional, initial });
const n = (key: string, optional = false) => field(key, "number", optional);
const t = (key: string, optional = false) => field(key, "text", optional);
const ref = (key: string, optional = false) =>
  field(key, "reference", optional);
const actor = t("actor", true);
const expressionSpecs: Record<string, Spec[]> = {
  constant: [n("value")],
  path: [t("path"), n("fallback", true)],
  "attribute-modifier": [t("attribute"), actor],
  "proficiency-bonus": [actor, n("multiplier", true)],
  level: [ref("professionId", true), actor],
  resource: [t("resource"), actor],
  arithmetic: [
    field("operator", [
      "add",
      "subtract",
      "multiply",
      "divide",
      "floor",
      "ceil",
      "min",
      "max",
    ]),
    field("operands", "operands"),
  ],
  conditional: [
    t("predicate"),
    field("whenTrue", "numeric"),
    field("whenFalse", "numeric"),
  ],
  literal: [field("value", "json")],
  dice: [field("expression", "dice")],
  "attribute-score": [t("attribute"), actor],
  "skill-bonus": [ref("skillDefinitionId"), actor],
  "collection-count": [t("path")],
  lookup: [ref("table"), field("key", "scalar")],
  "choice-value": [t("choiceId")],
  "event-value": [t("path")],
};
function defaultField(spec: Spec): JsonValue {
  if (spec.initial !== undefined) return spec.initial;
  const e = spec.editor;
  if (Array.isArray(e)) return e[0] ?? "";
  if (e === "number") return 0;
  if (e === "boolean") return false;
  if (e === "numeric" || e === "scalar") return { kind: "constant", value: 0 };
  if (e === "dice") return { terms: [] };
  if (e === "test") return { kind: "attribute-check" };
  if (["numbers", "operands", "terms", "modifiers"].includes(String(e)))
    return [];
  return "";
}
function ObjectFields({
  value,
  onChange,
  specs,
  ...context
}: ValueProps & { specs: Spec[] }) {
  const data = mechanicsObject(value);
  return (
    <div className="min-w-0 space-y-4">
      {specs.map((spec) => {
        const label = spec.label ?? ruleLabel(spec.key.replace(/Id$/, ""));
        const change = (next: JsonValue) =>
          onChange({ ...data, [spec.key]: next });
        if (spec.optional && data[spec.key] === undefined)
          return (
            <Button
              key={spec.key}
              className="min-h-11"
              type="button"
              onClick={() => change(defaultField(spec))}
            >
              Add {label.toLowerCase()}
            </Button>
          );
        const props = {
          ...context,
          value: data[spec.key],
          onChange: change,
          label,
        };
        const editor = spec.editor;
        let input: ReactNode;
        if (Array.isArray(editor))
          input = <EnumField {...props} options={editor} />;
        else
          switch (editor) {
            case "number":
              input = <RuleNumberField {...props} />;
              break;
            case "text":
              input = <RuleTextField {...props} />;
              break;
            case "reference":
              input = <RuleReferenceField {...props} />;
              break;
            case "boolean":
              input = (
                <EnumField
                  {...props}
                  value={
                    typeof props.value === "boolean"
                      ? String(props.value)
                      : props.value
                  }
                  onChange={(v) => change(v === "true")}
                  options={["true", "false"]}
                />
              );
              break;
            case "numeric":
            case "scalar":
              input = (
                <ScalarExpressionFields
                  {...props}
                  numericOnly={editor === "numeric"}
                />
              );
              break;
            case "dice":
              input = <DiceExpressionFields {...props} />;
              break;
            case "test":
              input = <D20TestFields {...props} />;
              break;
            case "json":
              input = <JsonValueFields {...props} />;
              break;
            case "numbers":
              input = (
                <RuleListFields {...props} create={() => 0}>
                  {(entry, apply, i) => (
                    <RuleNumberField
                      value={entry}
                      onChange={apply}
                      label={`${label} ${i + 1}`}
                    />
                  )}
                </RuleListFields>
              );
              break;
            case "operands":
              input = (
                <RuleListFields
                  {...props}
                  create={() => newRuleExpression("constant")}
                >
                  {(entry, apply, i) => (
                    <ScalarExpressionFields
                      {...context}
                      value={entry}
                      onChange={apply}
                      numericOnly
                      label={`Operand ${i + 1}`}
                    />
                  )}
                </RuleListFields>
              );
              break;
            case "terms":
              input = (
                <RuleListFields
                  {...props}
                  create={() => ({ kind: "dice", count: 1, size: 6 })}
                >
                  {(entry, apply, i) => (
                    <RollTermFields
                      {...context}
                      value={entry}
                      onChange={apply}
                      label={`Term ${i + 1}`}
                    />
                  )}
                </RuleListFields>
              );
              break;
            case "modifiers":
              input = (
                <RuleListFields
                  {...props}
                  create={() => ({ kind: "keep-highest", count: 1 })}
                >
                  {(entry, apply) => (
                    <DiceModifierFields
                      {...context}
                      value={entry}
                      onChange={apply}
                    />
                  )}
                </RuleListFields>
              );
              break;
          }
        return (
          <section key={spec.key} className="min-w-0 space-y-2">
            {input}
            {spec.optional && (
              <Button
                className="min-h-11"
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove ${label.toLowerCase()}?`))
                    onChange(setRuleField(data, spec.key, undefined));
                }}
              >
                Remove {label.toLowerCase()}
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
function UnionFields({
  value,
  onChange,
  label = "Value",
  specs,
  initial,
  ...context
}: ValueProps & {
  specs: Record<string, Spec[]>;
  initial: (kind: string) => MechanicsObject;
}) {
  const data = mechanicsObject(value),
    kind = typeof data.kind === "string" ? data.kind : "",
    known = object(value) && Object.hasOwn(specs, kind);
  return (
    <Fieldset
      className="min-w-0 space-y-4 rounded border p-3"
      aria-label={label}
    >
      <Legend>{label}</Legend>
      <Field label={`${label} kind`}>
        <Select
          className="min-h-11"
          value={known ? kind : ""}
          onChange={(e) => {
            if (value === undefined || confirmed(label))
              onChange(
                replaceRuleKind(value, initial(e.target.value), [
                  "kind",
                  ...Object.values(specs)
                    .flat()
                    .map((s) => s.key),
                ]),
              );
          }}
        >
          <option value="" disabled>
            {value === undefined ? "Choose a kind" : "Existing value preserved"}
          </option>
          {Object.keys(specs).map((k) => (
            <option value={k} key={k}>
              {ruleLabel(k)}
            </option>
          ))}
        </Select>
      </Field>
      {known ? (
        <ObjectFields
          {...context}
          value={data}
          onChange={onChange}
          specs={specs[kind]!}
        />
      ) : (
        <p>Choose a kind to explicitly replace this value.</p>
      )}
    </Fieldset>
  );
}
export function ScalarExpressionFields({
  numericOnly = false,
  label = "Expression",
  ...props
}: ValueProps & { numericOnly?: boolean }) {
  const kinds = numericOnly ? numericExpressionKinds : scalarExpressionKinds;
  return (
    <UnionFields
      {...props}
      label={label}
      specs={Object.fromEntries(kinds.map((k) => [k, expressionSpecs[k]!]))}
      initial={newRuleExpression}
    />
  );
}
export function DiceExpressionFields({
  label = "Dice expression",
  ...props
}: ValueProps) {
  if (props.value !== undefined && !object(props.value))
    return (
      <Preserved label={label} replace={() => props.onChange({ terms: [] })} />
    );
  return (
    <Fieldset
      className="min-w-0 space-y-3 rounded border p-3"
      aria-label={label}
    >
      <Legend>{label}</Legend>
      <ObjectFields
        {...props}
        specs={[field("terms", "terms"), t("label", true)]}
      />
    </Fieldset>
  );
}
function RollTermFields({ label = "Term", ...props }: ValueProps) {
  const value = mechanicsObject(props.value);
  return (
    <div className="space-y-3">
      <EnumField
        label={`${label} type`}
        value={
          value.kind === "dice"
            ? "dice"
            : numericExpressionKinds.includes(
                  value.kind as (typeof numericExpressionKinds)[number],
                )
              ? "number"
              : ""
        }
        options={["dice", "number"]}
        onChange={(kind) => {
          if (confirmed(label))
            props.onChange(
              replaceRuleKind(
                value,
                kind === "dice"
                  ? { kind: "dice", count: 1, size: 6 }
                  : newRuleExpression("constant"),
                [
                  "kind",
                  "count",
                  "size",
                  "sign",
                  "modifiers",
                  "label",
                  ...Object.values(expressionSpecs)
                    .flat()
                    .map((spec) => spec.key),
                ],
              ),
            );
        }}
      />
      {value.kind === "dice" ? (
        <>
          <EnumField
            label="Count type"
            value={
              typeof value.count === "number" || value.count === ""
                ? "number"
                : "expression"
            }
            options={["number", "expression"]}
            onChange={(kind) => {
              if (confirmed("Dice count"))
                props.onChange({
                  ...value,
                  count: kind === "number" ? 1 : newRuleExpression("constant"),
                });
            }}
          />
          {typeof value.count === "number" || value.count === "" ? (
            <RuleNumberField
              label="Count"
              value={value.count}
              onChange={(count) => props.onChange({ ...value, count })}
            />
          ) : (
            <ScalarExpressionFields
              {...props}
              numericOnly
              label="Count"
              value={value.count}
              onChange={(count) => props.onChange({ ...value, count })}
            />
          )}
          <EnumField
            label="Sign"
            value={
              value.sign === undefined ? "unspecified" : String(value.sign)
            }
            options={["unspecified", "1", "-1"]}
            onChange={(v) =>
              props.onChange(
                setRuleField(
                  value,
                  "sign",
                  v === "unspecified" ? undefined : Number(v),
                ),
              )
            }
          />
          <ObjectFields
            {...props}
            specs={[
              n("size"),
              field("modifiers", "modifiers", true),
              t("label", true),
            ]}
          />
        </>
      ) : (
        <ScalarExpressionFields {...props} numericOnly label={label} />
      )}
    </div>
  );
}
const modifierSpecs: Record<string, Spec[]> = {
  "keep-highest": [n("count")],
  "keep-lowest": [n("count")],
  "drop-highest": [n("count")],
  "drop-lowest": [n("count")],
  reroll: [field("values", "numbers"), field("once", "boolean", true)],
  explode: [n("threshold", true), n("maximumExtraDice", true)],
  minimum: [n("value")],
  maximum: [n("value")],
};
function DiceModifierFields(props: ValueProps) {
  return (
    <UnionFields
      {...props}
      label="Dice modifier"
      specs={modifierSpecs}
      initial={(kind) => ({
        kind,
        ...Object.fromEntries(
          modifierSpecs[kind]!.filter((s) => !s.optional).map((s) => [
            s.key,
            defaultField(s),
          ]),
        ),
      })}
    />
  );
}
const testKinds = [
  "attribute-check",
  "saving-throw",
  "attack-roll",
  "death-saving-throw",
];
export function D20TestFields({ label = "D20 test", ...props }: ValueProps) {
  const specs = [
    t("attribute", true),
    ref("skillDefinitionId", true),
    t("proficiency", true),
    field("difficultyClass", "numeric", true),
    field("opposedBy", "test", true),
    field(
      "rollMode",
      [
        "normal",
        "advantage",
        "disadvantage",
        "super-advantage",
        "super-disadvantage",
      ],
      true,
    ),
    field(
      "ties",
      ["initiator-wins", "defender-wins", "reroll", "no-change"],
      true,
    ),
  ];
  const value = mechanicsObject(props.value);
  return (
    <>
      <UnionFields
        {...props}
        label={label}
        specs={Object.fromEntries(testKinds.map((kind) => [kind, specs]))}
        initial={(kind) => ({ kind })}
      />
      {testKinds.includes(String(value.kind)) &&
        ["criticalSuccessRange", "criticalFailureRange"].map((key) => (
          <section key={key} className="space-y-3">
            {value[key] === undefined ? (
              <Button
                className="min-h-11"
                type="button"
                onClick={() => props.onChange({ ...value, [key]: [20, 20] })}
              >
                Add {ruleLabel(key).toLowerCase()}
              </Button>
            ) : (
              <>
                {Array.isArray(value[key]) && value[key].length === 2 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[0, 1].map((index) => (
                      <RuleNumberField
                        key={index}
                        label={`${ruleLabel(key)} ${index === 0 ? "minimum" : "maximum"}`}
                        value={(value[key] as JsonValue[])[index]}
                        onChange={(next) =>
                          props.onChange({
                            ...value,
                            [key]: (value[key] as JsonValue[]).map(
                              (entry, i) => (i === index ? next : entry),
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Preserved
                    label={ruleLabel(key)}
                    replace={() =>
                      props.onChange({ ...value, [key]: [20, 20] })
                    }
                  />
                )}
                <Button
                  className="min-h-11"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Remove this critical range?"))
                      props.onChange(setRuleField(value, key, undefined));
                  }}
                >
                  Remove {ruleLabel(key).toLowerCase()}
                </Button>
              </>
            )}
          </section>
        ))}
    </>
  );
}
const durationSpecs: Record<string, Spec[]> = {
  instantaneous: [],
  "until-event": [t("event")],
  permanent: [field("neutralizable", "boolean", true)],
  measured: [
    n("amount"),
    field("unit", [
      "turn",
      "round",
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "year",
    ]),
  ],
  special: [t("description")],
};
export function DurationFields({ label = "Duration", ...props }: ValueProps) {
  return (
    <UnionFields
      {...props}
      label={label}
      specs={durationSpecs}
      initial={(kind) => ({
        kind,
        ...(kind === "measured"
          ? { amount: 1, unit: "round" }
          : kind === "until-event"
            ? { event: "" }
            : kind === "special"
              ? { description: "" }
              : {}),
      })}
    />
  );
}

export function JsonValueFields({
  label = "Value",
  recordIds = emptyIds,
  ...props
}: ValueProps<JsonValue>) {
  const { value, onChange } = props;
  const [newKey, setNewKey] = useState("");
  const [numberBlank, setNumberBlank] = useState(false);
  const kind =
    numberBlank && value === ""
      ? "number"
      : value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value === "object"
            ? "object"
            : typeof value;
  return (
    <Fieldset
      className="min-w-0 space-y-3 rounded border p-3"
      aria-label={label}
    >
      <Legend>{label}</Legend>
      <EnumField
        label={`${label} type`}
        value={kind}
        options={["string", "number", "boolean", "null", "array", "object"]}
        onChange={(type) => {
          if (value === undefined || confirmed(label)) {
            setNumberBlank(false);
            onChange(
              type === "string"
                ? ""
                : type === "number"
                  ? 0
                  : type === "boolean"
                    ? false
                    : type === "null"
                      ? null
                      : type === "array"
                        ? []
                        : {},
            );
          }
        }}
      />
      {kind === "string" && (
        <RuleTextField
          {...props}
          recordIds={recordIds}
          label={`${label} text`}
        />
      )}
      {kind === "number" && (
        <RuleNumberField
          value={value}
          onChange={(next) => {
            setNumberBlank(next === "");
            onChange(next);
          }}
          label={`${label} number`}
        />
      )}
      {kind === "boolean" && (
        <EnumField
          label={label}
          value={String(value)}
          options={["true", "false"]}
          onChange={(next) => onChange(next === "true")}
        />
      )}
      {kind === "null" && <p>Null value.</p>}
      {kind === "array" && (
        <RuleListFields
          {...props}
          recordIds={recordIds}
          label={`${label} entries`}
          create={() => ""}
        >
          {(entry, change, i) => (
            <JsonValueFields
              {...props}
              recordIds={recordIds}
              label={`Entry ${i + 1}`}
              value={entry}
              onChange={change}
            />
          )}
        </RuleListFields>
      )}
      {kind === "object" && object(value) && (
        <>
          {Object.entries(value).map(([key, entry], i) => (
            <section key={i} className="min-w-0 space-y-3 rounded border p-3">
              <RuleTextField
                value={key}
                label={`Field ${i + 1} name`}
                recordIds={recordIds}
                onChange={(next) => {
                  if (next === key || !Object.hasOwn(value, next))
                    onChange(renameJsonProperty(value, key, next));
                }}
              />
              <JsonValueFields
                {...props}
                recordIds={recordIds}
                label={`Field ${i + 1} value`}
                value={entry}
                onChange={(next) => onChange({ ...value, [key]: next })}
              />
              <Button
                className="min-h-11"
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove field ${i + 1}?`))
                    onChange(setRuleField(value, key, undefined));
                }}
              >
                Remove field
              </Button>
            </section>
          ))}
          <RuleTextField
            value={newKey}
            recordIds={recordIds}
            label="New field name"
            onChange={setNewKey}
          />
          <Button
            className="min-h-11"
            type="button"
            disabled={Object.hasOwn(value, newKey)}
            onClick={() => {
              onChange({ ...value, [newKey]: "" });
              setNewKey("");
            }}
          >
            Add field
          </Button>
          {Object.hasOwn(value, newKey) && (
            <p>A field already uses this name.</p>
          )}
        </>
      )}
    </Fieldset>
  );
}
