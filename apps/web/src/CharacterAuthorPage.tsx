import { WorldRecordRemoval } from "./WorldRecordRemoval";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useLocation } from "@tanstack/react-router";
import { Alert, Button, Fieldset } from "@aow/ui";
import {
  ApiRequestError,
  saveWorldDefinitionDraft,
  type WorldDraftRecord,
} from "./api";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { RouterButtonLink, useInternalNavigate } from "./navigation";
import {
  definitionConformance,
  draftWithIndexedRecord,
  worldWorkspaceSuffix,
} from "./worldAuthoringModel";
import { mechanicsObject, type MechanicsObject } from "./itemMechanicsModel";
import { RuleTextField } from "./RuleValueFields";
import { useEditorSave } from "./useEditorSave";
import { ProfessionAuthoringFields } from "./ProfessionAuthoringFields";
import { CharacterOptionFields } from "./CharacterOptionFields";
import { prerequisiteDefinitionOptions } from "./itemActionPrerequisitesModel";
import {
  characterAuthorBase,
  characterAuthorName,
  characterAuthorRecord,
  characterAuthorTitle,
  newCharacterAuthor,
  type CharacterAuthorKind,
} from "./characterAuthoringModel";

export function CharacterAuthorPage({
  kind,
  sourceId,
}: {
  kind: CharacterAuthorKind;
  sourceId?: string;
}) {
  const { definition, draft, canEdit } = useWorldAuthoring();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  if (sourceId)
    return (
      <CharacterAuthorEditor
        key={`${kind}/${sourceId}`}
        kind={kind}
        sourceId={sourceId}
      />
    );
  const base = characterAuthorBase(definition.id, kind);
  const records = (draft?.records ?? []).filter(
    (r) =>
      r.resourceType === "definitions" &&
      mechanicsObject(r.payload).kind === kind,
  );
  const ids = new Set(draft?.records.map((r) => r.sourceId));
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">{characterAuthorTitle(kind)}s</h1>
      <RouterButtonLink
        className="min-h-11"
        href={`/worlds/${encodeURIComponent(definition.id)}/characters${suffix}`}
      >
        Character options
      </RouterButtonLink>
      {canEdit && (
        <RouterButtonLink className="min-h-11" href={`${base}/new${suffix}`}>
          Create {characterAuthorTitle(kind)}
        </RouterButtonLink>
      )}
      {records.length === 0 && <p>No {kind}s yet.</p>}
      {records.map((record, index) => (
        <div key={`${record.sourceId}/${index}`}>
          <RouterButtonLink
            className="min-h-11"
            href={`${base}/${encodeURIComponent(record.sourceId)}${suffix}`}
          >
            {characterAuthorName(record, ids)}
          </RouterButtonLink>
        </div>
      ))}
    </main>
  );
}
function CharacterAuthorEditor({
  kind,
  sourceId,
}: {
  kind: CharacterAuthorKind;
  sourceId: string;
}) {
  const { definition, draft, canEdit, adoptDraft, markDirty } =
    useWorldAuthoring();
  const navigate = useInternalNavigate();
  const suffix = worldWorkspaceSuffix(useLocation().searchStr);
  const base = characterAuthorBase(definition.id, kind);
  const title = characterAuthorTitle(kind),
    isNew = sourceId === "new";
  const createdId = useRef(crypto.randomUUID());
  let issue = "";
  let existing: WorldDraftRecord | undefined;
  try {
    if (!isNew)
      existing = characterAuthorRecord(draft?.records ?? [], kind, sourceId);
  } catch (e) {
    issue = e instanceof Error ? e.message : "This option is unavailable.";
  }
  const [form, setForm] = useState<MechanicsObject>(() =>
    isNew
      ? newCharacterAuthor(kind, createdId.current)
      : mechanicsObject(existing?.payload),
  );
  const [revision, setRevision] = useState(draft?.storageRevision);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const leaving = useRef(false),
    save = useEditorSave(JSON.stringify(form));
  const identity = mechanicsObject(form.identity),
    components = mechanicsObject(form.components);
  const ids = new Set(draft?.records.map((r) => r.sourceId));
  const conformance = draft ? definitionConformance(draft, kind) : undefined;
  const disabled =
    !canEdit || save.saving || conflict || !!issue || !conformance;
  useBlocker({
    shouldBlockFn: () =>
      !leaving.current &&
      (save.saving ||
        (save.hasChanges() &&
          !window.confirm("Leave without saving this Character option?"))),
    enableBeforeUnload: save.dirty || save.saving,
  });
  useEffect(() => {
    if (save.dirty) markDirty();
  }, [save.dirty, markDirty]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || revision === undefined || disabled || (!existing && !isNew))
      return;
    await save.run(async () => {
      setError("");
      try {
        const id = isNew ? createdId.current : sourceId;
        const record = {
          ...(existing ?? {}),
          resourceType: "definitions",
          sourceId: id,
          payload: {
            ...form,
            conformance: {
              ...mechanicsObject(form.conformance),
              ...conformance,
            },
          },
        };
        const next = await saveWorldDefinitionDraft(definition.id, {
          ...draftWithIndexedRecord(draft, record),
          storageRevision: revision,
        });
        adoptDraft({ ...next, effectiveModels: draft.effectiveModels });
        setRevision(next.storageRevision);
        save.markSaved(JSON.stringify(form));
        if (isNew) {
          leaving.current = true;
          await navigate(`${base}/${encodeURIComponent(id)}${suffix}`, {
            replace: true,
          });
        }
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 409) {
          setConflict(true);
          setError(
            "This World draft changed elsewhere. Reload before saving. Your changes remain here.",
          );
        } else
          setError(
            "These changes could not be saved. Check the fields and try again.",
          );
      }
    });
  }
  const link = (key: string, label: string) =>
    isNew ? (
      <p key={key}>
        Save this {title} before editing {label.toLowerCase()}.
      </p>
    ) : (
      <RouterButtonLink
        key={key}
        className="min-h-11"
        href={`${base}/${encodeURIComponent(sourceId)}/rule/${key}${suffix}`}
      >
        Manage {label}
      </RouterButtonLink>
    );
  if (
    !draft ||
    issue ||
    components !== form.components ||
    identity !== form.identity
  )
    return (
      <main className="p-4">
        <Alert tone="warning">
          {issue ||
            "This option contains unsupported data. Existing content is preserved."}
        </Alert>
        <RouterButtonLink href={`${base}${suffix}`}>
          Back to {title}s
        </RouterButtonLink>
      </main>
    );
  const byKind = Object.fromEntries(
    ["profession", "skill", "feat", "trait", "action", "item"].map((k) => [
      k,
      prerequisiteDefinitionOptions(
        draft.records.filter((r) => mechanicsObject(r.payload).kind === k),
      ),
    ]),
  );
  const context = {
    recordIds: ids,
    definitions: prerequisiteDefinitionOptions(draft.records),
    value: components,
    onChange: (value: MechanicsObject) =>
      setForm({ ...form, components: value }),
    renderCollection: link,
  };
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      <h1 className="text-3xl font-semibold">
        {isNew ? "Create" : "Edit"} {title}
      </h1>
      <RouterButtonLink className="min-h-11" href={`${base}${suffix}`}>
        Back to {title}s
      </RouterButtonLink>
      {!canEdit && <Alert tone="warning">This World draft is read only.</Alert>}
      {!conformance && (
        <Alert tone="warning">
          The effective {title} Model is unavailable. Select a complete Model
          release before saving.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <form className="space-y-4" onSubmit={submit}>
        <Fieldset disabled={disabled} className="space-y-4">
          <RuleTextField
            recordIds={ids}
            label="Name"
            value={identity.name}
            onChange={(name) =>
              setForm({ ...form, identity: { ...identity, name } })
            }
          />
          <RuleTextField
            recordIds={ids}
            label={kind === "background" ? "Backstory" : "Description"}
            value={identity.description}
            onChange={(description) =>
              setForm({ ...form, identity: { ...identity, description } })
            }
          />
          {kind === "profession" ? (
            <ProfessionAuthoringFields
              {...context}
              type="profession"
              definitionsByKind={byKind}
              ranks={draft.effectiveModels?.professionRanks ?? []}
            />
          ) : (
            <CharacterOptionFields
              {...context}
              type="background"
              skillDefinitions={byKind.skill}
              featDefinitions={byKind.feat}
              attributeDefinitions={(
                draft.effectiveModels?.attributes ?? []
              ).map((a) => ({ id: a.key, label: a.name }))}
              itemDefinitions={prerequisiteDefinitionOptions(
                draft.records.filter(
                  (r) => mechanicsObject(r.payload).kind === "item",
                ),
              )}
            />
          )}
          <Button
            type="submit"
            className="min-h-11"
            disabled={
              typeof identity.name !== "string" || !identity.name.trim()
            }
          >
            {save.saving ? "Saving…" : `Save ${title}`}
          </Button>
        </Fieldset>
        <Button
          type="button"
          className="min-h-11"
          disabled={save.saving}
          onClick={() => {
            leaving.current = true;
            void navigate(`${base}${suffix}`);
          }}
        >
          Cancel
        </Button>
      </form>
      {existing && (
        <WorldRecordRemoval
          record={existing}
          path={`characters/${kind}s`}
          returnPath={base}
          disabled={save.dirty || save.saving}
        />
      )}
    </main>
  );
}
