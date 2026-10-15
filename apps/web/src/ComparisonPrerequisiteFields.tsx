import { Field, Select } from "@aow/ui";
import { type MechanicsObject } from "./itemMechanicsModel";
import { comparisonOperators } from "./comparisonPrerequisiteModel";
import { ScalarExpressionFields } from "./RuleValueFields";
export function OperandFields({
  side,
  operand,
  onChange,
  recordIds,
  definitions,
}: {
  side: string;
  operand: unknown;
  onChange: (value: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  return (
    <ScalarExpressionFields
      label={`${side} operand`}
      value={operand}
      onChange={onChange}
      recordIds={recordIds}
      definitions={definitions}
    />
  );
}
export function ComparisonPrerequisiteFields({
  value,
  onChange,
  recordIds,
  definitions,
}: {
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
}) {
  const operator = typeof value.operator === "string" ? value.operator : "";
  return (
    <div className="space-y-4">
      <Field label="Comparison operator" required>
        <Select
          required
          className="min-h-11"
          value={Object.hasOwn(comparisonOperators, operator) ? operator : ""}
          onChange={(e) => onChange({ ...value, operator: e.target.value })}
        >
          <option value="" disabled>
            Select comparison operator
          </option>
          {Object.entries(comparisonOperators).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        {(["left", "right"] as const).map((side) => (
          <OperandFields
            key={side}
            side={side === "left" ? "Left" : "Right"}
            operand={value[side]}
            recordIds={recordIds}
            definitions={definitions}
            onChange={(next) => onChange({ ...value, [side]: next })}
          />
        ))}
      </div>
    </div>
  );
}
