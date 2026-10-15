import { RuleTextField } from "./RuleValueFields";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Fieldset,
  Input,
  Legend,
  Select,
  Textarea,
} from "@aow/ui";
import {
  ApiRequestError,
  createModelRegistry,
  extendModelRegistryRelease,
  getModelRegistry,
  listModelRegistries,
  type JsonValue,
  type ModelRegistryDetail,
  type ModelRegistrySummary,
  type WorldModelOption,
} from "./api";
import {
  MODEL_STRUCTURE_KINDS,
  modelStructureKey,
  modelStructureLabel,
  modelStructurePayload,
  modelStructurePayloadEditable,
  type ModelFieldAtomicKind,
  type ModelStructureKind,
} from "./modelStructureModel";
import { DraftRequired, useWorldAuthoring } from "./WorldAuthoringShell";
import {
  worldWorkspaceSuffix,
  draftAdoptingRegistryRelease,
  recoverableRegistryRelease,
} from "./worldAuthoringModel";

import { RouterButtonLink, useInternalNavigate } from "./navigation";

type EditableElement = ModelRegistryDetail["elements"][number];

const FIELD_KINDS: ReadonlyArray<{
  value: ModelFieldAtomicKind;
  label: string;
}> = [
  { value: "string", label: "Text" },
  { value: "integer", label: "Whole number" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
  { value: "json", label: "Bounded structured data" },
  { value: "vocabulary-option-reference", label: "Vocabulary option" },
  { value: "definition-reference", label: "Definition reference" },
  { value: "entity-reference", label: "Runtime entity reference" },
  { value: "concept-value", label: "Nested concept value" },
];

export function WorldModelStructureEditor({
  context = "effective",
}: {
  context?: string;
}) {
  const {
    definition,
    draft,
    saveDraft,
    refreshEffectiveModels,
    canEdit,
    markDirty,
  } = useWorldAuthoring();
  const location = useLocation();
  const navigate = useInternalNavigate();
  const leaving = useRef(false);
  const initialized = useRef(false);
  const isListContext = context === "effective";
  const isNew = context === "new";
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters/model/structure`;
  const suffix = worldWorkspaceSuffix(location.searchStr);
  const listHref = `${base}/effective${suffix}`;
  function returnToList() {
    leaving.current = true;
    void navigate(listHref);
  }
  const [registries, setRegistries] = useState<ModelRegistrySummary[]>([]);
  const [registryId, setRegistryId] = useState("");
  const [editing, setEditing] = useState<EditableElement>();
  const [kind, setKind] = useState<ModelStructureKind>("concept");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [helpText, setHelpText] = useState("");
  const [group, setGroup] = useState("");
  const [order, setOrder] = useState(0);
  const [semanticRole, setSemanticRole] = useState("custom:concept");
  const [parentConceptId, setParentConceptId] = useState("");
  const [ownerConceptId, setOwnerConceptId] = useState("");
  const [sourceConceptId, setSourceConceptId] = useState("");
  const [targetConceptId, setTargetConceptId] = useState("");
  const [storageKey, setStorageKey] = useState("custom:value");
  const [atomicKind, setAtomicKind] = useState<ModelFieldAtomicKind>("string");
  const [referenceElementId, setReferenceElementId] = useState("");
  const [list, setList] = useState(false);
  const [minimum, setMinimum] = useState(0);
  const [maximum, setMaximum] = useState("");
  const [unique, setUnique] = useState(false);
  const [defaultLiteral, setDefaultLiteral] = useState("");
  const [inverseLabel, setInverseLabel] = useState("");
  const [referencePolicy, setReferencePolicy] = useState<
    "same-release" | "captured-upstream" | "runtime-local"
  >("same-release");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{
    release: {
      id: string;
      registryId: string;
      predecessorRevisionId?: string;
      dependencyReleaseIds: string[];
    };
    label: string;
  }>();
  const recordIds = new Set([
    ...(draft?.effectiveModels?.elements ?? []).flatMap((option) =>
      [
        option.elementId,
        option.registryId,
        option.revisionId,
        option.sourceReleaseId,
      ].filter((id): id is string => Boolean(id)),
    ),
    ...registries.map((registry) => registry.identity.id),
  ]);
  const safeLabel = (value: string, fallback = "Unnamed Model element") =>
    protectedComparisonText(value, recordIds) ? fallback : value;
  const gmRegistries = registries.filter(
    (registry) => registry.provenance.kind === "gm",
  );
  const elements = draft?.effectiveModels?.elements ?? [];
  const concepts = elements.filter(({ kind }) => kind === "concept");
  const vocabularies = elements.filter(({ kind }) => kind === "vocabulary");
  const structure = elements.filter(({ kind }) =>
    MODEL_STRUCTURE_KINDS.includes(kind as ModelStructureKind),
  );
  const maximumNumber = maximum.trim() ? Number(maximum) : undefined;
  const defaultResult = useMemo(
    () => parseOptionalJson(defaultLiteral),
    [defaultLiteral],
  );
  const namespaced = /^[^:\s]+:[^:\s]+$/;
  const requiredReference =
    atomicKind === "vocabulary-option-reference"
      ? true
      : atomicKind === "definition-reference" ||
          atomicKind === "entity-reference" ||
          atomicKind === "concept-value"
        ? true
        : false;
  const valid =
    Boolean(name.trim()) &&
    namespaced.test(semanticRole) &&
    Number.isInteger(order) &&
    Number.isInteger(minimum) &&
    minimum >= 0 &&
    (maximumNumber === undefined ||
      (Number.isInteger(maximumNumber) && maximumNumber >= minimum)) &&
    defaultResult.valid &&
    (kind !== "field" ||
      (Boolean(ownerConceptId) &&
        namespaced.test(storageKey) &&
        (!requiredReference || Boolean(referenceElementId)))) &&
    (kind !== "relationship" ||
      (Boolean(sourceConceptId) && Boolean(targetConceptId)));
  const dirty = Boolean(
    editing ||
    name ||
    description ||
    helpText ||
    group ||
    order ||
    parentConceptId ||
    ownerConceptId ||
    sourceConceptId ||
    targetConceptId ||
    defaultLiteral ||
    kind !== "concept" ||
    semanticRole !== "custom:concept" ||
    storageKey !== "custom:value" ||
    atomicKind !== "string" ||
    referenceElementId ||
    list ||
    minimum ||
    maximum ||
    unique ||
    inverseLabel ||
    referencePolicy !== "same-release",
  );

  useBlocker({
    shouldBlockFn: () =>
      !leaving.current &&
      dirty &&
      !window.confirm("Leave without publishing this Model change?"),
    enableBeforeUnload: dirty,
  });
  useEffect(() => {
    if (dirty) markDirty();
  }, [dirty, markDirty]);
  useEffect(() => {
    void listModelRegistries()
      .then(({ items }) => {
        const editable = items.filter(
          (registry) => registry.provenance.kind === "gm",
        );
        setRegistries(items);
        setRegistryId((current) => current || editable[0]?.identity.id || "");
      })
      .catch(() =>
        setMessage("Editable Model Registries could not be loaded."),
      );
  }, []);
  useEffect(() => {
    if (!draft || !registryId || pending) return;
    let active = true;
    void getModelRegistry(registryId)
      .then((registry) => {
        if (!active) return;
        const recovery = recoverableRegistryRelease(
          draft.content,
          draft.effectiveModels?.releases ?? [],
          registryId,
          registry.releases,
        );
        if (!recovery) return;
        setPending({
          release: releaseReference(recovery),
          label: safeLabel(recovery.name || "Published Model release"),
        });
        setMessage(
          "A published Model release must be adopted before another structural change is published.",
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [draft, pending, registryId]);

  useEffect(() => {
    if (
      isListContext ||
      isNew ||
      initialized.current ||
      !draft?.effectiveModels ||
      !registries.length
    )
      return;
    initialized.current = true;
    const matches = structure.filter((option) => option.elementId === context);
    const selected = matches.length === 1 ? matches[0] : undefined;
    if (
      selected &&
      gmRegistries.some(
        (registry) => registry.identity.id === selected.registryId,
      )
    )
      void beginEdit(selected);
    else
      setMessage(
        "This Model element is unavailable or read only. Return to the list to choose an editable element.",
      );
  }, [context, draft?.effectiveModels, registries]);

  function reset() {
    setEditing(undefined);
    setKind("concept");
    setName("");
    setDescription("");
    setHelpText("");
    setGroup("");
    setOrder(0);
    setSemanticRole("custom:concept");
    setParentConceptId("");
    setOwnerConceptId("");
    setSourceConceptId("");
    setTargetConceptId("");
    setStorageKey("custom:value");
    setAtomicKind("string");
    setReferenceElementId("");
    setList(false);
    setMinimum(0);
    setMaximum("");
    setUnique(false);
    setDefaultLiteral("");
    setInverseLabel("");
    setReferencePolicy("same-release");
  }

  async function adopt(
    release: {
      id: string;
      registryId: string;
      predecessorRevisionId?: string;
      dependencyReleaseIds: string[];
    },
    label: string,
  ) {
    if (!draft || !canEdit) return false;
    const next = draftAdoptingRegistryRelease(
      draft,
      draft.effectiveModels?.releases ?? [],
      release,
    );
    if (!next) {
      setMessage("The selected Model release changed. Reload and try again.");
      return false;
    }
    if (!(await saveDraft(next))) {
      setPending({ release, label });
      setMessage(
        `${safeLabel(label)} was published, but this World did not adopt it. Resolve the draft conflict, then retry adoption.`,
      );
      return false;
    }
    try {
      await refreshEffectiveModels();
    } catch {
      setMessage(
        `${safeLabel(label)} was published and adopted. Reload to refresh the structure list.`,
      );
    }
    setPending(undefined);
    return true;
  }

  async function beginEdit(option: WorldModelOption) {
    if (!option.registryId || !option.elementId) return;
    setWorking(true);
    setMessage("");
    try {
      const registry = await getModelRegistry(option.registryId);
      const element = registry.elements.find(
        (candidate) => candidate.id === option.elementId,
      );
      if (
        !element?.currentRevision ||
        !isStructureKind(element.kind) ||
        (option.revisionId &&
          option.revisionId !== element.currentRevision.identity.id)
      ) {
        setMessage("That Model element is no longer available for editing.");
        return;
      }
      const payload = element.currentRevision.payload;
      if (!modelStructurePayloadEditable(element.kind, payload)) {
        setMessage(
          "This imported Model structure uses unsupported field data and is preserved read only.",
        );
        return;
      }
      const presentation = element.currentRevision.presentation;
      if (
        ["label", "description", "helpText", "group"].some(
          (key) =>
            presentation[key] !== undefined &&
            typeof presentation[key] !== "string",
        ) ||
        (presentation.order !== undefined &&
          typeof presentation.order !== "number")
      ) {
        setMessage("This imported Model presentation is preserved read only.");
        return;
      }
      const cardinality = objectValue(payload.cardinality);
      const valueType = objectValue(payload.valueType);
      const isList = valueType.kind === "list";
      const atomic = isList ? objectValue(valueType.item) : valueType;
      setEditing(element);
      setRegistryId(option.registryId);
      setKind(element.kind);
      setName(textValue(presentation.label));
      setDescription(textValue(presentation.description));
      setHelpText(textValue(presentation.helpText));
      setGroup(textValue(presentation.group));
      setOrder(numberValue(presentation.order, 0));
      setSemanticRole(element.semanticRole);
      setParentConceptId(textValue(payload.parentConceptId));
      setOwnerConceptId(textValue(payload.ownerConceptId));
      setSourceConceptId(textValue(payload.sourceConceptId));
      setTargetConceptId(textValue(payload.targetConceptId));
      setStorageKey(textValue(payload.storageKey) || "custom:value");
      setAtomicKind(isAtomicKind(atomic.kind) ? atomic.kind : "string");
      setReferenceElementId(
        textValue(atomic.vocabularyId) || textValue(atomic.conceptId),
      );
      setList(isList);
      setMinimum(numberValue(cardinality.minimum, 0));
      setMaximum(
        typeof cardinality.maximum === "number"
          ? String(cardinality.maximum)
          : "",
      );
      setUnique(cardinality.unique === true);
      const defaultValue = objectValue(payload.defaultValue);
      setDefaultLiteral(
        defaultValue.kind === "literal"
          ? JSON.stringify(defaultValue.value)
          : "",
      );
      setInverseLabel(textValue(payload.inverseLabel));
      setReferencePolicy(
        isReferencePolicy(payload.referencePolicy)
          ? payload.referencePolicy
          : "same-release",
      );
    } catch {
      setMessage("That Model element could not be loaded for editing.");
    } finally {
      setWorking(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !draft ||
      !canEdit ||
      working ||
      pending ||
      !valid ||
      (!isNew && !editing)
    )
      return;
    setWorking(true);
    setMessage("");
    try {
      let selected = gmRegistries.find(
        (registry) => registry.identity.id === registryId,
      );
      if (!selected) {
        selected = await createModelRegistry({
          key: "custom:models",
          name: "Custom Models",
        });
        setRegistries((current) => [...current, selected!]);
        setRegistryId(selected.identity.id);
      }
      const registry = await getModelRegistry(selected.identity.id);
      const recovery = recoverableRegistryRelease(
        draft.content,
        draft.effectiveModels?.releases ?? [],
        selected.identity.id,
        registry.releases,
      );
      if (recovery) {
        await adopt(releaseReference(recovery), recovery.name);
        return;
      }
      const currentElement = editing
        ? registry.elements.find(({ id }) => id === editing.id)
        : undefined;
      if (
        editing &&
        (!currentElement?.currentRevision ||
          editing.currentRevision?.identity.id !==
            currentElement.currentRevision.identity.id)
      ) {
        setMessage("That Model element changed. Reload and try again.");
        return;
      }
      const payload = modelStructurePayload({
        kind,
        existing: currentElement?.currentRevision?.payload,
        parentConceptId,
        ownerConceptId,
        sourceConceptId,
        targetConceptId,
        storageKey,
        atomicKind,
        referenceElementId,
        list,
        minimum,
        maximum: maximumNumber,
        unique,
        defaultValue: defaultResult.value,
        inverseLabel,
        referencePolicy,
      });
      const presentation = {
        ...(currentElement?.currentRevision?.presentation ?? {}),
        label: name.trim(),
        ...(description ||
        currentElement?.currentRevision?.presentation.description !== undefined
          ? { description: description.trim() }
          : {}),
        ...(helpText ||
        currentElement?.currentRevision?.presentation.helpText !== undefined
          ? { helpText: helpText.trim() }
          : {}),
        ...(group ||
        currentElement?.currentRevision?.presentation.group !== undefined
          ? { group: group.trim() }
          : {}),
        ...(order ||
        currentElement?.currentRevision?.presentation.order !== undefined
          ? { order }
          : {}),
      };
      const result = await extendModelRegistryRelease(selected.identity.id, {
        name: `${editing ? "Revise" : "Add"} ${name.trim()}`,
        predecessorRevisionId: registry.releases[0]?.identity.id,
        ...(currentElement?.currentRevision
          ? {
              revisions: [
                {
                  elementId: currentElement.id,
                  predecessorRevisionId:
                    currentElement.currentRevision.identity.id,
                  payload,
                  presentation,
                  dependencies: currentElement.currentRevision.dependencies,
                },
              ],
            }
          : {
              elements: [
                {
                  key: modelStructureKey(kind, name),
                  kind,
                  semanticRole,
                  applicability: { kind: "global" },
                  payload,
                  presentation,
                },
              ],
            }),
      });
      const adopted = await adopt(
        releaseReference(result.release),
        name.trim(),
      );
      if (adopted) {
        reset();
        returnToList();
      }
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError && error.status === 409
          ? "The Model Registry changed. Reload and try again."
          : "The structural Model change could not be published.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function archive(option: WorldModelOption) {
    if (
      !draft ||
      !canEdit ||
      working ||
      !option.registryId ||
      !option.elementId ||
      !window.confirm(
        `Archive ${safeLabel(option.name)}? Existing releases keep it, while the successor omits it.`,
      )
    )
      return;
    setWorking(true);
    setMessage("");
    try {
      const registry = await getModelRegistry(option.registryId);
      const recovery = recoverableRegistryRelease(
        draft.content,
        draft.effectiveModels?.releases ?? [],
        option.registryId,
        registry.releases,
      );
      if (recovery) {
        await adopt(releaseReference(recovery), recovery.name);
        return;
      }
      const result = await extendModelRegistryRelease(option.registryId, {
        name: `Archive ${safeLabel(option.name)}`,
        predecessorRevisionId: registry.releases[0]?.identity.id,
        archiveElementIds: [option.elementId],
      });
      await adopt(releaseReference(result.release), option.name);
    } catch {
      setMessage("The Model element could not be archived.");
    } finally {
      setWorking(false);
    }
  }

  if (!canEdit)
    return (
      <main className="[&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11 [&_a]:min-h-11 mx-auto max-w-5xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">Schema Structure</h1>
        <Alert tone="warning" className="mt-8">
          This World is read only. Restore it before changing Model structure.
        </Alert>
      </main>
    );

  return (
    <main className="[&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11 [&_a]:min-h-11 mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Characters · Models &amp; Taxonomies
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Schema Structure
      </h1>
      <p className="mt-4 max-w-3xl text-base-content/65">
        Define Concepts, Fields, and Relationships for this World.
        References use the exact immutable Model releases adopted by this World.
      </p>
      {message && <Alert className="mt-4">{message}</Alert>}
      {isListContext && pending && (
        <Button
          className="mt-4"
          disabled={working}
          onClick={() =>
            void adopt(pending.release, pending.label).then((ok) => {
              if (ok) returnToList();
            })
          }
        >
          Adopt pending release
        </Button>
      )}
      {isListContext ? (
        <RouterButtonLink
          href={`${base}/new${suffix}`}
          tone="primary"
          className="mt-6"
        >
          Add Model element
        </RouterButtonLink>
      ) : (
        <RouterButtonLink href={listHref} tone="outline" className="mt-6">
          Back to Schema Structure
        </RouterButtonLink>
      )}
      {isListContext && (
        <section className="mt-8" aria-labelledby="model-structure-heading">
          <h2 id="model-structure-heading" className="text-2xl font-semibold">
            Effective structure
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {structure.map((option) => {
              const editable = gmRegistries.some(
                (registry) => registry.identity.id === option.registryId,
              );
              return (
                <li
                  key={option.key}
                  className="rounded-box border border-base-300 bg-base-200 p-4"
                >
                  <p className="text-xs font-semibold text-primary uppercase">
                    {isStructureKind(option.kind)
                      ? modelStructureLabel(option.kind)
                      : "Model element"}
                  </p>
                  <h3 className="mt-1 font-semibold">
                    {safeLabel(option.name)}
                  </h3>
                  {option.description && (
                    <p className="mt-1 text-sm text-base-content/55">
                      {safeLabel(option.description)}
                    </p>
                  )}
                  {editable && (
                    <div className="mt-3 flex gap-2">
                      <RouterButtonLink
                        href={`${base}/${encodeURIComponent(option.elementId!)}${suffix}`}
                        tone="outline"
                      >
                        Edit
                      </RouterButtonLink>
                      <Button
                        type="button"
                        className="min-h-11"
                        tone="outline"
                        disabled={working}
                        onClick={() => void archive(option)}
                      >
                        Archive
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!isListContext && (
        <DraftRequired>
          <form
            onSubmit={(event) => void submit(event)}
            className="mt-10 rounded-box border border-base-300 p-5"
          >
            <h2 className="text-2xl font-semibold">
              {editing ? "Edit" : "Add"} {modelStructureLabel(kind)}
            </h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Field label="Element kind" required>
                <Select
                  value={kind}
                  disabled={Boolean(editing)}
                  onChange={(event) => {
                    const next = event.target.value as ModelStructureKind;
                    setKind(next);
                    setSemanticRole(`custom:${next}`);
                  }}
                  className="mt-2 w-full"
                >
                  {MODEL_STRUCTURE_KINDS.map((value) => (
                    <option key={value} value={value}>
                      {modelStructureLabel(value)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Semantic role" required>
                <Input
                  required
                  value={safeLabel(semanticRole, "Existing semantic role")}
                  disabled={Boolean(editing)}
                  onChange={(event) => setSemanticRole(event.target.value)}
                  className="mt-2 w-full"
                />
              </Field>
              <RuleTextField
                label="Display name"
                value={name}
                onChange={setName}
                recordIds={recordIds}
              />
              <RuleTextField
                label="Display group"
                value={group}
                onChange={setGroup}
                recordIds={recordIds}
              />
              <RuleTextField
                label="Description"
                value={description}
                onChange={setDescription}
                recordIds={recordIds}
              />
              <RuleTextField
                label="Authoring help"
                value={helpText}
                onChange={setHelpText}
                recordIds={recordIds}
              />
              <Field label="Display order" required>
                <Input
                  required
                  type="number"
                  value={order}
                  onChange={(event) => setOrder(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </Field>
            </div>
            {kind === "concept" && (
              <Field label="Parent Concept" className="mt-5">
                <Select
                  value={parentConceptId}
                  onChange={(event) => setParentConceptId(event.target.value)}
                  className="mt-2 w-full"
                >
                  {parentConceptId &&
                    !concepts.some(
                      (option) => option.elementId === parentConceptId,
                    ) && (
                      <option value={parentConceptId}>
                        Unavailable reference
                      </option>
                    )}
                  <option value="">No parent Concept</option>
                  {concepts.map((concept) => (
                    <option key={concept.key} value={concept.elementId ?? ""}>
                      {safeLabel(concept.name)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {kind === "field" && (
              <Fieldset className="mt-6 rounded-box border border-base-300 p-4">
                <Legend className="px-2 font-semibold">Field definition</Legend>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Owning Concept" required>
                    <Select
                      required
                      value={ownerConceptId}
                      onChange={(event) =>
                        setOwnerConceptId(event.target.value)
                      }
                      className="mt-2 w-full"
                    >
                      {ownerConceptId &&
                        !concepts.some(
                          (option) => option.elementId === ownerConceptId,
                        ) && (
                          <option value={ownerConceptId}>
                            Unavailable reference
                          </option>
                        )}
                      <option value="" disabled>
                        Choose a Concept
                      </option>
                      {concepts.map((concept) => (
                        <option key={concept.key} value={concept.elementId}>
                          {safeLabel(concept.name)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <RuleTextField
                    label="Storage key"
                    value={storageKey}
                    onChange={setStorageKey}
                    recordIds={recordIds}
                  />
                  <Field label="Value type" required>
                    <Select
                      value={atomicKind}
                      onChange={(event) =>
                        setAtomicKind(
                          event.target.value as ModelFieldAtomicKind,
                        )
                      }
                      className="mt-2 w-full"
                    >
                      {FIELD_KINDS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {(atomicKind === "vocabulary-option-reference" ||
                    atomicKind === "definition-reference" ||
                    atomicKind === "entity-reference" ||
                    atomicKind === "concept-value") && (
                    <Field
                      label={
                        atomicKind === "vocabulary-option-reference"
                          ? "Vocabulary"
                          : "Referenced Concept"
                      }
                      required
                    >
                      <Select
                        required
                        value={referenceElementId}
                        onChange={(event) =>
                          setReferenceElementId(event.target.value)
                        }
                        className="mt-2 w-full"
                      >
                        {referenceElementId &&
                          !(
                            atomicKind === "vocabulary-option-reference"
                              ? vocabularies
                              : concepts
                          ).some(
                            (option) => option.elementId === referenceElementId,
                          ) && (
                            <option value={referenceElementId}>
                              Unavailable reference
                            </option>
                          )}
                        <option value="" disabled>
                          Choose an available model
                        </option>
                        {(atomicKind === "vocabulary-option-reference"
                          ? vocabularies
                          : concepts
                        ).map((option) => (
                          <option
                            key={option.key}
                            value={option.elementId ?? ""}
                          >
                            {safeLabel(option.name)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Checkbox
                    checked={list}
                    onChange={(event) => setList(event.target.checked)}
                    label="Store a list of values"
                    wrapperClassName="min-h-11 self-end"
                  />
                  <Checkbox
                    checked={unique}
                    onChange={(event) => setUnique(event.target.checked)}
                    label="Require unique list values"
                    disabled={!list}
                    wrapperClassName="min-h-11 self-end"
                  />
                </div>
                <CardinalityFields
                  minimum={minimum}
                  maximum={maximum}
                  onMinimum={setMinimum}
                  onMaximum={setMaximum}
                />
                {protectedComparisonText(defaultLiteral, recordIds) ? (
                  <RuleTextField
                    label="Literal default"
                    value={defaultLiteral}
                    onChange={setDefaultLiteral}
                    recordIds={recordIds}
                  />
                ) : (
                  <Field label="Literal default (JSON)" className="mt-5">
                    <Textarea
                      rows={3}
                      value={defaultLiteral}
                      onChange={(event) =>
                        setDefaultLiteral(event.target.value)
                      }
                      placeholder='Examples: 0, false, "unknown", or []'
                      className="mt-2 w-full font-mono text-sm"
                    />
                  </Field>
                )}
                {!defaultResult.valid && (
                  <p className="mt-2 text-sm text-error" role="alert">
                    Enter a valid JSON value or leave the default blank.
                  </p>
                )}
              </Fieldset>
            )}
            {kind === "relationship" && (
              <Fieldset className="mt-6 rounded-box border border-base-300 p-4">
                <Legend className="px-2 font-semibold">
                  Relationship definition
                </Legend>
                <div className="grid gap-5 md:grid-cols-2">
                  <ConceptSelect
                    label="Source Concept"
                    value={sourceConceptId}
                    concepts={concepts}
                    onChange={setSourceConceptId}
                  />
                  <ConceptSelect
                    label="Target Concept"
                    value={targetConceptId}
                    concepts={concepts}
                    onChange={setTargetConceptId}
                  />
                  <RuleTextField
                    label="Inverse label"
                    value={inverseLabel}
                    onChange={setInverseLabel}
                    recordIds={recordIds}
                  />
                  <Field label="Reference policy" required>
                    <Select
                      value={referencePolicy}
                      onChange={(event) =>
                        setReferencePolicy(
                          event.target.value as typeof referencePolicy,
                        )
                      }
                      className="mt-2 w-full"
                    >
                      <option value="same-release">
                        Same captured release
                      </option>
                      <option value="captured-upstream">
                        Captured upstream
                      </option>
                      <option value="runtime-local">Runtime local</option>
                    </Select>
                  </Field>
                </div>
                <CardinalityFields
                  minimum={minimum}
                  maximum={maximum}
                  onMinimum={setMinimum}
                  onMaximum={setMaximum}
                />
              </Fieldset>
            )}
            {!valid && (
              <p className="mt-4 text-sm text-error" role="alert">
                Complete the required named fields with valid cardinality and
                namespaced keys before publishing.
              </p>
            )}
            {message && (
              <p className="mt-4 text-sm" aria-live="polite">
                {message}
              </p>
            )}
            {pending && (
              <Button
                type="button"
                tone="outline"
                className="mt-4"
                disabled={working}
                onClick={() =>
                  void adopt(pending.release, pending.label).then((ok) => {
                    if (ok) returnToList();
                  })
                }
              >
                Adopt pending release
              </Button>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="submit"
                tone="primary"
                loading={working}
                disabled={
                  !valid || working || Boolean(pending) || (!isNew && !editing)
                }
              >
                {editing ? "Publish revision and adopt" : "Publish and adopt"}
              </Button>
              <Button
                type="button"
                tone="outline"
                disabled={working}
                onClick={() => {
                  if (!dirty || window.confirm("Discard this Model change?"))
                    returnToList();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DraftRequired>
      )}
    </main>
  );
}

function CardinalityFields({
  minimum,
  maximum,
  onMinimum,
  onMaximum,
}: {
  minimum: number;
  maximum: string;
  onMinimum(value: number): void;
  onMaximum(value: string): void;
}) {
  return (
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <Field label="Minimum values" required>
        <Input
          required
          min={0}
          type="number"
          value={minimum}
          onChange={(event) => onMinimum(Number(event.target.value))}
          className="mt-2 w-full"
        />
      </Field>
      <Field label="Maximum values">
        <Input
          min={0}
          type="number"
          value={maximum}
          onChange={(event) => onMaximum(event.target.value)}
          placeholder="Unbounded"
          className="mt-2 w-full"
        />
      </Field>
    </div>
  );
}

function ConceptSelect({
  label,
  value,
  concepts,
  onChange,
}: {
  label: string;
  value: string;
  concepts: WorldModelOption[];
  onChange(value: string): void;
}) {
  return (
    <Field label={label} required>
      <Select
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full"
      >
        {value && !concepts.some((option) => option.elementId === value) && (
          <option value={value}>Unavailable Concept</option>
        )}
        <option value="" disabled>
          Choose a Concept
        </option>
        {concepts.map((concept) => (
          <option key={concept.key} value={concept.elementId ?? ""}>
            {protectedComparisonText(
              concept.name,
              new Set(
                concepts.flatMap((option) =>
                  option.elementId ? [option.elementId] : [],
                ),
              ),
            )
              ? "Unnamed Concept"
              : concept.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function releaseReference(release: {
  identity: {
    id: string;
    lineageId: string;
    predecessorRevisionId?: string;
  };
  dependencies?: ReadonlyArray<{ releaseId: string }>;
}) {
  return {
    id: release.identity.id,
    registryId: release.identity.lineageId,
    predecessorRevisionId: release.identity.predecessorRevisionId,
    dependencyReleaseIds: (release.dependencies ?? []).map(
      ({ releaseId }) => releaseId,
    ),
  };
}

function parseOptionalJson(value: string): {
  valid: boolean;
  value?: JsonValue;
} {
  if (!value.trim()) return { valid: true };
  try {
    return { valid: true, value: JSON.parse(value) as JsonValue };
  } catch {
    return { valid: false };
  }
}

function objectValue(value: unknown): Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function isStructureKind(value: unknown): value is ModelStructureKind {
  return (
    typeof value === "string" &&
    MODEL_STRUCTURE_KINDS.includes(value as ModelStructureKind)
  );
}

function isAtomicKind(value: unknown): value is ModelFieldAtomicKind {
  return FIELD_KINDS.some((option) => option.value === value);
}

function isReferencePolicy(
  value: unknown,
): value is "same-release" | "captured-upstream" | "runtime-local" {
  return (
    value === "same-release" ||
    value === "captured-upstream" ||
    value === "runtime-local"
  );
}
