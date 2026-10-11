import { Fieldset, Legend } from "@aow/ui";
import { Button, Input, Label, Select, Textarea } from "@aow/ui";
import type {
  WorldRule,
  WorldRuleEffect,
  WorldRuleExpression,
  WorldRulePredicate,
} from "@aow/common";

const zero: WorldRuleExpression = { kind: "constant", value: 0 };
const actor: WorldRuleExpression = { kind: "context", key: "actorId" };
const defaults: Record<WorldRuleExpression["kind"], WorldRuleExpression> = {
  constant: zero,
  literal: { kind: "literal", value: "" },
  context: actor,
  local: { kind: "local", key: "cost" },
  state: {
    kind: "state",
    scope: "runtime",
    entity: actor,
    field: "aow:movementRemaining",
  },
  arithmetic: { kind: "arithmetic", operator: "add", operands: [zero, zero] },
  "query-count": {
    kind: "query-count",
    scope: "runtime",
    entityType: "actor",
    field: "locationId",
    equals: { kind: "context", key: "locationId" },
  },
};
const kinds = {
  constant: "Number",
  literal: "Literal value",
  context: "Event context",
  local: "Local value",
  state: "Entity field",
  arithmetic: "Arithmetic",
  "query-count": "Count matching entities",
};
function TextControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Label>
      {label}
      <Input
        className="mt-1 w-full"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Label>
  );
}
function ExpressionEditor({
  value,
  onChange,
  label,
  depth = 0,
}: {
  value: WorldRuleExpression;
  onChange: (value: WorldRuleExpression) => void;
  label: string;
  depth?: number;
}) {
  if (depth > 8)
    return (
      <p className="text-sm">
        Deeply nested value preserved. Simplify its parent to edit here.
      </p>
    );
  const child = (
    v: WorldRuleExpression,
    change: (v: WorldRuleExpression) => void,
    name: string,
  ) => (
    <ExpressionEditor
      value={v}
      onChange={change}
      label={name}
      depth={depth + 1}
    />
  );
  return (
    <Fieldset className="min-w-0 rounded-box border border-base-300 p-3">
      <Legend className="px-1 text-sm font-medium">{label}</Legend>
      <Label>
        Value source
        <Select
          className="mt-1 w-full"
          value={value.kind}
          onChange={(event) =>
            onChange(
              defaults[
                event.currentTarget.value as WorldRuleExpression["kind"]
              ],
            )
          }
        >
          {Object.entries(kinds).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </Select>
      </Label>
      <div className="mt-3 grid gap-3">
        {value.kind === "constant" && (
          <Label>
            Number
            <Input
              type="number"
              step="any"
              className="mt-1 w-full"
              value={value.value}
              onChange={(event) =>
                onChange({ ...value, value: event.currentTarget.valueAsNumber })
              }
            />
          </Label>
        )}
        {value.kind === "literal" && (
          <>
            <Label>
              Literal type
              <Select
                className="mt-1 w-full"
                value={typeof value.value}
                onChange={(event) =>
                  onChange({
                    ...value,
                    value:
                      event.currentTarget.value === "boolean"
                        ? false
                        : event.currentTarget.value === "number"
                          ? 0
                          : "",
                  })
                }
              >
                <option value="string">Text</option>
                <option value="number">Number</option>
                <option value="boolean">True or false</option>
                {typeof value.value === "object" && (
                  <option value="object">Structured value (preserved)</option>
                )}
              </Select>
            </Label>
            {typeof value.value === "string" && (
              <TextControl
                label="Text"
                value={value.value}
                onChange={(text) => onChange({ ...value, value: text })}
              />
            )}
            {typeof value.value === "number" && (
              <Label>
                Number
                <Input
                  type="number"
                  step="any"
                  value={value.value}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      value: event.currentTarget.valueAsNumber,
                    })
                  }
                />
              </Label>
            )}
            {typeof value.value === "boolean" && (
              <Label>
                Value
                <Select
                  value={String(value.value)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      value: event.currentTarget.value === "true",
                    })
                  }
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </Select>
              </Label>
            )}
            {typeof value.value === "object" && (
              <p className="text-sm opacity-65">
                The existing structured value is preserved. Select another
                source to replace it.
              </p>
            )}
          </>
        )}
        {(value.kind === "context" || value.kind === "local") && (
          <TextControl
            label={
              value.kind === "context" ? "Event context field" : "Local name"
            }
            value={value.key}
            onChange={(key) => onChange({ ...value, key })}
          />
        )}
        {(value.kind === "state" || value.kind === "query-count") && (
          <Label>
            State scope
            <Select
              value={value.scope}
              className="mt-1 w-full"
              onChange={(event) =>
                onChange({
                  ...value,
                  scope: event.currentTarget.value as "runtime" | "captured",
                })
              }
            >
              <option value="runtime">Instance runtime</option>
              <option value="captured">Captured definitions</option>
            </Select>
          </Label>
        )}
        {value.kind === "state" && (
          <>
            {child(
              value.entity,
              (entity) => onChange({ ...value, entity }),
              "Entity binding",
            )}
            <TextControl
              label="Field"
              value={value.field}
              onChange={(field) => onChange({ ...value, field })}
            />
          </>
        )}
        {value.kind === "query-count" && (
          <>
            <TextControl
              label="Entity type"
              value={value.entityType}
              onChange={(entityType) => onChange({ ...value, entityType })}
            />
            <TextControl
              label="Matching field"
              value={value.field}
              onChange={(field) => onChange({ ...value, field })}
            />
            {child(
              value.equals,
              (equals) => onChange({ ...value, equals }),
              "Equals",
            )}
          </>
        )}
        {value.kind === "arithmetic" && (
          <>
            <Label>
              Operation
              <Select
                value={value.operator}
                className="mt-1 w-full"
                onChange={(event) =>
                  onChange({
                    ...value,
                    operator: event.currentTarget
                      .value as typeof value.operator,
                  })
                }
              >
                {["add", "subtract", "multiply", "divide", "min", "max"].map(
                  (op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ),
                )}
              </Select>
            </Label>
            {value.operands.map((operand, index) => (
              <div key={index}>
                {child(
                  operand,
                  (next) =>
                    onChange({
                      ...value,
                      operands: value.operands.map((entry, i) =>
                        i === index ? next : entry,
                      ),
                    }),
                  "Operand " + (index + 1),
                )}
                <Button
                  size="sm"
                  tone="ghost"
                  disabled={value.operands.length <= 2}
                  onClick={() =>
                    onChange({
                      ...value,
                      operands: value.operands.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove operand {index + 1}
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              tone="outline"
              onClick={() =>
                onChange({ ...value, operands: [...value.operands, zero] })
              }
            >
              Add operand
            </Button>
          </>
        )}
      </div>
    </Fieldset>
  );
}
const predicates: Record<WorldRulePredicate["kind"], WorldRulePredicate> = {
  always: { kind: "always" },
  never: { kind: "never" },
  all: { kind: "all", predicates: [{ kind: "always" }] },
  any: { kind: "any", predicates: [{ kind: "always" }] },
  not: { kind: "not", predicate: { kind: "always" } },
  compare: { kind: "compare", left: zero, operator: "eq", right: zero },
};
function ConditionEditor({
  value,
  onChange,
  depth = 0,
}: {
  value: WorldRulePredicate;
  onChange: (value: WorldRulePredicate) => void;
  depth?: number;
}) {
  if (depth > 8)
    return (
      <p className="text-sm">
        Nested condition preserved. Simplify its parent to edit here.
      </p>
    );
  return (
    <Fieldset className="grid min-w-0 gap-3 rounded-box border border-base-300 p-3">
      <Label>
        Condition
        <Select
          className="mt-1 w-full"
          value={value.kind}
          onChange={(event) =>
            onChange(
              predicates[
                event.currentTarget.value as WorldRulePredicate["kind"]
              ],
            )
          }
        >
          {Object.entries({
            always: "Always",
            never: "Never",
            all: "All conditions",
            any: "Any condition",
            not: "Not",
            compare: "Compare values",
          }).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </Select>
      </Label>
      {(value.kind === "all" || value.kind === "any") && (
        <>
          {value.predicates.map((predicate, index) => (
            <div key={index}>
              <ConditionEditor
                value={predicate}
                onChange={(next) =>
                  onChange({
                    ...value,
                    predicates: value.predicates.map((entry, i) =>
                      i === index ? next : entry,
                    ),
                  })
                }
                depth={depth + 1}
              />
              <Button
                size="sm"
                tone="ghost"
                onClick={() =>
                  onChange({
                    ...value,
                    predicates: value.predicates.filter((_, i) => i !== index),
                  })
                }
              >
                Remove condition {index + 1}
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            tone="outline"
            onClick={() =>
              onChange({
                ...value,
                predicates: [...value.predicates, { kind: "always" }],
              })
            }
          >
            Add condition
          </Button>
        </>
      )}
      {value.kind === "not" && (
        <ConditionEditor
          value={value.predicate}
          onChange={(predicate) => onChange({ ...value, predicate })}
          depth={depth + 1}
        />
      )}
      {value.kind === "compare" && (
        <>
          <ExpressionEditor
            label="Left value"
            value={value.left}
            onChange={(left) => onChange({ ...value, left })}
          />
          <Label>
            Comparison
            <Select
              className="mt-1 w-full"
              value={value.operator}
              onChange={(event) =>
                onChange({
                  ...value,
                  operator: event.currentTarget.value as typeof value.operator,
                })
              }
            >
              {Object.entries({
                eq: "Equals",
                ne: "Does not equal",
                lt: "Less than",
                lte: "At most",
                gt: "Greater than",
                gte: "At least",
              }).map(([op, label]) => (
                <option key={op} value={op}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
          <ExpressionEditor
            label="Right value"
            value={value.right}
            onChange={(right) => onChange({ ...value, right })}
          />
        </>
      )}
    </Fieldset>
  );
}
function defaultRuleEffect(kind: WorldRuleEffect["kind"]): WorldRuleEffect {
  if (kind === "set-local") return { kind, key: "cost", value: zero };
  if (kind === "emit")
    return { kind, event: "aow:movement-costed", context: { actorId: actor } };
  if (kind === "roll")
    return {
      kind,
      count: 1,
      sides: 6,
      resultEvent: "aow:roll-result",
      context: { actorId: actor },
    };
  return {
    kind,
    target: {
      entity: actor,
      field: kind === "move" ? "position" : "aow:movementRemaining",
    },
    value: kind === "move" ? { kind: "context", key: "destination" } : zero,
  };
}
function EffectEditor({
  value,
  onChange,
}: {
  value: WorldRuleEffect;
  onChange: (value: WorldRuleEffect) => void;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <Label>
        Effect type
        <Select
          className="mt-1 w-full"
          value={value.kind}
          onChange={(event) =>
            onChange(
              defaultRuleEffect(
                event.currentTarget.value as WorldRuleEffect["kind"],
              ),
            )
          }
        >
          {["set", "increment", "move", "set-local", "emit", "roll"].map(
            (kind) => (
              <option value={kind} key={kind}>
                {kind.replaceAll("-", " ")}
              </option>
            ),
          )}
        </Select>
      </Label>
      {"target" in value && (
        <>
          <ExpressionEditor
            label="Target entity"
            value={value.target.entity}
            onChange={(entity) =>
              onChange({ ...value, target: { ...value.target, entity } })
            }
          />
          <TextControl
            label="Target field"
            value={value.target.field}
            onChange={(field) =>
              onChange({ ...value, target: { ...value.target, field } })
            }
          />
        </>
      )}
      {value.kind === "set-local" && (
        <TextControl
          label="Local name"
          value={value.key}
          onChange={(key) => onChange({ ...value, key })}
        />
      )}
      {"value" in value && (
        <ExpressionEditor
          label="Effect value"
          value={value.value}
          onChange={(next) => onChange({ ...value, value: next })}
        />
      )}
      {(value.kind === "emit" || value.kind === "roll") && (
        <>
          {value.kind === "emit" ? (
            <TextControl
              label="Emitted event"
              value={value.event}
              onChange={(event) => onChange({ ...value, event })}
            />
          ) : (
            <>
              <Label>
                Dice count
                <Input
                  type="number"
                  min="1"
                  value={value.count}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      count: event.currentTarget.valueAsNumber,
                    })
                  }
                />
              </Label>
              <Label>
                Dice sides
                <Input
                  type="number"
                  min="2"
                  value={value.sides}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      sides: event.currentTarget.valueAsNumber,
                    })
                  }
                />
              </Label>
              <TextControl
                label="Result event"
                value={value.resultEvent}
                onChange={(resultEvent) => onChange({ ...value, resultEvent })}
              />
            </>
          )}
          {Object.entries(value.context).map(([key, expression], index) => (
            <Fieldset
              className="grid gap-2 rounded-box border border-base-300 p-3"
              key={index}
            >
              <TextControl
                label="Context field name"
                value={key}
                onChange={(next) =>
                  onChange({
                    ...value,
                    context: Object.fromEntries(
                      Object.entries(value.context).map(([name, entry]) => [
                        name === key ? next : name,
                        entry,
                      ]),
                    ),
                  })
                }
              />
              <ExpressionEditor
                label="Context binding"
                value={expression}
                onChange={(next) =>
                  onChange({
                    ...value,
                    context: { ...value.context, [key]: next },
                  })
                }
              />
              <Button
                size="sm"
                tone="ghost"
                onClick={() =>
                  onChange({
                    ...value,
                    context: Object.fromEntries(
                      Object.entries(value.context).filter(
                        ([name]) => name !== key,
                      ),
                    ),
                  })
                }
              >
                Remove context field
              </Button>
            </Fieldset>
          ))}
          <Button
            size="sm"
            tone="outline"
            onClick={() => {
              let key = "field";
              while (key in value.context) key += "_";
              onChange({
                ...value,
                context: { ...value.context, [key]: zero },
              });
            }}
          >
            Add context field
          </Button>
        </>
      )}
    </div>
  );
}
export function WorldRuleEditor({
  rule,
  onChange,
}: {
  rule: WorldRule;
  onChange: (rule: WorldRule) => void;
}) {
  const move = (index: number, offset: number) => {
    const effects = [...rule.effects];
    [effects[index], effects[index + offset]] = [
      effects[index + offset]!,
      effects[index]!,
    ];
    onChange({ ...rule, effects });
  };
  return (
    <div className="grid min-w-0 gap-5">
      <TextControl
        label="Rule name"
        value={rule.name}
        onChange={(name) => onChange({ ...rule, name })}
      />
      <Label>
        Description
        <Textarea
          className="mt-1 w-full"
          value={rule.description ?? ""}
          onChange={(event) =>
            onChange({ ...rule, description: event.currentTarget.value })
          }
        />
      </Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label>
          Lifecycle
          <Select
            className="mt-1 w-full"
            value={rule.lifecycle}
            onChange={(event) =>
              onChange({
                ...rule,
                lifecycle: event.currentTarget.value as WorldRule["lifecycle"],
              })
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="archived">Archived</option>
          </Select>
        </Label>
        <Label>
          Scheduling priority
          <Input
            type="number"
            step="1"
            className="mt-1 w-full"
            value={rule.priority}
            onChange={(event) =>
              onChange({ ...rule, priority: event.currentTarget.valueAsNumber })
            }
          />
        </Label>
      </div>
      <p className="text-xs opacity-65">
        Lower priorities execute first. Same-priority rules share a stage;
        conflicting writes fail.
      </p>
      <section>
        <h3 className="mb-3 text-lg font-semibold">When this event occurs</h3>
        <TextControl
          label="Trigger event"
          value={rule.trigger.event}
          onChange={(event) =>
            onChange({ ...rule, trigger: { ...rule.trigger, event } })
          }
        />
        <p className="mt-2 text-xs opacity-65">
          Version {rule.trigger.version}. Use a namespaced event such as
          aow:movement-declared.
        </p>
      </section>
      <section>
        <h3 className="mb-3 text-lg font-semibold">Conditions</h3>
        <ConditionEditor
          value={rule.condition ?? { kind: "always" }}
          onChange={(condition) => onChange({ ...rule, condition })}
        />
      </section>
      <section>
        <h3 className="mb-3 text-lg font-semibold">Ordered effects</h3>
        <ol className="grid gap-4">
          {rule.effects.map((effect, index) => (
            <li key={index} className="rounded-box border border-base-300 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="mr-auto font-semibold">
                  Effect {index + 1}
                </span>
                <Button
                  size="sm"
                  tone="outline"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Move up
                </Button>
                <Button
                  size="sm"
                  tone="outline"
                  disabled={index === rule.effects.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Move down
                </Button>
                <Button
                  size="sm"
                  tone="ghost"
                  onClick={() =>
                    onChange({
                      ...rule,
                      effects: rule.effects.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove effect
                </Button>
              </div>
              <EffectEditor
                value={effect}
                onChange={(next) =>
                  onChange({
                    ...rule,
                    effects: rule.effects.map((entry, i) =>
                      i === index ? next : entry,
                    ),
                  })
                }
              />
            </li>
          ))}
        </ol>
        <Button
          className="mt-3"
          tone="outline"
          onClick={() =>
            onChange({
              ...rule,
              effects: [...rule.effects, defaultRuleEffect("set-local")],
            })
          }
        >
          Add effect
        </Button>
      </section>
    </div>
  );
}
