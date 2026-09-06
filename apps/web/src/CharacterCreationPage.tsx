import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FieldLabel,
  HelpText,
  SelectField,
  StatusIndicator,
  TextInput,
  TextareaField,
} from "@aow/ui";
import {
  createPlayerCharacter,
  getCharacterOptions,
  getPlayerCharacter,
  listPlayerCharacters,
  logout,
  rollPlayerCharacterAttributes,
  submitPlayerCharacterForReview,
  updatePlayerCharacterSelections,
} from "./api";
import {
  characterDisplayName,
  type CharacterDraft,
  type CharacterOptions,
  type CharacterSelections,
  selectionsComplete,
} from "./characterCreationModel";
import { InternalLink, useInternalNavigate } from "./navigation";

function CharacterRoster({
  campaignInstanceId,
  campaignInstanceName,
  characters,
}: {
  campaignInstanceId: string;
  campaignInstanceName: string;
  characters: CharacterDraft[];
}) {
  const navigate = useInternalNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { character } = await createPlayerCharacter(
        campaignInstanceId,
        name.trim(),
      );
      await navigate(
        `/play/instances/${encodeURIComponent(campaignInstanceId)}/characters/${encodeURIComponent(character.id)}`,
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not create the character.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section>
        <h2 className="text-2xl font-semibold">
          Your characters in {campaignInstanceName}
        </h2>
        {characters.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {characters.map((character) => (
              <li key={character.id}>
                <InternalLink
                  href={`/play/instances/${encodeURIComponent(campaignInstanceId)}/characters/${encodeURIComponent(character.id)}`}
                  className="card border border-base-300 bg-base-200 transition hover:border-primary"
                >
                  <div className="card-body gap-2 p-5">
                    <h3 className="font-semibold">
                      {characterDisplayName(character)}
                    </h3>
                    <p className="text-sm text-base-content/55">
                      {character.status === "complete"
                        ? "Approved by the Game Master"
                        : character.status === "ready-for-review"
                          ? "Awaiting Game Master review"
                          : "Creation in progress"}
                    </p>
                  </div>
                </InternalLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-box border border-dashed border-base-300 p-6 text-base-content/55">
            Create your first character to begin campaign onboarding.
          </p>
        )}
      </section>
      <form
        className="card h-fit border border-primary/20 bg-primary/[0.06]"
        onSubmit={create}
      >
        <div className="card-body gap-4">
          <h2 className="card-title">Create another character</h2>
          <TextInput
            required
            label="Character name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Name or working title"
          />
          {message && <Alert tone="error">{message}</Alert>}
          <Button
            type="submit"
            tone="primary"
            loading={busy}
            disabled={!name.trim()}
          >
            Create character
          </Button>
        </div>
      </form>
    </div>
  );
}

function ChoiceSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: CharacterOptions["backgrounds"];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <SelectField
      required
      disabled={disabled}
      label={label}
      help={selected?.description}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      <option value="">Choose {label.toLowerCase()}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </SelectField>
  );
}

