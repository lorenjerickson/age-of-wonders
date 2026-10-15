import { useState, type ReactNode } from "react";
import type { JsonValue } from "@aow/common";
import { Button } from "@aow/ui";
import type { MechanicsObject } from "./itemMechanicsModel";
import {
  RuleTextField,
  RuleReferenceField,
  RuleNumberField,
  RuleListFields,
} from "./RuleValueFields";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { ruleLabel, setRuleField, renameJsonProperty } from "./ruleValueModel";
import {
  characterOptionFieldChildren,
  type CharacterOptionFieldType,
} from "./characterOptionFieldsModel";

type NamedDefinition = { id: string; label: string };
type Props = {
  type: CharacterOptionFieldType;
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  recordIds: ReadonlySet<string>;
  definitions?: readonly NamedDefinition[];
  itemDefinitions?: readonly NamedDefinition[];
  skillDefinitions?: readonly NamedDefinition[];
  featDefinitions?: readonly NamedDefinition[];
  attributeDefinitions?: readonly NamedDefinition[];
  renderCollection: (key: string, label: string) => ReactNode;
};
const confirmReplace = (label: string) =>
  window.confirm(
    `Replace ${label.toLowerCase()}? Existing settings will be replaced.`,
  );
function Preserved({ label, replace }: { label: string; replace: () => void }) {
  return (
    <div className="space-y-2">
      <p>Existing {label.toLowerCase()} preserved.</p>
      <Button
        type="button"
        className="min-h-11"
        onClick={() => {
          if (confirmReplace(label)) replace();
        }}
      >
        Replace {label.toLowerCase()}
      </Button>
    </div>
  );
}
export function CharacterOptionFields({
  type,
  value,
  onChange,
  recordIds,
  definitions = [],
  itemDefinitions = definitions,
  skillDefinitions = definitions,
  featDefinitions = definitions,
  attributeDefinitions = [],
  renderCollection,
}: Props) {
  const [newCategory, setNewCategory] = useState("");
  const context = { recordIds, definitions };
  const set = (key: string, next: JsonValue | undefined) =>
    onChange(setRuleField(value, key, next));
  const number = (key: string, label = ruleLabel(key)) =>
    value[key] !== undefined &&
    typeof value[key] !== "number" &&
    value[key] !== "" ? (
      <Preserved label={label} replace={() => set(key, 0)} />
    ) : (
      <RuleNumberField
        label={label}
        value={value[key]}
        onChange={(next) => set(key, next)}
      />
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
        Add {label.toLowerCase()}
      </Button>
    ) : (
      <section className="space-y-3">
        {fields}
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            if (window.confirm(`Remove ${label.toLowerCase()}?`))
              set(key, undefined);
          }}
        >
          Remove {label.toLowerCase()}
        </Button>
      </section>
    );
  const list = (
    key: string,
    label: string,
    kind: "text" | "reference" = "text",
    options = definitions,
  ) => (
    <RuleListFields
      {...context}
      label={label}
      value={value[key]}
      onChange={(next) => set(key, next)}
      create={() => ""}
    >
      {(entry, change, index) =>
        kind === "reference" ? (
          <RuleReferenceField
            {...context}
            definitions={options}
            label={`${label} ${index + 1}`}
            value={entry}
            onChange={change}
          />
        ) : (
          <RuleTextField
            {...context}
            label={`${label} ${index + 1}`}
            value={entry}
            onChange={change}
          />
        )
      }
    </RuleListFields>
  );
  const children = () =>
    Object.keys(characterOptionFieldChildren[type]).map((key) => (
      <section key={key}>{renderCollection(key, ruleLabel(key))}</section>
    ));
  if (type === "background")
    return (
      <div className="space-y-4">
        {list(
          "attributeOptions",
          "Attribute options",
          "reference",
          attributeDefinitions,
        )}
        {list(
          "skillProficiencyIds",
          "Skill proficiencies",
          "reference",
          skillDefinitions,
        )}
        {list("toolProficiencies", "Tool proficiencies")}
        {optional(
          "languageChoices",
          "Language choices",
          0,
          number("languageChoices"),
        )}
        {list(
          "startingEquipment",
          "Starting equipment",
          "reference",
          itemDefinitions,
        )}
        {optional(
          "featId",
          "Feat",
          "",
          <RuleReferenceField
            {...context}
            label="Feat"
            definitions={featDefinitions}
            value={value.featId}
            onChange={(next) => set("featId", next)}
          />,
        )}
        {list("featureIds", "Features", "reference")}
        {children()}
      </div>
    );
  if (type === "background-characteristics")
    return (
      <div className="space-y-4">
        {Object.entries(value).map(([key, entries], index) => (
          <section key={index} className="space-y-3 rounded border p-3">
            <RuleTextField
              {...context}
              label={`Category ${index + 1} name`}
              value={key}
              onChange={(next) => {
                let name = next;
                // The protected text control explicitly confirms replacement
                // with an empty string; give that category a safe editable name.
                if (!next && protectedComparisonText(key, recordIds)) {
                  let number = index + 1;
                  do {
                    name = `Category ${number++}`;
                  } while (Object.hasOwn(value, name));
                }
                if (
                  name.trim() &&
                  (name === key || !Object.hasOwn(value, name))
                )
                  onChange(renameJsonProperty(value, key, name));
              }}
            />
            <RuleListFields
              {...context}
              label={`Category ${index + 1} suggestions`}
              value={entries}
              onChange={(next) => set(key, next)}
              create={() => ""}
            >
              {(entry, change, i) => (
                <RuleTextField
                  {...context}
                  label={`Suggestion ${i + 1}`}
                  value={entry}
                  onChange={change}
                />
              )}
            </RuleListFields>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                if (window.confirm(`Remove category ${index + 1}?`))
                  set(key, undefined);
              }}
            >
              Remove category
            </Button>
          </section>
        ))}
        <RuleTextField
          {...context}
          label="New category name"
          value={newCategory}
          onChange={setNewCategory}
        />
        <Button
          type="button"
          className="min-h-11"
          disabled={!newCategory.trim() || Object.hasOwn(value, newCategory)}
          onClick={() => {
            set(newCategory, []);
            setNewCategory("");
          }}
        >
          Add category
        </Button>
      </div>
    );
  return null;
}
