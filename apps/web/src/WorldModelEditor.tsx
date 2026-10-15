import { RuleTextField } from "./RuleValueFields";
import { protectedComparisonText } from "./comparisonPrerequisiteModel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Field, Fieldset, Input, Legend, Select } from "@aow/ui";
import {
  ApiRequestError,
  createModelRegistry,
  extendModelRegistryRelease,
  getModelRegistry,
  listModelRegistries,
  type ModelRegistrySummary,
  type WorldModelOption,
} from "./api";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import { DraftRequired, useWorldAuthoring } from "./WorldAuthoringShell";
import {
  draftAdoptingRegistryRelease,
  recoverableRegistryRelease,
  modelExtensionKey,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
const objectValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function WorldModelEditor({
  kind,
  context = "effective",
}: {
  kind: "attributes" | "equipment-slots" | "profession-ranks";
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
  const isList = context === "effective";
  const isNew = context === "new";
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters/model/${kind}`;
  const suffix = worldWorkspaceSuffix(location.searchStr);
  const listHref = `${base}/effective${suffix}`;
  function returnToList() {
    leaving.current = true;
    void navigate(listHref);
  }
  const [registries, setRegistries] = useState<ModelRegistrySummary[]>([]);
  const [registryId, setRegistryId] = useState("");
  const [name, setName] = useState("");
  const [minimum, setMinimum] = useState(0);
  const [maximum, setMaximum] = useState(100);
  const [defaultValue, setDefaultValue] = useState(50);
  const [order, setOrder] = useState(0);
  const [editing, setEditing] = useState<WorldModelOption>();
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
  const options =
    kind === "attributes"
      ? draft?.effectiveModels?.attributes
      : kind === "equipment-slots"
        ? draft?.effectiveModels?.equipmentSlots
        : draft?.effectiveModels?.professionRanks;
  const modelLabel =
    kind === "attributes"
      ? "Attribute"
      : kind === "equipment-slots"
        ? "Equipment Slot"
        : "Profession Rank";
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
  const modelMetadataValid =
    Number.isInteger(order) &&
    (kind !== "attributes" ||
      (Number.isInteger(minimum) &&
        Number.isInteger(maximum) &&
        Number.isInteger(defaultValue) &&
        minimum <= defaultValue &&
        defaultValue <= maximum));
  const modelDirty =
    Boolean(name.trim()) ||
    Boolean(editing) ||
    order !== 0 ||
    (kind === "attributes" &&
      (minimum !== 0 || maximum !== 100 || defaultValue !== 50));
  useBlocker({
    shouldBlockFn: () =>
      !leaving.current &&
      modelDirty &&
      !window.confirm("Leave without publishing this Model option?"),
    enableBeforeUnload: modelDirty,
  });
  useEffect(() => {
    if (modelDirty) markDirty();
  }, [markDirty, modelDirty]);
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
        setMessage(
          "Editable Model Registries could not be loaded. No release was changed.",
        ),
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
          release: {
            id: recovery.identity.id,
            registryId: recovery.identity.lineageId,
            predecessorRevisionId: recovery.identity.predecessorRevisionId,
            dependencyReleaseIds: (recovery.dependencies ?? []).map(
              ({ releaseId }) => releaseId,
            ),
          },
          label: safeLabel(recovery.name || "Published Model release"),
        });
        setMessage(
          "A published Model release is ready to adopt into this World draft. Adopt it before publishing another option.",
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [draft, pending, registryId]);

  useEffect(() => {
    if (
      isList ||
      isNew ||
      initialized.current ||
      !options ||
      !registries.length
    )
      return;
    initialized.current = true;
    const matches = options.filter((option) => option.elementId === context);
    const selected = matches.length === 1 ? matches[0] : undefined;
    if (
      selected &&
      gmRegistries.some(
        (registry) => registry.identity.id === selected.registryId,
      )
    )
      editOption(selected);
    else
      setMessage(
        "This Model option is unavailable or read only. Return to the list to choose an editable option.",
      );
  }, [context, options, registries]);

  if (!canEdit)
    return (
      <main className="[&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11 [&_a]:min-h-11 mx-auto max-w-4xl px-6 py-12 lg:px-10">
        <h1 className="text-4xl font-semibold">{modelLabel}s</h1>
        <Alert tone="warning" className="mt-8">
          {draft?.status === "stale"
            ? "This World draft changed elsewhere. Reload it before publishing or adopting Model releases."
            : "This World is archived and read only. Restore it before publishing or adopting Model releases."}
        </Alert>
      </main>
    );

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
    const adoptedDraft = draftAdoptingRegistryRelease(
      draft,
      draft.effectiveModels?.releases ?? [],
      release,
    );
    if (!adoptedDraft) {
      setMessage(
        "The World’s selected Model release changed. Reload this workspace before adopting the new release.",
      );
      return false;
    }
    const saved = await saveDraft(adoptedDraft);
    if (!saved) {
      setPending({ release, label });
      setMessage(
        `${safeLabel(label)} was published in the Model Registry, but this World did not adopt that release. Review the draft conflict, then retry adoption.`,
      );
      return false;
    }
    try {
      await refreshEffectiveModels();
    } catch {
      setPending(undefined);
      setMessage(
        `${safeLabel(label)} was published and adopted. Reload the workspace to see the refreshed editor fields.`,
      );
      return true;
    }
    setPending(undefined);
    setMessage(
      `${safeLabel(label)} is now part of this World’s selected Model release and is available in compatible editors.`,
    );
    return true;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !draft ||
      !canEdit ||
      working ||
      pending ||
      !modelMetadataValid ||
      !name.trim() ||
      (!isNew && !editing)
    )
      return;
    const vocabularyRole =
      kind === "attributes"
        ? "aow:attribute-registry"
        : kind === "equipment-slots"
          ? "aow:equipment-slot-registry"
          : "aow:profession-rank-registry";
    const semanticRole =
      kind === "attributes"
        ? "aow:attribute"
        : kind === "equipment-slots"
          ? "aow:equipment-slot"
          : "aow:profession-rank";
    const vocabulary = draft.effectiveModels?.elements?.find(
      (element) =>
        element.semanticRole === vocabularyRole &&
        element.payload?.kind === "vocabulary",
    );
    if (!vocabulary?.elementId) {
      setMessage(
        `The effective ${modelLabel} vocabulary could not be resolved. No release was changed.`,
      );
      return;
    }
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
        await adopt(
          {
            id: recovery.identity.id,
            registryId: recovery.identity.lineageId,
            predecessorRevisionId: recovery.identity.predecessorRevisionId,
            dependencyReleaseIds: (recovery.dependencies ?? []).map(
              ({ releaseId }) => releaseId,
            ),
          },
          recovery.name || "Published Model release",
        );
        return;
      }
      const predecessor = registry.releases[0];
      const currentElement = editing
        ? registry.elements.find((element) => element.id === editing.elementId)
        : undefined;
      if (
        editing &&
        (!currentElement?.currentRevision ||
          (editing.revisionId &&
            editing.revisionId !== currentElement.currentRevision.identity.id))
      ) {
        setMessage(
          "That Model option changed or is no longer editable. Reload and try again.",
        );
        return;
      }
      const valueMetadata =
        kind === "attributes"
          ? {
              ...(!currentElement ||
              minimum !== 0 ||
              objectValue(
                currentElement.currentRevision?.payload.valueMetadata,
              )["aow:minimum"] !== undefined
                ? { "aow:minimum": minimum }
                : {}),
              ...(!currentElement ||
              maximum !== 100 ||
              objectValue(
                currentElement.currentRevision?.payload.valueMetadata,
              )["aow:maximum"] !== undefined
                ? { "aow:maximum": maximum }
                : {}),
              ...(!currentElement ||
              defaultValue !== 50 ||
              objectValue(
                currentElement.currentRevision?.payload.valueMetadata,
              )["aow:default"] !== undefined
                ? { "aow:default": defaultValue }
                : {}),
            }
          : undefined;
      const presentation = {
        ...(currentElement?.currentRevision?.presentation ?? {}),
        label: name.trim(),
        ...(order ||
        currentElement?.currentRevision?.presentation.order !== undefined
          ? { order }
          : {}),
      };
      const payload = currentElement?.currentRevision
        ? {
            ...currentElement.currentRevision.payload,
            ...(valueMetadata &&
            (Object.keys(valueMetadata).length ||
              currentElement.currentRevision.payload.valueMetadata !==
                undefined)
              ? {
                  valueMetadata: {
                    ...objectValue(
                      currentElement.currentRevision.payload.valueMetadata,
                    ),
                    ...valueMetadata,
                  },
                }
              : {}),
          }
        : {
            kind: "vocabulary-option",
            vocabularyId: vocabulary.elementId,
            ...(valueMetadata ? { valueMetadata } : {}),
          };
      const result = await extendModelRegistryRelease(selected.identity.id, {
        name: `${editing ? "Revise" : "Add"} ${name.trim()}`,
        predecessorRevisionId: predecessor?.identity.id,
        ...(editing && currentElement?.currentRevision
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
                  key: modelExtensionKey(kind, name),
                  kind: "vocabulary-option" as const,
                  semanticRole,
                  applicability: { kind: "global" },
                  payload,
                  presentation,
                },
              ],
            }),
      });
      const label = name.trim();
      const adopted = await adopt(
        {
          id: result.release.identity.id,
          registryId: result.release.identity.lineageId,
          predecessorRevisionId: result.release.identity.predecessorRevisionId,
          dependencyReleaseIds: (result.release.dependencies ?? []).map(
            ({ releaseId }) => releaseId,
          ),
        },
        label,
      );
      if (adopted) {
        setName("");
        setMinimum(0);
        setMaximum(100);
        setDefaultValue(50);
        setOrder(0);
        setEditing(undefined);
        returnToList();
      }
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError && error.status === 409
          ? "The Model Registry advanced before this release was published. Reload and try again."
          : "The Model release could not be published. No World draft selection was changed.",
      );
    } finally {
      setWorking(false);
    }
  }

  function editOption(option: WorldModelOption) {
    if (
      (option.presentation?.label !== undefined &&
        typeof option.presentation.label !== "string") ||
      (option.presentation?.order !== undefined &&
        typeof option.presentation.order !== "number")
    ) {
      setMessage("This imported Model presentation is preserved read only.");
      return;
    }
    const supplied = option.payload?.valueMetadata;
    if (
      supplied !== undefined &&
      (typeof supplied !== "object" ||
        supplied === null ||
        Array.isArray(supplied))
    ) {
      setMessage(
        "This imported Model option has unsupported numeric data and is preserved read only.",
      );
      return;
    }
    const metadata = objectValue(option.payload?.valueMetadata);
    setEditing(option);
    setRegistryId(option.registryId ?? "");
    setName(option.name);
    setMinimum(
      typeof metadata["aow:minimum"] === "number" ? metadata["aow:minimum"] : 0,
    );
    setMaximum(
      typeof metadata["aow:maximum"] === "number"
        ? metadata["aow:maximum"]
        : 100,
    );
    setDefaultValue(
      typeof metadata["aow:default"] === "number"
        ? metadata["aow:default"]
        : 50,
    );
    setOrder(
      typeof option.presentation?.order === "number"
        ? option.presentation.order
        : 0,
    );
    setMessage("");
  }

  async function archiveOption(option: WorldModelOption) {
    if (
      !draft ||
      !canEdit ||
      working ||
      !option.registryId ||
      !option.elementId ||
      !window.confirm(
        `Archive ${safeLabel(option.name)}? Existing releases will retain it, but the new release will omit it.`,
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
        await adopt(
          {
            id: recovery.identity.id,
            registryId: recovery.identity.lineageId,
            predecessorRevisionId: recovery.identity.predecessorRevisionId,
            dependencyReleaseIds: (recovery.dependencies ?? []).map(
              ({ releaseId }) => releaseId,
            ),
          },
          recovery.name || "Published Model release",
        );
        return;
      }
      const result = await extendModelRegistryRelease(option.registryId, {
        name: `Archive ${safeLabel(option.name)}`,
        predecessorRevisionId: registry.releases[0]?.identity.id,
        archiveElementIds: [option.elementId],
      });
      await adopt(
        {
          id: result.release.identity.id,
          registryId: result.release.identity.lineageId,
          predecessorRevisionId: result.release.identity.predecessorRevisionId,
          dependencyReleaseIds: (result.release.dependencies ?? []).map(
            ({ releaseId }) => releaseId,
          ),
        },
        option.name,
      );
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError && error.status === 409
          ? "The Model Registry advanced before this option was archived. Reload and try again."
          : "The Model option could not be archived. No World draft selection was changed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="[&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11 [&_a]:min-h-11 mx-auto max-w-4xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Characters · Model &amp; Taxonomies
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {modelLabel}s
      </h1>
      <p className="mt-4 text-base-content/65">
        These values come from the exact immutable Model Schema release selected
        by this World draft.
      </p>
      {isList && message && <Alert className="mt-4">{message}</Alert>}
      {isList && pending && (
        <Button
          className="mt-4"
          disabled={working}
          onClick={() =>
            void adopt(pending.release, pending.label).then((ok) => {
              if (ok) returnToList();
            })
          }
        >
          Retry adoption
        </Button>
      )}
      {isList && (
        <RouterButtonLink
          href={`${base}/new${suffix}`}
          tone="primary"
          className="mt-6"
        >
          Add {modelLabel}
        </RouterButtonLink>
      )}
      {!isList && (
        <RouterButtonLink href={listHref} tone="outline" className="mt-6">
          Back to {modelLabel}s
        </RouterButtonLink>
      )}
      {isList && (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {(options ?? []).map((option) => (
            <li
              key={option.key}
              className="rounded-box border border-base-300 bg-base-200 p-4"
            >
              <span className="font-semibold">{safeLabel(option.name)}</span>
              {option.description && (
                <p className="mt-1 text-sm text-base-content/55">
                  {safeLabel(option.description)}
                </p>
              )}
              {gmRegistries.some(
                (registry) => registry.identity.id === option.registryId,
              ) && (
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
                    onClick={() => void archiveOption(option)}
                  >
                    Archive
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {isList && !options?.length && (
        <Alert tone="warning" className="mt-6">
          No effective options are available for this World.
        </Alert>
      )}
      {!isList && (
        <DraftRequired>
          <form
            onSubmit={(event) => void submit(event)}
            className="mt-8 rounded-box border border-base-300 p-5"
          >
            <h2 className="text-xl font-semibold">
              {editing ? "Edit" : "Add"} {modelLabel}
            </h2>
            <p className="mt-2 text-sm text-base-content/60">
              This publishes a successor release, then explicitly adopts that
              exact release in the working World draft.
            </p>
            {gmRegistries.length > 1 ? (
              <Field label="Editable Model Registry" className="mt-4">
                <Select
                  value={registryId}
                  disabled={Boolean(editing)}
                  onChange={(event) => setRegistryId(event.target.value)}
                  className="mt-2 w-full"
                >
                  {gmRegistries.map((registry) => (
                    <option
                      key={registry.identity.id}
                      value={registry.identity.id}
                    >
                      {safeLabel(registry.name || "Unnamed Model Registry")}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="mt-4 text-sm text-base-content/55">
                {gmRegistries[0]
                  ? `Publishing to ${safeLabel(gmRegistries[0].name || "your editable Model Registry")}.`
                  : "Your editable Custom Models registry will be created when you publish the first option."}
              </p>
            )}
            <RuleTextField
              label="Display name"
              value={name}
              onChange={setName}
              recordIds={recordIds}
            />
            {kind === "attributes" && (
              <Fieldset className="mt-5 rounded-box border border-base-300 p-4">
                <Legend className="px-2 font-semibold">Numeric behavior</Legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Minimum" required>
                    <Input
                      required
                      type="number"
                      value={minimum}
                      onChange={(event) =>
                        setMinimum(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </Field>
                  <Field label="Maximum" required>
                    <Input
                      required
                      type="number"
                      value={maximum}
                      onChange={(event) =>
                        setMaximum(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </Field>
                  <Field label="Default" required>
                    <Input
                      required
                      type="number"
                      value={defaultValue}
                      onChange={(event) =>
                        setDefaultValue(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </Field>
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
                {!modelMetadataValid && (
                  <p className="mt-3 text-sm text-error" role="alert">
                    Use whole numbers and keep the default between the minimum
                    and maximum.
                  </p>
                )}
              </Fieldset>
            )}
            {kind !== "attributes" && (
              <Field label="Display order" required className="mt-4">
                <Input
                  required
                  type="number"
                  value={order}
                  onChange={(event) => setOrder(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </Field>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="submit"
                tone="primary"
                loading={working}
                disabled={
                  working ||
                  Boolean(pending) ||
                  draft?.status === "stale" ||
                  !name.trim() ||
                  !modelMetadataValid ||
                  (!isNew && !editing)
                }
              >
                {editing ? "Publish revision and adopt" : "Publish and adopt"}
              </Button>
              <Button
                type="button"
                tone="outline"
                disabled={working}
                onClick={() => {
                  if (
                    !modelDirty ||
                    window.confirm("Discard this Model change?")
                  )
                    returnToList();
                }}
              >
                Cancel
              </Button>
              {pending && (
                <Button
                  type="button"
                  tone="outline"
                  disabled={draft?.status === "stale"}
                  onClick={() =>
                    void adopt(pending.release, pending.label).then((ok) => {
                      if (ok) returnToList();
                    })
                  }
                >
                  Retry adoption
                </Button>
              )}
            </div>
            {message && (
              <Alert className="mt-4" aria-live="polite">
                {message}
              </Alert>
            )}
          </form>
        </DraftRequired>
      )}
    </main>
  );
}
