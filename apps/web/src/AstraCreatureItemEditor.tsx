import {
  EquipmentPaperdoll,
  type EquipmentAssignment,
} from "./EquipmentPaperdoll";
import {
  worldEquipmentItems,
  worldEquipmentSlots,
} from "./worldEquipmentPresentation";
import { RouterButtonLink } from "./navigation";
import { protectedComparisonText } from "./protectedAuthoringText";
import { RuleTextField } from "./RuleValueFields";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ActionSurface,
  Button,
  Checkbox,
  Fieldset,
  FileInput,
  Input,
  Label,
  Legend,
  Select,
  Textarea,
} from "@aow/ui";
import type {
  CreateWorldCreatureDraftRequest,
  CreateWorldItemDraftRequest,
} from "@aow/common";
import {
  getMediaDownloadUrl,
  listMapMedia,
  saveWorldCreature,
  saveWorldItem,
  upgradeLegacyWorldCreature,
  uploadWorldMedia,
  type ArtworkRole,
  type JsonValue,
  type MediaAsset,
  type WorldDefinitionDraft,
} from "./api";
import { ArtworkGenerator } from "./ArtworkGenerator";
import { MediaImage } from "./MediaImage";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import {
  creatureAttributesForEditor,
  recordPayload,
  recordsForLibrary,
} from "./worldAuthoringModel";
import { creatureImageReferences } from "./recordArtworkModel";
import { formatAstraModifier } from "./astraModifiers";
import "./AstraAtlas.css";
import "./AstraCreatureItemEditor.css";
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const title = (v: string) =>
  v.replace(/[-_]/g, " ").replace(/^./, (v) => v.toUpperCase());
const movementModes = [
  "walk",
  "run",
  "jump",
  "crawl",
  "swim",
  "climb",
  "fly",
  "burrow",
];
const defaultSkills = [
  "Athletics",
  "Awareness",
  "Stealth",
  "Lore",
  "Persuasion",
  "Occult",
  "Munitions",
  "Demolition",
  "Engineering",
  "Medicine",
  "Academics",
];
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "Your changes could not be saved. Please try again.",
    );
  }
  return response.json();
}

