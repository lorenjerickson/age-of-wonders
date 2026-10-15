import { CharacterCreation } from "@aow/domain";
import { useBlocker } from "@tanstack/react-router";
import { CharacterEquipment } from "./CharacterEquipment";
import { MediaImage } from "./MediaImage";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  SelectField,
  StatusIndicator,
  TextInput,
  TextareaField,
} from "@aow/ui";
import {
  createPlayerCharacter,
  generateCharacterPortrait,
  getCharacterOptions,
  getMyAuthenticationProviders,
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
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value);
  const matches = options.filter((option) =>
    `${option.name} ${option.description ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-xl font-semibold">{label}</h2>
      <div className="min-h-24 rounded-box bg-base-100 p-5">
        <p className="text-xs uppercase text-base-content/55">Your selection</p>
        <p className="mt-2 font-semibold">
          {selected?.name || "None selected"}
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            label={`Search ${label.toLowerCase()}s`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <Button
          type="button"
          tone="ghost"
          className="min-h-11"
          onClick={() => setQuery("")}
        >
          Clear
        </Button>
      </div>
      <div
        className="space-y-3"
        role="group"
        aria-label={`Choose ${label.toLowerCase()}`}
      >
        {matches.map((option) => (
          <Button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`block h-auto min-h-11 w-full whitespace-normal rounded-box border p-5 text-left transition ${value === option.id ? "border-primary bg-primary/10" : "border-base-300 bg-base-100 hover:border-primary"}`}
          >
            <span className="block text-lg font-semibold">{option.name}</span>
            {option.description && (
              <span className="mt-2 block text-sm text-base-content/65">
                {option.description}
              </span>
            )}
          </Button>
        ))}
        {!matches.length && (
          <p className="py-3 text-sm text-base-content/60">
            No matching {label.toLowerCase()}s.
          </p>
        )}
      </div>
    </section>
  );
}

export function CharacterDraftEditor({
  campaignInstanceId,
  characterId,
  campaignDefinitionId,
}: {
  campaignInstanceId: string;
  characterId: string;
  campaignDefinitionId?: string;
}) {
  const [step, setStep] = useState(0);
  const [stepsOpen, setStepsOpen] = useState(false);
  const stepTrigger = useRef<HTMLButtonElement>(null);
  const steps = [
    "Name & Bio",
    "Background & Profession",
    "Quirks",
    "Attributes",
    "Equipment",
    "Artwork",
  ];
  const titles = [
    "Name your character and tell their story",
    "Choose a background and profession",
    "What makes your character distinctive?",
    "Roll your attributes",
    "Choose your equipment",
    "Create your character artwork",
  ];
  const descriptions = [
    "Give your character a name and a biography.",
    "Choose exactly one of each to shape your character.",
    "Structured quirks are not available for this character yet.",
    "Reveal your rolls, then assign them to attributes.",
    "Equip items in compatible slots or keep them in your pack.",
    "Create and review each image before attaching it to your character.",
  ];
  function chooseStep(next: number) {
    setStep(next);
    setStepsOpen(false);
    stepTrigger.current?.focus();
  }
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
  const [imageAssetIds, setImageAssetIds] = useState<Record<string, string>>(
    {},
  );
  const [artDirection, setArtDirection] = useState("");
  const [artPreviews, setArtPreviews] = useState<Record<string, string>>({});
  const [equipmentAssignments, setEquipmentAssignments] = useState<
    Record<string, string[]>
  >({});
  const portraitRequest = useRef<
    { fingerprint: string; key: string } | undefined
  >(undefined);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useBlocker({
    shouldBlockFn: () =>
      busy ||
      ((dirty || Object.keys(artPreviews).length > 0) &&
        !window.confirm(
          "Leave without saving Character changes or artwork previews?",
        )),
    enableBeforeUnload: dirty || busy || Object.keys(artPreviews).length > 0,
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.all([
      getPlayerCharacter(campaignInstanceId, characterId, campaignDefinitionId),
      getCharacterOptions(campaignInstanceId, campaignDefinitionId),
    ]).then(
      ([{ character }, result]) => {
        setDraft(character);
        setName(character.name ?? "");
        setSelections({ heritageIds: [], ...character.selections });
        setAttributeAssignments(character.attributeAssignments);
        setStartingEquipmentIds(character.startingEquipmentIds);
        setBiography(character.biography ?? "");
        setImageAssetIds(character.imageAssetIds ?? {});
        setEquipmentAssignments(character.equipmentAssignments ?? {});
        setOptions(result);
      },
      (caught: unknown) =>
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load character creation.",
        ),
    );
  }, [campaignInstanceId, characterId, campaignDefinitionId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || !name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const { character } = await updatePlayerCharacterSelections(
        campaignInstanceId,
        draft,
        selections,
        name.trim(),
        {
          attributeAssignments,
          startingEquipmentIds,
          biography,
          imageAssetIds,
          equipmentAssignments,
        },
        campaignDefinitionId,
      );
      setDraft(character);
      setName(character.name ?? "");
      setSelections({ heritageIds: [], ...character.selections });
      setAttributeAssignments(character.attributeAssignments);
      setStartingEquipmentIds(character.startingEquipmentIds);
      setBiography(character.biography ?? "");
      setImageAssetIds(character.imageAssetIds ?? {});
      setEquipmentAssignments(character.equipmentAssignments ?? {});
      setDirty(false);
      setMessage("Choices saved. You can safely return later.");
    } catch (caught) {
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
        campaignDefinitionId,
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
        {
          attributeAssignments,
          startingEquipmentIds,
          biography,
          imageAssetIds,
          equipmentAssignments,
        },
        campaignDefinitionId,
      );
      setDraft(saved);
      setDirty(false);
      const { character } = await submitPlayerCharacterForReview(
        campaignInstanceId,
        saved,
        campaignDefinitionId,
      );
      setDraft(character);
      setDirty(false);
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

  async function generatePortrait(
    role: "portrait" | "overheadToken" | "paperDollToken",
  ) {
    if (!draft || !campaignDefinitionId || busy || !artDirection.trim()) return;
    const fingerprint = JSON.stringify([draft.revision, artDirection, role]);
    if (portraitRequest.current?.fingerprint !== fingerprint)
      portraitRequest.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      const result = await generateCharacterPortrait(
        campaignDefinitionId,
        campaignInstanceId,
        characterId,
        draft.revision,
        artDirection.trim(),
        portraitRequest.current.key,
        role,
      );
      setArtPreviews((current) => ({ ...current, [role]: result.assetId }));
      portraitRequest.current = undefined;
      setMessage(
        "Artwork generated. Choose Use, then save the Character to attach it.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Artwork generation failed.",
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
  const editable = CharacterCreation.editable(draft.status);

  const background = options.backgrounds.find(
    (option) => option.id === selections.backgroundId,
  );
  const artRoles = [
    ["portrait", "Portrait"],
    ["overheadToken", "Overhead token"],
    ["paperDollToken", "Side-on token"],
  ] as const;
  return (
    <form
      className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 bg-base-200/40 lg:grid-cols-[216px_minmax(0,1fr)]"
      onSubmit={save}
    >
      <nav
        className="relative flex items-center justify-between gap-3 border-b border-base-300 bg-base-100 px-4 py-2 lg:hidden"
        aria-label="Character creation progress"
      >
        <p className="text-sm">
          {steps[step]} · {step + 1} of {steps.length}
        </p>
        <Button
          ref={stepTrigger}
          type="button"
          tone="outline"
          className="min-h-11"
          aria-expanded={stepsOpen}
          aria-controls="character-step-menu"
          onClick={() => setStepsOpen(!stepsOpen)}
        >
          Steps ▾
        </Button>
        {stepsOpen && (
          <div
            id="character-step-menu"
            className="absolute inset-x-3 top-full z-20 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setStepsOpen(false);
                stepTrigger.current?.focus();
              }
            }}
          >
            {steps.map((label, index) => (
              <Button
                key={label}
                type="button"
                tone={step === index ? "primary" : "ghost"}
                className="min-h-11 w-full justify-start"
                onClick={() => chooseStep(index)}
                aria-current={step === index ? "step" : undefined}
              >
                {index + 1}. {label}
              </Button>
            ))}
          </div>
        )}
      </nav>
      <aside className="hidden space-y-3 border-r border-base-300 bg-base-200/60 p-5 lg:block">
        <InternalLink
          className="mb-4 flex min-h-11 items-center text-sm text-primary"
          href={
            campaignDefinitionId
              ? `/campaigns/instances/${encodeURIComponent(campaignInstanceId)}/roster`
              : `/play/instances/${encodeURIComponent(campaignInstanceId)}/characters`
          }
        >
          ← All characters
        </InternalLink>
        <nav aria-label="Character creation steps" className="space-y-2">
          {steps.map((label, index) => (
            <Button
              key={label}
              type="button"
              tone={step === index ? "primary" : "ghost"}
              className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left"
              onClick={() => chooseStep(index)}
              aria-current={step === index ? "step" : undefined}
            >
              {index + 1}. {label}
            </Button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 space-y-5 p-4 lg:p-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase text-base-content/55">
            Step {step + 1} of {steps.length} ·{" "}
            {draft.status === "in-progress"
              ? "Draft"
              : draft.status === "complete"
                ? "Approved"
                : "In review"}
          </p>
          <h1 className="text-2xl font-semibold sm:text-3xl">{titles[step]}</h1>
          <p className="text-sm text-base-content/65">{descriptions[step]}</p>
        </header>
        {message && (
          <div className="mb-3" role="status">
            <Alert>{message}</Alert>
          </div>
        )}
        <section hidden={step !== 0} className="rounded-box bg-base-100 p-5">
          <TextInput
            required
            disabled={!editable || busy}
            label="Character name"
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setDirty(true);
            }}
            help="Use the name you want displayed on your character sheet and in play."
          />
        </section>
        <div hidden={step !== 1}>
          <div className="grid gap-5 lg:grid-cols-2">
            <ChoiceSelect
              label="Background"
              value={selections.backgroundId ?? ""}
              options={options.backgrounds}
              disabled={!editable || busy}
              onChange={(backgroundId) => {
                setSelections({ ...selections, backgroundId });
                setDirty(true);
              }}
            />
            <ChoiceSelect
              label="Profession"
              value={selections.professionId ?? ""}
              options={options.professions}
              disabled={!editable || busy}
              onChange={(professionId) => {
                setSelections({ ...selections, professionId });
                setDirty(true);
              }}
            />
          </div>
        </div>
        {step === 2 && (
          <Alert>
            Quirk selection is not available in this campaign’s character
            workflow. You can continue to attributes; your biography remains
            available under Name &amp; Bio.
          </Alert>
        )}
        {!editable && (
          <Alert>
            Submitted and approved sheets are locked. Use Review sheet in the
            roster to request changes.
          </Alert>
        )}
        {draft.reviewNote && (
          <Alert>Game Master note: {draft.reviewNote}</Alert>
        )}
        {step === 1 &&
          (!options.backgrounds.length || !options.professions.length) && (
            <Alert tone="warning">
              No {!options.backgrounds.length ? "Backgrounds" : "Professions"}{" "}
              are included in this campaign’s current capture. Saved World
              drafts are not yet selectable here. You can continue saving this
              sheet while the GM publishes and adopts the updated choices.
              {campaignDefinitionId && options.worldDefinitionId && (
                <div className="mt-3 space-y-2">
                  <InternalLink
                    href={`/worlds/${encodeURIComponent(options.worldDefinitionId)}/characters/backgrounds`}
                    className="underline"
                  >
                    Manage Backgrounds
                  </InternalLink>
                  <ol className="list-inside list-decimal space-y-2">
                    <li>
                      <InternalLink
                        href={`/worlds/${encodeURIComponent(options.worldDefinitionId)}/versions/draft/review`}
                        className="underline"
                      >
                        Review and publish the World draft
                      </InternalLink>
                    </li>
                    <li>
                      <InternalLink
                        href={`/campaigns/definitions/${encodeURIComponent(campaignDefinitionId)}/versions/migrate`}
                        className="underline"
                      >
                        Adopt the published World revision in the Campaign
                        Definition
                      </InternalLink>
                    </li>
                    <li>
                      <InternalLink
                        href={`/campaigns/instances/${encodeURIComponent(campaignInstanceId)}/versions/migrate`}
                        className="underline"
                      >
                        Adopt the updated Campaign revision for this game
                      </InternalLink>
                    </li>
                  </ol>
                </div>
              )}
            </Alert>
          )}
        <div>
          <section
            className="rounded-box border-2 border-base-300 bg-base-100 p-5"
            hidden={step !== 3}
            aria-label="Character attributes"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-2xl font-semibold">Attributes</h2>
              {editable && (
                <Button
                  type="button"
                  size="sm"
                  tone="outline"
                  disabled={busy}
                  onClick={() => void rollAttributes()}
                >
                  {draft.attributeRolls.length ? "Reroll" : "Generate rolls"}
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-base-content/60">
              Generate {options.attributeRollCount} rolls. Assign one per
              Attribute; leave two unused.
            </p>
            <div className="mt-5 rounded-box bg-base-200/50 p-3">
              <h3 className="text-xs font-semibold uppercase text-base-content/60">
                Rolled values
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(draft.attributeRolls.length
                  ? draft.attributeRolls
                  : Array.from(
                      { length: options.attributeRollCount },
                      () => undefined,
                    )
                ).map((value, index) => (
                  <span
                    key={index}
                    className="flex h-16 w-16 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-2xl font-semibold tabular-nums"
                  >
                    {value ?? "—"}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
              {options.attributes.map((attribute) => {
                const current = attributeAssignments[attribute.id];
                const available = CharacterCreation.availableRolls(
                  draft.attributeRolls,
                  attributeAssignments,
                  attribute.id,
                );
                return (
                  <div
                    key={attribute.id}
                    className="rounded-xl border-2 border-base-300 bg-base-200/40 p-3 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider">
                      {attribute.name}
                    </p>
                    <p className="my-2 font-serif text-4xl font-bold tabular-nums">
                      {current ?? "—"}
                    </p>
                    <SelectField
                      label={attribute.name}
                      disabled={
                        !editable || busy || !draft.attributeRolls.length
                      }
                      value={current ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setAttributeAssignments((previous) => {
                          const next = { ...previous };
                          if (value === "") delete next[attribute.id];
                          else next[attribute.id] = Number(value);
                          return next;
                        });
                        setDirty(true);
                      }}
                    >
                      <option value="">Assign a roll</option>
                      {[...new Set(draft.attributeRolls)].map((score) => (
                        <option
                          key={score}
                          value={score}
                          disabled={
                            score !== current && !available.includes(score)
                          }
                        >
                          {score}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="space-y-5">
            <section
              hidden={step !== 0}
              className="rounded-box bg-base-100 p-5"
            >
              <h2 className="font-serif text-2xl font-semibold">
                Where did you come from—and what draws you onward?
              </h2>
              <p className="mt-2 text-sm text-base-content/65">
                {background?.description ||
                  "Your Background connects your backstory to mechanical benefits."}
              </p>
              {!!background?.modifierGrants?.length && (
                <ul className="my-4 grid gap-2 sm:grid-cols-2">
                  {background.modifierGrants.map((grant) => (
                    <li
                      key={grant.id}
                      className="rounded border border-base-300 bg-base-200/40 p-3"
                    >
                      <p className="font-medium">{grant.label}</p>
                      <p className="text-xs text-base-content/60">
                        {grant.dice
                          .map((die) => `${die.count}d${die.sides}`)
                          .join(" + ")}{" "}
                        ·{" "}
                        {grant.kind === "rolled-flat"
                          ? "Permanent benefit, rolled once when granted"
                          : "Additional dice per applicable check"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <TextareaField
                  label="Biography"
                  rows={5}
                  disabled={!editable || busy}
                  value={biography}
                  onChange={(event) => {
                    setBiography(event.currentTarget.value);
                    setDirty(true);
                  }}
                  help="Your history, ideals, bonds, and flaws."
                />
              </div>
            </section>
            <div hidden={step !== 4}>
              <CharacterEquipment
                items={options.startingEquipment}
                slots={options.equipmentSlots ?? []}
                selected={startingEquipmentIds}
                assignments={equipmentAssignments}
                imageAssetId={imageAssetIds.paperDollToken}
                disabled={!editable || busy}
                onChange={(items, assignments) => {
                  setStartingEquipmentIds(items);
                  setEquipmentAssignments(assignments);
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </div>
        <section
          hidden={step !== 5}
          className="rounded-box border border-base-300 bg-base-100 p-5"
          aria-label="Character artwork"
        >
          <h2 className="font-serif text-2xl font-semibold">
            Character artwork
          </h2>
          <p className="mt-2 text-sm text-base-content/65">
            Three distinct images: a portrait for the sheet, an overhead token
            for maps, and a side-on token for the paper doll.
          </p>
          {campaignDefinitionId && editable && (
            <div className="mt-4">
              <TextareaField
                label="Shared art direction"
                maxLength={4000}
                value={artDirection}
                disabled={busy}
                help="Describe appearance, clothing, palette, and style consistently for all three assets. Save biography changes before generating."
                onChange={(event) => setArtDirection(event.currentTarget.value)}
              />
            </div>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {artRoles.map(([role, label]) => (
              <section
                key={role}
                className="rounded-lg border border-base-300 p-4"
                aria-label={label}
              >
                <h3 className="font-semibold">{label}</h3>
                <MediaImage
                  image={
                    artPreviews[role] || imageAssetIds[role]
                      ? {
                          assetId: artPreviews[role] || imageAssetIds[role],
                          altText: `${name} ${label.toLowerCase()}`,
                        }
                      : undefined
                  }
                  name={label}
                  className="my-3 h-64 w-full rounded bg-base-200 object-contain"
                />
                <p className="mb-3 text-xs text-base-content/60">
                  {artPreviews[role]
                    ? "Preview · not attached"
                    : imageAssetIds[role]
                      ? "Attached to sheet"
                      : "Not generated"}
                </p>
                {campaignDefinitionId && editable && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      tone="outline"
                      disabled={busy || !artDirection.trim()}
                      onClick={() => void generatePortrait(role)}
                    >
                      Generate {label.toLowerCase()}
                    </Button>
                    {artPreviews[role] && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          tone="primary"
                          disabled={busy}
                          onClick={() => {
                            setImageAssetIds((current) => ({
                              ...current,
                              [role]: artPreviews[role],
                            }));
                            setArtPreviews((current) => {
                              const next = { ...current };
                              delete next[role];
                              return next;
                            });
                            setDirty(true);
                          }}
                        >
                          Use {label.toLowerCase()}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          tone="ghost"
                          disabled={busy}
                          onClick={() =>
                            setArtPreviews((current) => {
                              const next = { ...current };
                              delete next[role];
                              return next;
                            })
                          }
                        >
                          Discard
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>
      </div>
      <div className="sticky bottom-0 z-10 border-t border-base-300 bg-base-100 p-3 lg:col-span-2 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="sr-only text-xs text-base-content/60 sm:not-sr-only"
            aria-live="polite"
          >
            {dirty ? "Unsaved changes" : "Saved sheet"} ·{" "}
            {Object.keys(imageAssetIds).length}/3 artwork assets
          </p>
          {editable && (
            <div className="flex w-full flex-wrap gap-3">
              {step > 0 ? (
                <Button
                  type="button"
                  tone="ghost"
                  className="min-h-11"
                  onClick={() => chooseStep(step - 1)}
                >
                  Back
                </Button>
              ) : (
                <InternalLink
                  className="btn btn-ghost min-h-11"
                  href={
                    campaignDefinitionId
                      ? `/campaigns/instances/${encodeURIComponent(campaignInstanceId)}/roster`
                      : `/play/instances/${encodeURIComponent(campaignInstanceId)}/characters`
                  }
                >
                  Cancel
                </InternalLink>
              )}
              <Button
                type="submit"
                tone="outline"
                disabled={!name.trim() || busy}
                loading={busy}
                className="min-h-11"
                aria-label="Save for later"
              >
                <span className="sm:hidden">Save</span>
                <span className="hidden sm:inline">Save for later</span>
              </Button>
              {step < steps.length - 1 && (
                <Button
                  type="button"
                  className="min-h-11 flex-1"
                  disabled={
                    busy ||
                    (step === 0 && !name.trim()) ||
                    (step === 1 && !selectionsComplete(selections))
                  }
                  onClick={() => chooseStep(step + 1)}
                >
                  Continue
                </Button>
              )}
              {step === steps.length - 1 && (
                <Button
                  type="button"
                  tone="primary"
                  disabled={
                    busy ||
                    !name.trim() ||
                    !selectionsComplete(selections) ||
                    artRoles.some(([role]) => !imageAssetIds[role]) ||
                    new Set(artRoles.map(([role]) => imageAssetIds[role]))
                      .size !== 3
                  }
                  onClick={() => void submitForReview()}
                >
                  Submit for review
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
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
  const [auth0, setAuth0] =
    useState<
      Awaited<ReturnType<typeof getMyAuthenticationProviders>>["auth0"]
    >();
  const returnTo = `/play/instances/${encodeURIComponent(campaignInstanceId)}/characters${characterId ? `/${encodeURIComponent(characterId)}` : ""}`;

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

  useEffect(() => {
    void getMyAuthenticationProviders().then(
      (result) => setAuth0(result.auth0),
      () => undefined,
    );
  }, []);

  return (
    <main className="min-h-dvh bg-base-100 text-base-content">
      <header
        className={`border-b border-base-300 bg-base-100 px-5 py-4 sm:px-8 ${characterId ? "hidden lg:block" : ""}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Player workshop
            </p>
            <p className="font-semibold">Character creation</p>
          </div>
          <div className="flex items-center gap-2">
            {auth0?.configured && !auth0.linked && (
              <a
                className="btn btn-outline btn-sm"
                href={`/api/auth/auth0/link?returnTo=${encodeURIComponent(returnTo)}`}
              >
                Connect Auth0
              </a>
            )}
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={() =>
                void logout().finally(() =>
                  navigate("/join", { replace: true }),
                )
              }
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div
        className={
          characterId ? "w-full" : "mx-auto max-w-6xl px-5 py-8 sm:px-8"
        }
      >
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
