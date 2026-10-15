import { useState, type ReactNode } from "react";
import type { JsonValue } from "@aow/common";
import { Alert, Button, Field, Select } from "@aow/ui";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import {
  RuleListFields,
  RuleNumberField,
  RuleReferenceField,
  RuleTextField,
  ScalarExpressionFields,
} from "./RuleValueFields";
import { TriggerUsageLimitFields } from "./TriggerUsageLimitFields";
import {
  type ProfessionRankOption,
  type ProfessionRuleType,
} from "./professionAuthoringModel";

type Props = {
  type: ProfessionRuleType;
  value: MechanicsObject;
  onChange: (next: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly { id: string; label: string }[];
  definitionsByKind?: Readonly<
    Record<string, readonly { id: string; label: string }[]>
  >;
  ranks?: readonly ProfessionRankOption[];
  attributes?: readonly ProfessionRankOption[];
  statistics?: readonly ProfessionRankOption[];
  renderCollection: (key: string, label: string) => ReactNode;
};
const confirmReplace = (label: string) =>
  window.confirm(
    `Replace ${label.toLowerCase()}? Existing settings will be replaced.`,
  );
function KindField({
  value,
  options,
  onChange,
  label,
}: {
  value: unknown;
  options: readonly string[];
  onChange: (next: string) => void;
  label: string;
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
            value === e.target.value ||
            confirmReplace(label)
          )
            onChange(e.target.value);
        }}
      >
        <option value="" disabled>
          Choose an option
        </option>
        {options.map((kind) => (
          <option key={kind} value={kind}>
            {kind.replaceAll("-", " ")}
          </option>
        ))}
      </Select>
    </Field>
  );
}
export function ProfessionAuthoringFields({
  type,
  value,
  onChange,
  recordIds,
  definitions = [],
  definitionsByKind = {},
  ranks = [],
  attributes = [],
  statistics = [],
  renderCollection: link,
}: Props) {
  const [resourceName, setResourceName] = useState("");
  const context = { recordIds, definitions };
  const set = (key: string, next: JsonValue) =>
    onChange({ ...value, [key]: next });
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const optional = (
    key: string,
    label: string,
    initial: JsonValue,
    children: ReactNode,
  ) =>
    value[key] === undefined ? (
      <Button
        className="min-h-11"
        type="button"
        onClick={() => set(key, initial)}
      >
        Add {label.toLowerCase()}
      </Button>
    ) : (
      <section className="space-y-3">
        {children}
        <Button
          className="min-h-11"
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${label.toLowerCase()}?`)) remove(key);
          }}
        >
          Remove {label.toLowerCase()}
        </Button>
      </section>
    );
  const number = (key: string, label: string) => (
    <RuleNumberField
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const text = (key: string, label: string) => (
    <RuleTextField
      {...context}
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const rank = (key: string, label: string) => (
    <RuleReferenceField
      {...context}
      definitions={ranks.map((r) => ({ id: r.key, label: r.name }))}
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const referenceOptions = (key: string) =>
    definitionsByKind[
      key === "mutuallyExclusiveWith"
        ? "profession"
        : key === "traitIds"
          ? "trait"
          : "action"
    ] ?? definitions;
  const reference = (key: string, label: string) => (
    <RuleReferenceField
      {...context}
      label={label}
      definitions={referenceOptions(key)}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  const refs = (key: string, label: string) => (
    <RuleListFields
      {...context}
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
      create={() => ""}
    >
      {(entry, change, i) => (
        <RuleReferenceField
          {...context}
          definitions={referenceOptions(key)}
          label={`${label} ${i + 1}`}
          value={entry}
          onChange={change}
        />
      )}
    </RuleListFields>
  );
  const numeric = (key: string, label: string) => (
    <ScalarExpressionFields
      {...context}
      numericOnly
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
    />
  );
  if (type === "profession")
    return (
      <div className="space-y-4">
        <p>
          Order expertise tiers from lowest to highest. Each tier uses a rank
          from this World’s adopted Model.
        </p>
        {link("expertiseLevels", "Expertise tiers")}
        {link("acquisition", "Acquisition")}
        {link("actions", "Action progressions")}
        {link("prerequisites", "Prerequisites")}
        {link("choices", "Choices")}
        {refs("mutuallyExclusiveWith", "Mutually exclusive Professions")}
      </div>
    );
  if (type === "profession-tier")
    return (
      <div className="space-y-4">
        {rank("tier", "Profession rank")}
        {number("rank", "Rank number")}
        {optional(
          "advancementPointCost",
          "Advancement point cost",
          { kind: "constant", value: 0 },
          numeric("advancementPointCost", "Advancement point cost"),
        )}
        {link("advancementWindow", "Advancement window")}
        {link("prerequisites", "Prerequisites")}
        {link("benefits", "Benefits")}
      </div>
    );
  if (type === "profession-benefits") {
    const maximums = mechanicsObject(value.resourceMaximums);
    const supported =
      value.resourceMaximums === undefined ||
      value.resourceMaximums === maximums;
    return (
      <div className="space-y-4">
        {link("modifierGrants", "Modifier grants")}
        {link("modifiers", "Rule modifiers")}
        {refs("traitIds", "Traits")}
        <section className="space-y-3">
          <h3 className="font-semibold">Resource maximums</h3>
          {!supported ? (
            <Alert tone="warning">Existing resource maximums preserved.</Alert>
          ) : (
            <>
              {Object.entries(maximums).map(([key, entry], i) => (
                <section className="space-y-3 rounded border p-3" key={key}>
                  <p>
                    {protectedComparisonText(key, recordIds)
                      ? `Resource ${i + 1}`
                      : key}
                  </p>
                  <ScalarExpressionFields
                    {...context}
                    label={`Resource maximum ${i + 1}`}
                    numericOnly
                    value={entry}
                    onChange={(next) =>
                      set("resourceMaximums", { ...maximums, [key]: next })
                    }
                  />
                  <Button
                    className="min-h-11"
                    type="button"
                    onClick={() => {
                      if (window.confirm("Remove this resource maximum?")) {
                        const next = { ...maximums };
                        delete next[key];
                        set("resourceMaximums", next);
                      }
                    }}
                  >
                    Remove resource maximum
                  </Button>
                </section>
              ))}
              <RuleTextField
                {...context}
                label="New resource name"
                value={resourceName}
                onChange={setResourceName}
              />
              <Button
                className="min-h-11"
                type="button"
                disabled={
                  !resourceName.trim() ||
                  Object.hasOwn(maximums, resourceName.trim())
                }
                onClick={() => {
                  set("resourceMaximums", {
                    ...maximums,
                    [resourceName.trim()]: { kind: "constant", value: 0 },
                  });
                  setResourceName("");
                }}
              >
                Add resource maximum
              </Button>
            </>
          )}
        </section>
      </div>
    );
  }
  if (type === "profession-acquisition")
    return (
      <div className="space-y-4">
        <KindField
          label="Acquisition method"
          value={value.kind}
          options={["character-creation", "during-play"]}
          onChange={(kind) =>
            onChange({
              kind,
              startingExpertise: value.startingExpertise ?? ranks[0]?.key ?? "",
            })
          }
        />
        {rank("startingExpertise", "Starting rank")}
        {value.kind === "character-creation" ? (
          link("choices", "Choices")
        ) : value.kind === "during-play" ? (
          <>
            {link("prerequisites", "Prerequisites")}
            {link("trainingDuration", "Training duration")}
            {optional(
              "trainingActionId",
              "Training Action",
              "",
              reference("trainingActionId", "Training Action"),
            )}
          </>
        ) : (
          <Alert tone="warning">Existing acquisition details preserved.</Alert>
        )}
      </div>
    );
  if (type === "profession-action")
    return (
      <div className="space-y-4">
        {reference("actionId", "Action")}
        {rank("unlocksAt", "Unlocks at rank")}
        {numeric("advancementPointsOnUse", "Advancement points on use")}
        <TriggerUsageLimitFields
          {...context}
          value={{
            ...(value.advancementLimit === undefined
              ? {}
              : { limit: value.advancementLimit }),
          }}
          onChange={(next) => {
            if (next.limit === undefined) remove("advancementLimit");
            else set("advancementLimit", next.limit);
          }}
        />
        {link("qualifyingUse", "Qualifying use")}
        {link("improvements", "Improvements")}
      </div>
    );
  if (type === "profession-improvement")
    return (
      <div className="space-y-4">
        {rank("atExpertise", "Improvement rank")}
        {optional(
          "description",
          "Description",
          "",
          text("description", "Description"),
        )}
        {optional(
          "replacementActionId",
          "Replacement Action",
          "",
          reference("replacementActionId", "Replacement Action"),
        )}
        {link("modifiers", "Rule modifiers")}
      </div>
    );
  if (type === "profession-window")
    return (
      <div className="space-y-4">
        <KindField
          label="Advancement window"
          value={value.kind}
          options={[
            "any-time",
            "minimum-character-level",
            "character-levels",
            "character-level-interval",
            "milestone",
            "custom",
          ]}
          onChange={(kind) =>
            onChange(
              kind === "minimum-character-level"
                ? { kind, level: 1 }
                : kind === "character-levels"
                  ? { kind, levels: [1] }
                  : kind === "character-level-interval"
                    ? { kind, firstLevel: 1, everyLevels: 1 }
                    : kind === "milestone"
                      ? { kind, milestone: "" }
                      : kind === "custom"
                        ? { kind, predicate: { kind: "always" } }
                        : { kind },
            )
          }
        />
        {value.kind === "minimum-character-level" &&
          number("level", "Minimum character level")}
        {value.kind === "character-levels" && (
          <RuleListFields
            {...context}
            label="Character levels"
            value={value.levels}
            onChange={(next) => set("levels", next)}
            create={() => 1}
          >
            {(entry, change, i) => (
              <RuleNumberField
                label={`Character level ${i + 1}`}
                value={entry}
                onChange={change}
              />
            )}
          </RuleListFields>
        )}
        {value.kind === "character-level-interval" && (
          <>
            {number("firstLevel", "First level")}
            {number("everyLevels", "Every levels")}
            {optional(
              "finalLevel",
              "Final level",
              1,
              number("finalLevel", "Final level"),
            )}
          </>
        )}
        {value.kind === "milestone" && text("milestone", "Milestone")}
        {value.kind === "custom" && link("predicate", "Predicate")}
      </div>
    );
  if (type === "modifier-grant") {
    const target = mechanicsObject(value.target);
    const targetKinds =
      value.kind === "skill-proficiency"
        ? ["skill-check"]
        : value.kind === "roll-dice"
          ? ["skill-check", "roll"]
          : [
              "health-maximum",
              "attribute",
              "statistic",
              "skill-check",
              "roll",
              "speed",
            ];
    const targetSet = (key: string, next: JsonValue) =>
      set("target", { ...target, [key]: next });
    const namedTarget = (
      key: string,
      label: string,
      options: readonly ProfessionRankOption[],
    ) => (
      <RuleReferenceField
        {...context}
        label={label}
        value={target[key]}
        definitions={options.map((o) => ({ id: o.key, label: o.name }))}
        onChange={(next) => targetSet(key, next)}
      />
    );
    return (
      <div className="space-y-4">
        {text("label", "Modifier name")}
        <KindField
          label="Benefit"
          value={value.kind}
          options={["rolled-flat", "roll-dice", "skill-proficiency"]}
          onChange={(kind) =>
            onChange({
              ...value,
              kind,
              target:
                kind === "rolled-flat"
                  ? { kind: "health-maximum" }
                  : { kind: "skill-check", skillDefinitionId: "" },
            })
          }
        />
        <KindField
          label="Target"
          value={target.kind}
          options={targetKinds}
          onChange={(kind) =>
            set("target", {
              kind,
              ...(kind === "roll"
                ? { roll: "hit" }
                : kind === "speed"
                  ? { movementMode: "walk", unit: "foot" }
                  : {}),
            })
          }
        />
        {target.kind === "attribute" &&
          namedTarget("attribute", "Attribute", attributes)}
        {target.kind === "statistic" &&
          namedTarget("key", "Statistic", statistics)}
        {target.kind === "skill-check" && (
          <RuleReferenceField
            {...context}
            label="Skill"
            definitions={definitionsByKind.skill ?? definitions}
            value={target.skillDefinitionId}
            onChange={(next) => targetSet("skillDefinitionId", next)}
          />
        )}
        {target.kind === "roll" && (
          <KindField
            label="Roll"
            value={target.roll}
            options={["hit", "defense", "damage"]}
            onChange={(next) => targetSet("roll", next)}
          />
        )}
        {target.kind === "speed" && (
          <>
            <RuleTextField
              {...context}
              label="Movement mode"
              value={target.movementMode}
              onChange={(next) => targetSet("movementMode", next)}
            />
            <KindField
              label="Distance unit"
              value={target.unit}
              options={["foot", "mile", "square", "hex", "meter", "kilometer"]}
              onChange={(next) => targetSet("unit", next)}
            />
          </>
        )}
        <p>Every distinct grant adds to existing benefits.</p>
        <RuleListFields
          {...context}
          label="Dice groups"
          value={value.dice}
          onChange={(next) => set("dice", next)}
          create={() => ({ count: 1, sides: 4 })}
        >
          {(entry, change, i) => {
            const die = mechanicsObject(entry);
            return entry !== die ? (
              <Alert tone="warning">Existing dice group preserved.</Alert>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <RuleNumberField
                  label={`Dice count ${i + 1}`}
                  value={die.count}
                  onChange={(next) => change({ ...die, count: next })}
                />
                <RuleNumberField
                  label={`Die sides ${i + 1}`}
                  value={die.sides}
                  onChange={(next) => change({ ...die, sides: next })}
                />
              </div>
            );
          }}
        </RuleListFields>
      </div>
    );
  }
  return null;
}
