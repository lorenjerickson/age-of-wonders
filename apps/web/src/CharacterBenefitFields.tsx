import { Alert, Button } from "@aow/ui";
import type { WorldDraftRecord } from "./api";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { RuleListFields, RuleReferenceField } from "./RuleValueFields";
import {
  characterBenefitKinds,
  characterBenefitOptions,
  replaceCharacterBenefitReference,
} from "./characterBenefitModel";

export function CharacterBenefitFields({
  value,
  onChange,
  records,
}: {
  value: MechanicsObject;
  onChange: (value: MechanicsObject) => void;
  records: readonly WorldDraftRecord[];
}) {
  const recordIds = new Set(records.map((record) => record.sourceId));
  return (
    <section
      className="min-w-0 space-y-4 rounded border border-base-300 p-4"
      aria-label="Condition and Effect grants"
    >
      <h2 className="text-lg font-semibold">Condition and Effect grants</h2>
      <p className="text-sm text-base-content/65">
        Optionally grant named Conditions or reusable Effects from this World.
        Leave these empty when the option has no such benefits.
      </p>
      {characterBenefitKinds.map((kind) => {
        const options = characterBenefitOptions(records, kind);
        const grants = value[kind.key];
        return (
          <RuleListFields
            key={kind.key}
            recordIds={recordIds}
            label={`Granted ${kind.noun}s`}
            value={grants}
            onChange={(next) => onChange({ ...value, [kind.key]: next })}
            create={() => ({ [kind.reference]: "" })}
          >
            {(entry, change, index) => {
              const grant = mechanicsObject(entry);
              if (grant !== entry)
                return (
                  <div className="space-y-3">
                    <Alert tone="warning">
                      Existing grant preserved. Replace it explicitly to choose
                      a {kind.noun.toLowerCase()}.
                    </Alert>
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Replace this unsupported grant? Its existing data will be replaced.",
                          )
                        )
                          change({ [kind.reference]: "" });
                      }}
                    >
                      Replace grant
                    </Button>
                  </div>
                );
              const available = options.filter(
                (option) =>
                  !Array.isArray(grants) ||
                  !grants.some(
                    (other, otherIndex) =>
                      otherIndex !== index &&
                      mechanicsObject(other)[kind.reference] === option.id,
                  ),
              );
              return (
                <RuleReferenceField
                  recordIds={recordIds}
                  label={`${kind.noun} grant ${index + 1}`}
                  value={grant[kind.reference]}
                  definitions={available}
                  onChange={(id) =>
                    change(replaceCharacterBenefitReference(entry, kind, id))
                  }
                />
              );
            }}
          </RuleListFields>
        );
      })}
    </section>
  );
}
