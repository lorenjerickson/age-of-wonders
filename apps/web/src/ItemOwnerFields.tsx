import type { ReactNode } from "react";
import type { JsonValue } from "@aow/common";
import { Button, Field, Select } from "@aow/ui";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import {
  DiceExpressionFields,
  ScalarExpressionFields,
  RuleNumberField,
  RuleTextField,
  RuleReferenceField,
} from "./RuleValueFields";
import { setRuleField } from "./ruleValueModel";
import type { ItemOwnerType } from "./itemOwnerModel";
export function ItemOwnerFields({
  type,
  value,
  onChange,
  recordIds,
  definitions,
  itemDefinitions,
  renderCollection,
}: {
  type: ItemOwnerType;
  value: MechanicsObject;
  onChange: (v: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions: readonly { id: string; label: string }[];
  itemDefinitions: readonly { id: string; label: string }[];
  renderCollection: (key: string, label: string) => ReactNode;
}) {
  const shared = { recordIds, definitions };
  const update = (key: string, next: JsonValue | undefined) =>
    onChange(setRuleField(value, key, next));
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
        onClick={() => update(key, initial)}
      >
        Add {label.toLowerCase()}
      </Button>
    ) : (
      <section className="space-y-3 rounded border p-3">
        <h3 className="font-semibold">{label}</h3>
        {fields}
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            if (window.confirm(`Remove ${label.toLowerCase()}?`))
              update(key, undefined);
          }}
        >
          Remove {label.toLowerCase()}
        </Button>
      </section>
    );
  const flag = (key: string, label: string, required = false) => (
    <Field label={label}>
      <Select
        className="min-h-11"
        value={typeof value[key] === "boolean" ? String(value[key]) : ""}
        onChange={(e) =>
          update(
            key,
            e.target.value === "" ? undefined : e.target.value === "true",
          )
        }
      >
        <option value="" disabled={required}>
          {value[key] === undefined
            ? "Not specified"
            : typeof value[key] !== "boolean"
              ? "Existing value preserved"
              : "Not specified"}
        </option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    </Field>
  );
  const expression = (key: string, label: string, numericOnly = true) => (
    <ScalarExpressionFields
      {...shared}
      label={label}
      value={value[key]}
      numericOnly={numericOnly}
      onChange={(v) => update(key, v)}
    />
  );
  if (type === "attunement")
    return (
      <>
        {flag("required", "Requires attunement", true)}
        {flag("countsAgainstLimit", "Counts against attunement limit")}
        {renderCollection("prerequisites", "Prerequisites")}
      </>
    );
  if (type === "capacity") {
    const recharge = mechanicsObject(value.recharge),
      amount = recharge.amount;
    const mode =
      amount &&
      typeof amount === "object" &&
      !Array.isArray(amount) &&
      "kind" in amount
        ? "expression"
        : "dice";
    const validRecharge =
      value.recharge === undefined || value.recharge === recharge;
    return (
      <>
        {expression("maximum", "Maximum")}
        {flag("destroyedWhenEmpty", "Destroyed when empty")}
        {optional(
          "recharge",
          "Recharge",
          { timing: "dawn", amount: { kind: "constant", value: 0 } },
          validRecharge ? (
            <>
              <Field label="Recharge timing">
                <Select
                  className="min-h-11"
                  value={
                    typeof recharge.timing === "string" &&
                    [
                      "dawn",
                      "dusk",
                      "short-rest",
                      "long-rest",
                      "custom",
                    ].includes(recharge.timing)
                      ? recharge.timing
                      : ""
                  }
                  onChange={(e) =>
                    update("recharge", { ...recharge, timing: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Existing timing preserved
                  </option>
                  {["dawn", "dusk", "short-rest", "long-rest", "custom"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v.replaceAll("-", " ")}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
              <Field label="Recharge amount mode">
                <Select
                  className="min-h-11"
                  value={mode}
                  onChange={(e) => {
                    if (
                      window.confirm(
                        "Replace recharge amount? Existing amount settings will be replaced.",
                      )
                    )
                      update("recharge", {
                        ...recharge,
                        amount:
                          e.target.value === "dice"
                            ? { terms: [] }
                            : { kind: "constant", value: 0 },
                      });
                  }}
                >
                  <option value="expression">Numeric expression</option>
                  <option value="dice">Dice</option>
                </Select>
              </Field>
              {mode === "dice" ? (
                <DiceExpressionFields
                  {...shared}
                  label="Recharge amount"
                  value={amount}
                  onChange={(v) =>
                    update("recharge", { ...recharge, amount: v })
                  }
                />
              ) : (
                <ScalarExpressionFields
                  {...shared}
                  numericOnly
                  label="Recharge amount"
                  value={amount}
                  onChange={(v) =>
                    update("recharge", { ...recharge, amount: v })
                  }
                />
              )}
            </>
          ) : (
            <p>
              Existing recharge preserved. Remove it explicitly before replacing
              it.
            </p>
          ),
        )}
      </>
    );
  }
  if (type === "crafting")
    return (
      <>
        {expression("time", "Crafting time")}
        {optional(
          "check",
          "Crafting check",
          "",
          <RuleTextField
            {...shared}
            label="Crafting check"
            value={value.check}
            onChange={(v) => update("check", v)}
          />,
        )}
        {renderCollection("cost", "Cost")}
        {renderCollection("ingredients", "Ingredients")}
        {renderCollection("toolProficiencies", "Tool proficiencies")}
        {renderCollection("produces", "Products")}
      </>
    );
  if (type === "ingredient" || type === "product")
    return (
      <>
        {type === "ingredient" ? (
          <>
            {optional(
              "itemId",
              "Ingredient Item",
              "",
              <RuleReferenceField
                {...shared}
                definitions={itemDefinitions}
                label="Ingredient Item"
                value={value.itemId}
                onChange={(v) => update("itemId", v)}
              />,
            )}
            {optional(
              "tag",
              "Ingredient tag",
              "",
              <RuleTextField
                {...shared}
                label="Ingredient tag"
                value={value.tag}
                onChange={(v) => update("tag", v)}
              />,
            )}
          </>
        ) : (
          <RuleReferenceField
            {...shared}
            definitions={itemDefinitions}
            label="Produced Item"
            value={value.itemId}
            onChange={(v) => update("itemId", v)}
          />
        )}
        {expression("quantity", "Quantity", type === "product")}
        {type === "ingredient" && flag("consumed", "Consumed", true)}
      </>
    );
  if (type === "currency")
    return (
      <>
        <RuleTextField
          {...shared}
          label="Denomination"
          value={value.denomination}
          onChange={(v) => update("denomination", v)}
        />
        <RuleNumberField
          label="Amount"
          value={value.amount}
          onChange={(v) => update("amount", v)}
        />
      </>
    );
  return null;
}
