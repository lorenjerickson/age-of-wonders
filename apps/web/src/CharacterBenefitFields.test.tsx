import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorldDraftRecord } from "./api";
import { CharacterBenefitFields } from "./CharacterBenefitFields";
import {
  characterBenefitKinds,
  characterBenefitOptions,
  characterBenefitSummary,
  replaceCharacterBenefitReference,
} from "./characterBenefitModel";
import { characterAuthorRecord } from "./characterAuthoringModel";
import { mechanicsObject } from "./itemMechanicsModel";
vi.mock("@aow/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aow/ui")>()),
  Field: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div>
      {label}
      {children}
    </div>
  ),
}));
const records: WorldDraftRecord[] = [
  {
    resourceType: "world-conditions",
    sourceId: "secret-condition",
    payload: { id: "secret-condition", name: "Resolute" },
  },
  {
    resourceType: "world-effects",
    sourceId: "secret-effect",
    payload: { id: "secret-effect", name: "Steady hands" },
  },
];
describe("Profession and Background benefits", () => {
  it("shows named grants without exposing stored references or initializing absent lists", () => {
    const value = {
      grantedConditions: [
        { conditionId: "secret-condition", private: { keep: true } },
      ],
      grantedEffects: [{ effectId: "secret-effect" }],
    };
    const before = structuredClone(value);
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      <CharacterBenefitFields
        value={value}
        records={records}
        onChange={onChange}
      />,
    );
    expect(html).toContain("Resolute");
    expect(html).toContain("Steady hands");
    expect(html).not.toContain("secret-condition");
    expect(html).not.toContain("secret-effect");
    expect(value).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
    renderToStaticMarkup(
      <CharacterBenefitFields
        value={{}}
        records={records}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
  it("preserves unavailable references and unsupported grants until explicit replacement", () => {
    const value = {
      grantedConditions: [
        { conditionId: "secret-missing" },
        "unsupported-secret",
      ],
      grantedEffects: { private: "secret-value" },
    };
    const html = renderToStaticMarkup(
      <CharacterBenefitFields
        value={value}
        records={records}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("Existing reference preserved");
    expect(html).toContain("Existing grant preserved");
    expect(html).toContain("Existing granted effects preserved");
    for (const secret of [
      "secret-missing",
      "unsupported-secret",
      "secret-value",
    ])
      expect(html).not.toContain(secret);
    expect(() =>
      replaceCharacterBenefitReference(
        "unsupported",
        characterBenefitKinds[0],
        "new-reference",
      ),
    ).toThrow("explicitly");
  });
  it("excludes ambiguous choices and references selected by another grant", () => {
    expect(
      characterBenefitOptions(
        [...records, records[0]],
        characterBenefitKinds[0],
      ),
    ).toEqual([]);
    const html = renderToStaticMarkup(
      <CharacterBenefitFields
        value={{
          grantedConditions: [
            { conditionId: "secret-condition" },
            { conditionId: "" },
          ],
        }}
        records={records}
        onChange={vi.fn()}
      />,
    );
    expect(html.match(/>Resolute</g)).toHaveLength(1);
  });
  it.each(["profession", "background"] as const)(
    "preserves %s description, modifiers, grant metadata and private data across editing and reopening",
    (kind) => {
      const record: WorldDraftRecord = {
        resourceType: "definitions",
        sourceId: "owner",
        payload: {
          kind,
          identity: {
            id: "owner",
            name: "Artisan",
            description: "A patient craftsperson.",
            private: true,
          },
          components: {
            grantedConditions: [
              { conditionId: "old-condition", annotation: { keep: true } },
            ],
            grantedEffects: [{ effectId: "old-effect", private: [1, 2] }],
            modifierGrants: [{ private: true }],
            expertiseLevels: [
              {
                tier: "rank",
                benefits: {
                  modifierGrants: [{ id: "modifier", private: true }],
                },
              },
            ],
            private: { keep: true },
          },
          extensions: { keep: [3] },
        },
      };
      const payload = mechanicsObject(
        characterAuthorRecord([record], kind, "owner").payload,
      );
      const components = mechanicsObject(payload.components);
      const conditions = components.grantedConditions as unknown[];
      const effects = components.grantedEffects as unknown[];
      const edited = {
        ...record,
        payload: {
          ...payload,
          components: {
            ...components,
            grantedConditions: [
              replaceCharacterBenefitReference(
                conditions[0],
                characterBenefitKinds[0],
                "secret-condition",
              ),
            ],
            grantedEffects: [
              replaceCharacterBenefitReference(
                effects[0],
                characterBenefitKinds[1],
                "secret-effect",
              ),
            ],
          },
        },
      };
      const reopened = characterAuthorRecord(
        JSON.parse(JSON.stringify([edited])),
        kind,
        "owner",
      );
      expect(reopened).toEqual(edited);
      expect(reopened.payload).toMatchObject({
        identity: payload.identity,
        extensions: payload.extensions,
        components: {
          modifierGrants: components.modifierGrants,
          expertiseLevels: components.expertiseLevels,
          private: components.private,
          grantedConditions: [
            { conditionId: "secret-condition", annotation: { keep: true } },
          ],
          grantedEffects: [{ effectId: "secret-effect", private: [1, 2] }],
        },
      });
      expect(record.payload).toMatchObject({
        components: { grantedConditions: [{ conditionId: "old-condition" }] },
      });
    },
  );
  it("summarizes named grants and tier modifiers without leaking unavailable references", () => {
    expect(
      characterBenefitSummary(
        {
          modifierGrants: [{}],
          expertiseLevels: [{ benefits: { modifierGrants: [{}] } }],
          grantedConditions: [{ conditionId: "secret-condition" }],
          grantedEffects: [{ effectId: "unknown-secret" }],
        },
        records,
      ),
    ).toEqual([
      "2 modifiers",
      "Conditions: Resolute",
      "Effects: Unavailable effect",
    ]);
  });
});
