import { ScalarExpressionFields } from "./RuleValueFields";
import { Button, Field, Fieldset, Input, Legend, Select } from "@aow/ui";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { triggerEvents } from "./itemTraitTriggersModel";
import {
  newUsageLimit,
  replaceUsageLimitKind,
  usageLimitKinds,
  withoutUsageField,
} from "./triggerUsageLimitModel";
const text = (v: unknown) => (typeof v === "string" ? v : "");

export function TriggerUsageLimitFields({
  value,
  onChange,
  recordIds,
  definitions,
}: {
  value: MechanicsObject;
  onChange: (next: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const limit = mechanicsObject(value.limit);
  const change = (next: MechanicsObject) => onChange({ ...value, limit: next });
  const update = (key: string, next: MechanicsObject[string]) =>
    change({ ...limit, [key]: next });
  const numeric = (
    label: string,
    object: MechanicsObject,
    key: string,
    apply: (next: MechanicsObject) => void,
    required = true,
  ) => (
    <Field label={label} required={required}>
      <Input
        className="min-h-11"
        type="number"
        step="any"
        required={required}
        value={typeof object[key] === "number" ? (object[key] as number) : ""}
        onChange={(e) =>
          apply(
            e.target.value === ""
              ? withoutUsageField(object, key)
              : { ...object, [key]: e.target.valueAsNumber },
          )
        }
      />
    </Field>
  );
  const reference = (
    label: string,
    object: MechanicsObject,
    key: string,
    apply: (next: MechanicsObject) => void,
  ) => (
    <Field label={label}>
      {protectedComparisonText(object[key], recordIds) ? (
        <div className="space-y-3">
          <p>Existing reference preserved.</p>
          <Button
            className="min-h-11"
            type="button"
            onClick={() => {
              if (
                window.confirm(`Replace the existing ${label.toLowerCase()}?`)
              )
                apply({ ...object, [key]: "" });
            }}
          >
            Replace {label.toLowerCase()}
          </Button>
        </div>
      ) : (
        <Input
          className="min-h-11"
          value={text(object[key])}
          onChange={(e) => apply({ ...object, [key]: e.target.value })}
        />
      )}
    </Field>
  );
  const reset = text(limit.resetsOn),
    resetOptions = ["short", "long", ...triggerEvents];
  const homebrew = reset.startsWith("homebrew:");
  const rolls =
    Array.isArray(limit.succeedsOn) &&
    limit.succeedsOn.every((v) => typeof v === "number" || v === "")
      ? (limit.succeedsOn as (number | "")[])
      : undefined;
  return (
    <Fieldset className="space-y-4" aria-label="Usage limit">
      <Legend className="text-lg font-semibold">Usage limit</Legend>
      {value.limit === undefined ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => change(newUsageLimit("uses"))}
        >
          Add usage limit
        </Button>
      ) : (
        <>
          <Field label="Limit kind">
            <Select
              className="min-h-11"
              value={
                usageLimitKinds.some(([kind]) => kind === limit.kind)
                  ? text(limit.kind)
                  : ""
              }
              onChange={(e) => {
                if (
                  window.confirm(
                    "Replace this usage limit kind? Its current settings will be replaced.",
                  )
                )
                  change(replaceUsageLimitKind(value.limit, e.target.value));
              }}
            >
              <option value="" disabled>
                Advanced usage limit preserved
              </option>
              {usageLimitKinds.map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {limit.kind === "uses" && (
            <>
              <ScalarExpressionFields
                label="Maximum"
                value={limit.maximum}
                onChange={(next) => update("maximum", next)}
                recordIds={recordIds}
                definitions={definitions}
                numericOnly
              />
              <Field label="Resets on">
                <Select
                  className="min-h-11"
                  value={
                    homebrew
                      ? "homebrew"
                      : resetOptions.includes(reset) || !reset
                        ? reset
                        : "preserved"
                  }
                  onChange={(e) => {
                    const next = e.target.value;
                    if (
                      reset &&
                      !resetOptions.includes(reset) &&
                      !window.confirm("Replace the existing reset rule?")
                    )
                      return;
                    change(
                      next
                        ? {
                            ...limit,
                            resetsOn: next === "homebrew" ? "homebrew:" : next,
                          }
                        : withoutUsageField(limit, "resetsOn"),
                    );
                  }}
                >
                  <option value="">Not specified</option>
                  {resetOptions.map((event) => (
                    <option key={event} value={event}>
                      {event === "short"
                        ? "Short rest"
                        : event === "long"
                          ? "Long rest"
                          : event}
                    </option>
                  ))}
                  <option value="homebrew">Homebrew rest</option>
                  {reset && !homebrew && !resetOptions.includes(reset) && (
                    <option value="preserved" disabled>
                      Existing reset rule preserved
                    </option>
                  )}
                </Select>
              </Field>
              {homebrew &&
                reference(
                  "Homebrew rest name",
                  { name: reset.slice(9) },
                  "name",
                  (next) => update("resetsOn", `homebrew:${text(next.name)}`),
                )}
            </>
          )}
          {limit.kind === "recharge" && (
            <>
              {numeric("Recharge die", limit, "die", change)}
              <section className="space-y-3" aria-label="Successful rolls">
                <h3 className="font-semibold">Successful rolls</h3>
                {rolls ? (
                  <>
                    {!rolls.length && <p>No successful rolls yet.</p>}
                    <ol className="space-y-3">
                      {rolls.map((roll, index) => (
                        <li
                          className="space-y-3 rounded border p-3"
                          key={index}
                        >
                          <Field
                            label={`Successful roll ${index + 1}`}
                            required
                          >
                            <Input
                              type="number"
                              step="any"
                              className="min-h-11"
                              required
                              value={roll}
                              onChange={(e) => {
                                update(
                                  "succeedsOn",
                                  rolls.map((v, i) =>
                                    i === index
                                      ? e.target.value === ""
                                        ? ""
                                        : e.target.valueAsNumber
                                      : v,
                                  ),
                                );
                              }}
                            />
                          </Field>
                          <div className="flex flex-wrap gap-3">
                            {([-1, 1] as const).map((delta) => (
                              <Button
                                type="button"
                                className="min-h-11"
                                key={delta}
                                disabled={
                                  index + delta < 0 ||
                                  index + delta >= rolls.length
                                }
                                aria-label={`Move successful roll ${index + 1} ${delta < 0 ? "up" : "down"}`}
                                onClick={() => {
                                  const next = [...rolls];
                                  [next[index], next[index + delta]] = [
                                    next[index + delta],
                                    next[index],
                                  ];
                                  update("succeedsOn", next);
                                }}
                              >
                                {delta < 0 ? "Move up" : "Move down"}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              className="min-h-11"
                              aria-label={`Remove successful roll ${index + 1}`}
                              onClick={() => {
                                if (
                                  window.confirm("Remove this successful roll?")
                                )
                                  update(
                                    "succeedsOn",
                                    rolls.filter((_, i) => i !== index),
                                  );
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() => update("succeedsOn", [...rolls, 1])}
                    >
                      Add successful roll
                    </Button>
                  </>
                ) : (
                  <>
                    <p>Existing successful rolls preserved.</p>
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Replace the existing successful rolls?",
                          )
                        )
                          update("succeedsOn", []);
                      }}
                    >
                      Replace successful rolls
                    </Button>
                  </>
                )}
              </section>
            </>
          )}
          {limit.kind === "resource" &&
            reference("Resource binding", limit, "resource", change)}
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              if (window.confirm("Remove this usage limit?"))
                onChange(withoutUsageField(value, "limit"));
            }}
          >
            Remove usage limit
          </Button>
        </>
      )}
    </Fieldset>
  );
}