function CharacterDraftEditor({
  campaignInstanceId,
  characterId,
}: {
  campaignInstanceId: string;
  characterId: string;
}) {
  const [draft, setDraft] = useState<CharacterDraft>();
  const [options, setOptions] = useState<CharacterOptions>();
  const [selections, setSelections] = useState<CharacterSelections>({
    heritageIds: [],
  });
  const [name, setName] = useState("");
  const [attributeAssignments, setAttributeAssignments] = useState<
    Record<string, number>
  >({});
  const [startingEquipmentIds, setStartingEquipmentIds] = useState<string[]>(
    [],
  );
  const [biography, setBiography] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.all([
      getPlayerCharacter(campaignInstanceId, characterId),
      getCharacterOptions(campaignInstanceId),
    ]).then(
      ([{ character }, result]) => {
        setDraft(character);
        setName(character.name ?? "");
        setSelections({ heritageIds: [], ...character.selections });
        setAttributeAssignments(character.attributeAssignments);
        setStartingEquipmentIds(character.startingEquipmentIds);
        setBiography(character.biography ?? "");
        setOptions(result);
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load character creation.",
        ),
    );
  }, [campaignInstanceId, characterId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !selectionsComplete(selections)) return;
    setBusy(true);
    setMessage("");
    try {
      const { character } = await updatePlayerCharacterSelections(
        campaignInstanceId,
        draft,
        selections,
        name.trim(),
        { attributeAssignments, startingEquipmentIds, biography },
      );
      setDraft(character);
      setName(character.name ?? "");
      setSelections({ heritageIds: [], ...character.selections });
      setAttributeAssignments(character.attributeAssignments);
      setStartingEquipmentIds(character.startingEquipmentIds);
      setBiography(character.biography ?? "");
      setMessage("Choices saved. You can safely return later.");
    } catch (caught) {
      if (
        caught instanceof Error &&
        caught.message.includes("reload and retry")
      ) {
        const { character } = await getPlayerCharacter(
          campaignInstanceId,
          characterId,
        );
        setDraft(character);
        setName(character.name ?? "");
        setSelections({ heritageIds: [], ...character.selections });
        setMessage(
          "This draft changed elsewhere. The latest saved version is now loaded.",
        );
        return;
      }
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not save your choices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rollAttributes() {
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const { character } = await rollPlayerCharacterAttributes(
        campaignInstanceId,
        draft,
      );
      setDraft(character);
      setAttributeAssignments({});
      setMessage(
        "Attribute rolls generated. Assign one to every Attribute and leave two unused.",
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not generate Attribute rolls.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!draft || !selectionsComplete(selections)) return;
    setBusy(true);
    setMessage("");
    try {
      const { character: saved } = await updatePlayerCharacterSelections(
        campaignInstanceId,
        draft,
        selections,
        name.trim(),
        { attributeAssignments, startingEquipmentIds, biography },
      );
      const { character } = await submitPlayerCharacterForReview(
        campaignInstanceId,
        saved,
      );
      setDraft(character);
      setMessage("Submitted to your Game Master for review.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not submit the Character for review.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!draft || !options)
    return (
      <StatusIndicator
        tone={message ? "error" : "info"}
        pulse={!message}
        label={message || "Loading character…"}
      />
    );
  const maximumHeritages = options.maximumHeritages ?? 1;
  const heritageIds = selections.heritageIds ?? [];
  const editable = draft.status === "in-progress";
  const rollCounts = draft.attributeRolls.reduce<Map<number, number>>(
    (counts, score) => counts.set(score, (counts.get(score) ?? 0) + 1),
    new Map(),
  );

  return (
    <form className="grid gap-6" onSubmit={save}>
      <div>
        <InternalLink
          href={`/play/instances/${encodeURIComponent(campaignInstanceId)}/characters`}
          className="text-sm text-primary"
        >
          ← All characters
        </InternalLink>
        <h1 className="mt-3 text-3xl font-semibold">
          {characterDisplayName(draft)}
        </h1>
        <p className="mt-2 text-base-content/55">
          Complete the captured choices and Attributes for this Campaign
          Instance. Your saved work remains available between visits.
        </p>
      </div>
      {draft.status === "ready-for-review" && (
        <Alert>
          Awaiting Game Master review. Your submitted sheet is locked.
        </Alert>
      )}
      {draft.status === "complete" && (
        <Alert tone="success">
          Your Game Master approved this Character. It is ready for activation.
        </Alert>
      )}
      {draft.reviewNote && (
        <Alert tone={editable ? "warning" : "info"}>
          Game Master note: {draft.reviewNote}
        </Alert>
      )}
      <section className="card border border-base-300 bg-base-200 shadow-xl">
        <div className="card-body grid gap-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              First step
            </p>
            <h2 className="card-title mt-2">Identity and vocation</h2>
          </div>
          <TextInput
            required
            disabled={!editable}
            label="Character name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Name or working title"
          />
          {options.backgrounds.length === 0 ||
          options.professions.length === 0 ||
          options.heritages.length === 0 ? (
            <Alert tone="warning">
              Character choices are not configured for this campaign yet. Ask
              the GM to add background, profession, and heritage options.
            </Alert>
          ) : null}
          <ChoiceSelect
            label="Background"
            value={selections.backgroundId ?? ""}
            options={options.backgrounds}
            disabled={!editable}
            onChange={(backgroundId) =>
              setSelections({ ...selections, backgroundId })
            }
          />
          <ChoiceSelect
            label="Profession"
            value={selections.professionId ?? ""}
            options={options.professions}
            disabled={!editable}
            onChange={(professionId) =>
              setSelections({ ...selections, professionId })
            }
          />
          <div role="group" aria-labelledby="heritage-options-label">
            <FieldLabel id="heritage-options-label">Heritage</FieldLabel>
            <HelpText>Choose up to {maximumHeritages}.</HelpText>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {options.heritages.map((option) => {
                const checked = heritageIds.includes(option.id);
                const disabled =
                  !checked && heritageIds.length >= maximumHeritages;
                return (
                  <div
                    key={option.id}
                    className="rounded-box border border-base-300 bg-base-100 p-3"
                  >
                    <Checkbox
                      label={option.name}
                      help={option.description}
                      className="mt-1"
                      checked={checked}
                      disabled={disabled || !editable}
                      onChange={() =>
                        setSelections({
                          ...selections,
                          heritageIds: checked
                            ? heritageIds.filter((id) => id !== option.id)
                            : [...heritageIds, option.id],
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t border-base-300 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="card-title">Attributes</h2>
                <HelpText>
                  The captured Character model determines this editable list.
                  Generate {options.attributeRollCount} rolls, assign one to
                  every Attribute, and leave two unused.
                </HelpText>
              </div>
              {editable && (
                <Button
                  type="button"
                  tone="outline"
                  disabled={busy}
                  onClick={() => void rollAttributes()}
                >
                  {draft.attributeRolls.length ? "Reroll" : "Generate rolls"}
                </Button>
              )}
            </div>
            {draft.attributeRolls.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {options.attributes.map((attribute) => {
                  const current = attributeAssignments[attribute.id];
                  const usedByOthers = Object.entries(attributeAssignments)
                    .filter(([id]) => id !== attribute.id)
                    .reduce<Map<number, number>>(
                      (counts, [, score]) =>
                        counts.set(score, (counts.get(score) ?? 0) + 1),
                      new Map(),
                    );
                  const values = [...new Set(draft.attributeRolls)];
                  return (
                    <SelectField
                      key={attribute.id}
                      required
                      disabled={!editable}
                      label={attribute.name}
                      value={current ?? ""}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value);
                        setAttributeAssignments((assignments) => ({
                          ...assignments,
                          [attribute.id]: value,
                        }));
                      }}
                    >
                      <option value="">Assign a roll</option>
                      {values.map((score) => (
                        <option
                          key={score}
                          value={score}
                          disabled={
                            score !== current &&
                            (usedByOthers.get(score) ?? 0) >=
                              (rollCounts.get(score) ?? 0)
                          }
                        >
                          {score}
                        </option>
                      ))}
                    </SelectField>
                  );
                })}
              </div>
            )}
          </div>
          {options.startingEquipment.length > 0 && (
            <div className="border-t border-base-300 pt-6">
              <FieldLabel>Starting equipment</FieldLabel>
              <HelpText>Choose any equipment granted at creation.</HelpText>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {options.startingEquipment.map((option) => (
                  <Checkbox
                    key={option.id}
                    label={option.name}
                    help={option.description}
                    checked={startingEquipmentIds.includes(option.id)}
                    disabled={!editable}
                    onChange={() =>
                      setStartingEquipmentIds((ids) =>
                        ids.includes(option.id)
                          ? ids.filter((id) => id !== option.id)
                          : [...ids, option.id],
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}
          <TextareaField
            disabled={!editable}
            label="Biography"
            help="Optional public Character background and notes."
            maxLength={4_000}
            value={biography}
            onChange={(event) => setBiography(event.currentTarget.value)}
          />
          {message && <Alert>{message}</Alert>}
          {editable && (
            <div className="card-actions justify-end">
              <Button
                type="submit"
                tone="primary"
                loading={busy}
                disabled={!name.trim() || !selectionsComplete(selections)}
              >
                Save and continue later
              </Button>
              <Button
                type="button"
                tone="primary"
                loading={busy}
                disabled={!name.trim() || !selectionsComplete(selections)}
                onClick={() => void submitForReview()}
              >
                Submit for review
              </Button>
            </div>
          )}
        </div>
      </section>
    </form>
  );
}

export function CharacterCreationPage({
  campaignInstanceId,
  characterId,
}: {
  campaignInstanceId: string;
  characterId?: string;
}) {
  const navigate = useInternalNavigate();
  const [characters, setCharacters] = useState<CharacterDraft[]>();
  const [campaignInstanceName, setCampaignInstanceName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (characterId) return;
    void listPlayerCharacters(campaignInstanceId).then(
      ({ campaignInstanceName: instanceName, characters: result }) => {
        setCampaignInstanceName(instanceName);
        setCharacters(result);
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load your characters.",
        ),
    );
  }, [campaignInstanceId, characterId]);

  return (
    <main className="min-h-dvh bg-base-100 text-base-content">
      <header className="border-b border-base-300 bg-base-200/70 px-5 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Player workshop
            </p>
            <p className="font-semibold">Character creation</p>
          </div>
          <Button
            type="button"
            tone="ghost"
            size="sm"
            onClick={() =>
              void logout().finally(() => navigate("/join", { replace: true }))
            }
          >
            Sign out
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {characterId ? (
          <CharacterDraftEditor
            campaignInstanceId={campaignInstanceId}
            characterId={characterId}
          />
        ) : characters ? (
          <CharacterRoster
            campaignInstanceId={campaignInstanceId}
            campaignInstanceName={campaignInstanceName || "this Campaign"}
            characters={characters}
          />
        ) : (
          <StatusIndicator
            tone={message ? "error" : "info"}
            pulse={!message}
            label={message || "Loading characters…"}
          />
        )}
      </div>
    </main>
  );
}