export function AstraCreatureItemEditor({
  kind,
  entryId,
  onSaved,
  onCancel,
}: {
  kind: "items" | "creatures";
  entryId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { definition, draft, canEdit, adoptDraft } = useWorldAuthoring();
  const recordIds = new Set(
    draft?.records.map((record) => record.sourceId) ?? [],
  );
  const existing = recordsForLibrary(draft?.records ?? [], kind).find(
    (item) => item.sourceId === entryId,
  );
  const payload = existing ? recordPayload(existing) : {};
  const components = obj(payload.components);
  const identity = obj(payload.identity);
  const creature = kind === "creatures";
  const noun = creature ? "creature" : "item";
  const [name, setName] = useState(str(identity.name ?? payload.name));
  const [description, setDescription] = useState(
    str(identity.description ?? payload.description),
  );
  const [attributes, setAttributes] = useState(() => ({
    ...Object.fromEntries(
      (draft?.effectiveModels?.attributes ?? []).map((option) => [
        option.key,
        50,
      ]),
    ),
    ...creatureAttributesForEditor(
      payload,
      draft?.effectiveModels?.attributes ?? [],
    ),
  }));
  const [skills, setSkills] = useState<Record<string, number>>(() => ({
    ...Object.fromEntries(
      defaultSkills.map((name) => [name.toLowerCase(), 50]),
    ),
    ...Object.fromEntries(
      Object.entries(obj(components.skills)).map(([key, value]) => [
        key,
        num(value),
      ]),
    ),
  }));
  const [health, setHealth] = useState({
    current: num(obj(components.health).current, 20),
    maximum: num(obj(components.health).maximum, 20),
    temporary: num(obj(components.health).temporary),
  });
  const [vision, setVision] = useState({
    day: num(obj(components.vision).day, 60),
    night: num(obj(components.vision).night, 30),
  });
  const initialMovement = Array.isArray(components.movement)
    ? components.movement
    : [];
  const [movement, setMovement] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      initialMovement.map((item) => [
        str(obj(item).mode),
        num(obj(obj(item).distance).value),
      ]),
    ),
  );
  const [equipment, setEquipment] = useState<EquipmentAssignment[] | undefined>(
    Array.isArray(components.equipment)
      ? (components.equipment as EquipmentAssignment[])
      : undefined,
  );
  const [equipmentSlots, setEquipmentSlots] = useState<string[]>(
    Array.isArray(components.equipmentSlots)
      ? (components.equipmentSlots as string[])
      : [],
  );
  const [grants, setGrants] = useState<string[]>(
    Array.isArray(components.grantedConditions)
      ? components.grantedConditions.map((item) => str(obj(item).conditionId))
      : [],
  );
  const [conditions, setConditions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [conditionsError, setConditionsError] = useState("");
  const families = draft?.effectiveModels?.itemFamilies ?? [];
  const initialFamily = str(
    obj(payload.modelValues)["aow:item-family"] ?? payload.itemFamilyKey,
  );
  const initialCategory =
    str(components.category ?? payload.category) || "weapon";
  const [family, setFamily] = useState(
    initialFamily ||
      families.find((item) => item.name.toLowerCase() === initialCategory)
        ?.key ||
      families[0]?.key ||
      "",
  );
  const [category, setCategory] = useState(initialCategory);
  const [weight, setWeight] = useState(num(obj(components.weight).value));
  const costs = Array.isArray(components.cost) ? components.cost : [];
  const [value, setValue] = useState(num(obj(costs[0]).amount));
  const [notes, setNotes] = useState(str(components.notes));
  const initialImages = creatureImageReferences(payload);
  const [images, setImages] = useState<
    Record<string, Record<string, JsonValue>>
  >(() =>
    creature
      ? Object.fromEntries(
          Object.entries(initialImages)
            .filter(([, v]) => v)
            .map(([key, v]) => [key, v as Record<string, JsonValue>]),
        )
      : { item: obj(payload.image) as Record<string, JsonValue> },
  );
  const [source, setSource] = useState(
    Object.values(images).some((image) => image?.assetId) ? "current" : "none",
  );
  const [artBusy, setArtBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const mayLeave = useRef(false);
  const fingerprint = JSON.stringify({
    name,
    description,
    attributes,
    skills,
    health,
    vision,
    movement,
    equipment,
    equipmentSlots,
    grants,
    family,
    category,
    weight,
    value,
    notes,
    images,
  });
  const baseline = useRef(fingerprint);
  const dirty = fingerprint !== baseline.current;
  useBlocker({
    shouldBlockFn: () =>
      !mayLeave.current &&
      (busy ||
        artBusy ||
        (dirty && !window.confirm("Leave without saving this entry?"))),
    enableBeforeUnload: !mayLeave.current && (dirty || busy || artBusy),
  });
  useEffect(() => {
    let active = true;
    void request<{ items: { id: string; name: string }[] }>(
      `/worlds/${encodeURIComponent(definition.id)}/codex/conditions`,
    ).then(
      (result) => {
        if (active) setConditions(result.items);
      },
      () => {
        if (active)
          setConditionsError(
            "Conditions could not be loaded. Existing selections are preserved.",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [definition.id]);
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((value) => value !== id) : [...items, id];
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || !canEdit) return;
    setBusy(true);
    setError("");
    try {
      let saved: WorldDefinitionDraft;
      if (creature) {
        const input: CreateWorldCreatureDraftRequest = {
          expectedStorageRevision: draft.storageRevision,
          name: name.trim(),
          description,
          attributes:
            attributes as CreateWorldCreatureDraftRequest["attributes"],
          equipmentSlots:
            equipmentSlots as CreateWorldCreatureDraftRequest["equipmentSlots"],
          instanceEmbodimentPolicy: (payload.instanceEmbodimentPolicy ?? {
            strategy: "one-per-instance",
            maximumPerCampaignInstance: 1,
          }) as CreateWorldCreatureDraftRequest["instanceEmbodimentPolicy"],
          artDirection: str(obj(components.art).direction),
          images: images as CreateWorldCreatureDraftRequest["images"],
          movement: Object.entries(movement).map(([mode, distance]) => {
            const prior = obj(
              initialMovement.find((item) => obj(item).mode === mode),
            );
            return {
              ...prior,
              mode,
              distance: {
                ...obj(prior.distance),
                value: distance,
                unit: str(obj(prior.distance).unit) || "foot",
              },
            };
          }) as CreateWorldCreatureDraftRequest["movement"],
          skillDefinitionIds:
            components.skillDefinitionIds as CreateWorldCreatureDraftRequest["skillDefinitionIds"],
          professionDefinitionIds:
            components.professionDefinitionIds as CreateWorldCreatureDraftRequest["professionDefinitionIds"],
          progressiveMechanicsNotes: str(
            obj(components.progressiveMechanics).notes,
          ),
          grantedConditions: grants.map((conditionId) => ({ conditionId })),
          skills,
          health,
          vision,
          ...(equipment === undefined ? {} : { equipment }),
        };
        saved =
          existing?.resourceType === "creatures"
            ? await upgradeLegacyWorldCreature(
                definition.id,
                existing.sourceId,
                input,
              )
            : await saveWorldCreature(definition.id, input, entryId);
      } else {
        const input: CreateWorldItemDraftRequest = {
          expectedStorageRevision: draft.storageRevision,
          name: name.trim(),
          description,
          itemFamilyKey: family as CreateWorldItemDraftRequest["itemFamilyKey"],
          category,
          quality: (components.quality ??
            "standard") as CreateWorldItemDraftRequest["quality"],
          compatibleEquipmentSlotSets: (obj(components.equippable)
            .compatibleSlotSets ??
            []) as CreateWorldItemDraftRequest["compatibleEquipmentSlotSets"],
          image: images.item?.assetId
            ? (images.item as unknown as CreateWorldItemDraftRequest["image"])
            : undefined,
          weight: {
            value: weight,
            unit: (str(obj(components.weight).unit) || "pound") as "pound",
          },
          cost: [
            {
              ...obj(costs[0]),
              amount: value,
              denomination: str(obj(costs[0]).denomination) || "gp",
            },
            ...costs.slice(1),
          ] as CreateWorldItemDraftRequest["cost"],
          notes,
          grantedConditions: grants.map((conditionId) => ({ conditionId })),
        };
        saved = await saveWorldItem(definition.id, input, entryId);
      }
      adoptDraft({ ...saved, effectiveModels: draft.effectiveModels });
      mayLeave.current = true;
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Changes could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!draft || !entryId) return;
    setBusy(true);
    setError("");
    try {
      const saved = await request<WorldDefinitionDraft>(
        `/worlds/${encodeURIComponent(definition.id)}/${creature ? "bestiary/creatures" : "item-compendium/items"}/${encodeURIComponent(entryId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDraftId: draft.id,
            expectedStorageRevision: draft.storageRevision,
          }),
        },
      );
      adoptDraft({ ...saved, effectiveModels: draft.effectiveModels });
      mayLeave.current = true;
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Entry could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (entryId && !existing)
    return (
      <main className="astra-page">
        <h1 className="astra-heading">Entry unavailable</h1>
        <Button onClick={onCancel}>
          Back to {creature ? "Bestiary" : "Items"}
        </Button>
      </main>
    );
  const skillOptions = [
    ...new Map(
      [
        ...defaultSkills.map((name) => ({ key: name.toLowerCase(), name })),
        ...Object.keys(skills).map((key) => ({
          key,
          name: title(
            key.includes(":")
              ? key
                  .split(":")
                  .pop()!
                  .replace(/^skill-/, "")
              : key,
          ),
        })),
      ].map((item) => [item.key, item]),
    ).values(),
  ];
  const roles = creature
    ? ([
        ["portrait", "Portrait"],
        ["paperDollToken", "Side-on token · Side-view maps"],
        ["overheadToken", "Overhead token · Top-down maps"],
      ] as const)
    : ([["item", "Item image"]] as const);
  return (
    <main className="astra-page astra-atlas astra-atlas-form-page">
      <Button tone="ghost" className="astra-atlas-back" onClick={onCancel}>
        ← Back to {creature ? "Bestiary" : "Items"}
      </Button>
      <p className="astra-eyebrow">WORKSPACE / AUTHORING</p>
      <h1 className="astra-heading">
        {entryId ? "Edit" : "Add"} {noun}
      </h1>
      {!creature && entryId && (
        <RouterButtonLink
          className="min-h-11"
          href={`/worlds/${encodeURIComponent(definition.id)}/item-compendium/items/${encodeURIComponent(entryId)}`}
        >
          Equipment and storage settings
        </RouterButtonLink>
      )}
      <form
        className="astra-panel astra-atlas-form"
        onSubmit={(event) => void save(event)}
      >
        <Fieldset className="astra-atlas-fields" disabled={busy || !canEdit}>
          {protectedComparisonText(name, recordIds) ? (
            <RuleTextField
              label="Name"
              value={name}
              recordIds={recordIds}
              onChange={setName}
            />
          ) : (
            <Label>
              Name
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Label>
          )}
          {protectedComparisonText(description, recordIds) ? (
            <RuleTextField
              label="Description"
              value={description}
              recordIds={recordIds}
              onChange={setDescription}
            />
          ) : (
            <Label>
              Description
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Label>
          )}
          <Fieldset className="astra-atlas-group">
            <Legend>
              {creature ? "Creature portrait and tokens" : "Item image"}
            </Legend>
            <Label>
              Choose an image source
              <Select
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                {!Object.values(images).some((image) => image?.assetId) && (
                  <option value="none">No image yet</option>
                )}
                {Object.values(images).some((image) => image?.assetId) && (
                  <option value="current">Keep current images</option>
                )}
                <option value="upload">Upload images</option>
                <option value="library">Choose from library</option>
                <option value="generate">Generate images</option>
              </Select>
            </Label>
            <div className={creature ? "astra-entry-images" : ""}>
              {roles.map(([role, label]) => (
                <section key={role}>
                  {(images[role]?.assetId || creature) && (
                    <>
                      <h3>{label}</h3>
                      <MediaImage image={images[role]} name={label} />
                    </>
                  )}
                  {source === "generate" && draft && (
                    <ArtworkGenerator
                      worldId={definition.id}
                      storageRevision={draft.storageRevision}
                      role={role}
                      label={label}
                      name={
                        protectedComparisonText(name, recordIds) ? noun : name
                      }
                      description={description}
                      direction={str(obj(components.art).direction)}
                      hasImage={!!images[role]?.assetId}
                      disabled={busy || artBusy || !canEdit}
                      onBusyChange={setArtBusy}
                      onApply={(image) =>
                        setImages((current) => ({ ...current, [role]: image }))
                      }
                    />
                  )}{" "}
                  {(source === "upload" || source === "library") && (
                    <EntryImageChooser
                      source={source}
                      role={role}
                      worldId={definition.id}
                      name={
                        protectedComparisonText(name, recordIds) ? noun : name
                      }
                      onImage={(image) =>
                        setImages((current) => ({ ...current, [role]: image }))
                      }
                      onBusy={setArtBusy}
                    />
                  )}
                </section>
              ))}
            </div>
          </Fieldset>
          {creature ? (
            <>
              <section>
                <div className="astra-entry-section-heading">
                  <h2>Attributes</h2>
                  <span>Value · automatic modifier</span>
                </div>
                <div className="astra-entry-numbers">
                  {(draft?.effectiveModels?.attributes ?? []).map(
                    (attribute) => (
                      <Label key={attribute.key}>
                        {attribute.name}
                        <div className="astra-entry-modifier">
                          <Input
                            type="number"
                            value={attributes[attribute.key] ?? 50}
                            onChange={(event) =>
                              setAttributes({
                                ...attributes,
                                [attribute.key]: Number(event.target.value),
                              })
                            }
                          />
                          <span aria-label="Automatic modifier">
                            {formatAstraModifier(
                              attributes[attribute.key] ?? 50,
                            )}
                          </span>
                        </div>
                      </Label>
                    ),
                  )}
                </div>
              </section>
              <section>
                <div className="astra-entry-section-heading">
                  <h2>Skills</h2>
                  <span>Value · automatic modifier</span>
                </div>
                <div className="astra-entry-numbers">
                  {skillOptions.map((skill) => (
                    <Label key={skill.key}>
                      {skill.name}
                      <div className="astra-entry-modifier">
                        <Input
                          type="number"
                          value={skills[skill.key] ?? 50}
                          onChange={(event) =>
                            setSkills({
                              ...skills,
                              [skill.key]: Number(event.target.value),
                            })
                          }
                        />
                        <span aria-label="Automatic modifier">
                          {formatAstraModifier(skills[skill.key] ?? 50)}
                        </span>
                      </div>
                    </Label>
                  ))}
                </div>
              </section>
              <section>
                <h2>Health</h2>
                <div className="astra-entry-numbers">
                  {(
                    [
                      ["current", "Current health"],
                      ["maximum", "Maximum health"],
                      ["temporary", "Temporary health"],
                    ] as const
                  ).map(([key, label]) => (
                    <Label key={key}>
                      {label}
                      <Input
                        type="number"
                        min={0}
                        value={health[key]}
                        onChange={(event) =>
                          setHealth({
                            ...health,
                            [key]: Number(event.target.value),
                          })
                        }
                      />
                    </Label>
                  ))}
                </div>
              </section>
              <section>
                <h2>Movement speed</h2>
                <div className="astra-entry-numbers">
                  {movementModes.map((mode) => (
                    <Label key={mode}>
                      {title(mode)}
                      <Input
                        type="number"
                        min={0}
                        value={movement[mode] ?? 0}
                        onChange={(event) =>
                          setMovement({
                            ...movement,
                            [mode]: Number(event.target.value),
                          })
                        }
                      />
                    </Label>
                  ))}
                </div>
              </section>
              <section>
                <h2>Vision distance</h2>
                <div className="astra-entry-numbers">
                  {(["day", "night"] as const).map((key) => (
                    <Label key={key}>
                      {key === "day" ? "Daytime" : "Nighttime"} vision
                      <Input
                        type="number"
                        min={0}
                        value={vision[key]}
                        onChange={(event) =>
                          setVision({
                            ...vision,
                            [key]: Number(event.target.value),
                          })
                        }
                      />
                    </Label>
                  ))}
                </div>
              </section>
              <section>
                <EquipmentPaperdoll
                  slots={worldEquipmentSlots(
                    equipmentSlots,
                    draft?.effectiveModels?.equipmentSlots ?? [],
                  )}
                  items={worldEquipmentItems(draft?.records ?? [])}
                  equipment={equipment ?? []}
                  onChange={setEquipment}
                  disabled={busy || !canEdit}
                />
                <details className="mt-4">
                  <summary className="min-h-11 cursor-pointer">
                    Supported equipment slots
                  </summary>
                  <p className="astra-atlas-help">
                    Choose the slots this creature supports. Clear a slot’s
                    equipment before removing it.
                  </p>
                  <div className="astra-atlas-choices">
                    {(draft?.effectiveModels?.equipmentSlots ?? []).map(
                      (slot) => (
                        <Label key={slot.key}>
                          <Checkbox
                            checked={equipmentSlots.includes(slot.key)}
                            disabled={busy || !canEdit}
                            onChange={() =>
                              setEquipmentSlots(
                                toggle(equipmentSlots, slot.key),
                              )
                            }
                          />
                          {slot.name}
                        </Label>
                      ),
                    )}
                  </div>
                </details>
              </section>
            </>
          ) : (
            <>
              <Label>
                Item type
                <Select
                  value={family}
                  onChange={(event) => {
                    setFamily(event.target.value);
                    const selected = families.find(
                      (item) => item.key === event.target.value,
                    );
                    setCategory(
                      str(obj(selected?.payload).category) ||
                        selected?.name.toLowerCase().replaceAll(" ", "-") ||
                        category,
                    );
                  }}
                >
                  {families.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                  {!families.length && (
                    <option value="">No item types configured</option>
                  )}
                </Select>
              </Label>
              <div className="astra-entry-numbers">
                <Label>
                  Weight
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={weight}
                    onChange={(event) => setWeight(Number(event.target.value))}
                  />
                </Label>
                <Label>
                  Value
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={value}
                    onChange={(event) => setValue(Number(event.target.value))}
                  />
                </Label>
              </div>
              <Label>
                Properties &amp; effects notes
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Label>
            </>
          )}
          <Fieldset className="astra-atlas-group">
            <Legend>Granted conditions</Legend>
            <p className="astra-atlas-help">
              Choose conditions this source can grant to an affected entity.
              Each condition keeps its references to reusable effects. Automatic
              application and duration countdowns will be part of gameplay.
            </p>
            {conditionsError && <p role="alert">{conditionsError}</p>}
            <div className="astra-atlas-choices">
              {conditions.map((condition) => (
                <Label key={condition.id}>
                  <Checkbox
                    checked={grants.includes(condition.id)}
                    onChange={() => setGrants(toggle(grants, condition.id))}
                  />
                  {condition.name}
                </Label>
              ))}
            </div>
            {!conditions.length && !conditionsError && (
              <p className="astra-atlas-help">
                Create conditions in the Codex to grant them here.
              </p>
            )}
          </Fieldset>
        </Fieldset>
        {error && (
          <p role="alert" className="astra-atlas-error">
            {error}
          </p>
        )}
        {deleting && (
          <div className="astra-entry-delete">
            <p>Delete {name || `this ${noun}`} from the world draft?</p>
            <Button
              type="button"
              tone="danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete entry
            </Button>
            <Button type="button" onClick={() => setDeleting(false)}>
              Keep entry
            </Button>
          </div>
        )}
        <div className="astra-actions astra-atlas-form-actions">
          {entryId && (
            <Button
              type="button"
              tone="ghost"
              className="astra-entry-delete-action"
              disabled={busy || artBusy || !canEdit}
              onClick={() => setDeleting(true)}
            >
              Delete this entry
            </Button>
          )}
          <Button
            type="button"
            tone="ghost"
            disabled={busy || artBusy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={busy || artBusy || !canEdit || (!creature && !family)}
          >
            {busy ? "Saving…" : `Save ${noun}`}
          </Button>
        </div>
      </form>
    </main>
  );
}
function EntryImageChooser({
  source,
  role,
  worldId,
  name,
  onImage,
  onBusy,
}: {
  source: string;
  role: ArtworkRole;
  worldId: string;
  name: string;
  onImage: (image: Record<string, JsonValue>) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Image could not be selected.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function select(asset: Pick<MediaAsset, "id" | "mimeType">) {
    const { url } = await getMediaDownloadUrl(asset.id);
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () =>
          reject(new Error("The image could not be opened."));
        image.src = url;
      },
    );
    if (role === "item" && dimensions.width !== dimensions.height)
      throw new Error("Choose a square image for this item.");
    onImage({
      assetId: asset.id,
      mimeType: asset.mimeType,
      ...dimensions,
      altText: `${name || "Untitled"} ${role === "item" ? "item" : role === "portrait" ? "portrait" : "token"}`,
    });
  }
  async function load(next = 0) {
    await run(async () => {
      const result = await listMapMedia(search, next);
      setAssets(result.items);
      setTotal(result.total);
      setOffset(next);
    });
  }
  return (
    <div className="astra-entry-image-choice">
      {source === "upload" ? (
        <Label>
          Upload image
          <FileInput
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void run(async () => {
                  if (
                    !file.type.startsWith("image/") ||
                    file.size > 20 * 1024 * 1024
                  )
                    throw new Error("Choose an image smaller than 20 MB.");
                  await select(
                    await uploadWorldMedia(
                      worldId,
                      file,
                      role === "item" ? "item-image" : "creature-image",
                      [role],
                    ),
                  );
                });
            }}
          />
        </Label>
      ) : (
        <>
          <Input
            aria-label="Search image library"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search images…"
          />
          <Button type="button" disabled={busy} onClick={() => void load()}>
            Search library
          </Button>
          <div className="astra-entry-library">
            {assets.map((asset) => (
              <ActionSurface
                key={asset.id}
                disabled={busy}
                onClick={() => void run(() => select(asset))}
              >
                <MediaImage
                  image={{ assetId: asset.id }}
                  name={asset.originalName}
                />
                <span>{asset.originalName}</span>
              </ActionSurface>
            ))}
          </div>
          {total > 24 && (
            <div className="astra-actions">
              <Button
                type="button"
                disabled={busy || offset === 0}
                onClick={() => void load(Math.max(0, offset - 24))}
              >
                Previous
              </Button>
              <Button
                type="button"
                disabled={busy || offset + assets.length >= total}
                onClick={() => void load(offset + 24)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading image…</p>}
    </div>
  );
}
