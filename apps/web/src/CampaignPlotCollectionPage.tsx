import { useState, type FormEvent } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Textarea,
} from "@aow/ui";
import {
  CampaignDraftRequired,
  useCampaignDefinitionAuthoring,
} from "./CampaignDefinitionAuthoringShell";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";
import { recordObject } from "./campaignAuthoringModel";
import { quickStartSuffix } from "./quickStartModel";
import {
  childRecords,
  childText,
  discoveryClaims,
  plotClaimReferences,
  putDiscoveryClaims,
  putPlotChild,
  type PlotCollection,
  type ChildRecord,
} from "./campaignPlotCollectionModel";

const labels = {
  objectives: "Objectives",
  pressures: "Pressures",
  resistances: "Resistances",
  discoveries: "Discoveries",
};
const singular = {
  objectives: "objective",
  pressures: "pressure",
  resistances: "resistance",
  discoveries: "discovery",
};
export interface CampaignPlotCollectionPageProps {
  plotId: string;
  collection: string;
  childId?: string;
  claimsPage?: boolean;
  claimId?: string;
}
export function CampaignPlotCollectionPage(
  props: CampaignPlotCollectionPageProps,
) {
  // Route identity resets local forms only on navigation, never after a failed save.
  return (
    <CollectionScreen
      key={[
        props.plotId,
        props.collection,
        props.childId,
        props.claimsPage,
        props.claimId,
      ].join("/")}
      {...props}
    />
  );
}
function CollectionScreen({
  plotId,
  collection: rawCollection,
  childId,
  claimsPage,
  claimId,
}: CampaignPlotCollectionPageProps) {
  const { definition, draft, saveRecord, markDirty, canEdit, saveState } =
    useCampaignDefinitionAuthoring();
  const navigate = useInternalNavigate();
  const suffix = quickStartSuffix(useLocation().searchStr);
  const collection = rawCollection as PlotCollection;
  const plot = draft?.records.find(
    (record) => record.resourceType === "plots" && record.sourceId === plotId,
  );
  const payload = plot ? recordObject(plot) : {};
  const children = childRecords(payload[collection]);
  const discovery = children.find((child) => child.id === childId);
  const entries =
    claimsPage && discovery ? discoveryClaims(discovery) : children;
  const editingId = claimsPage ? claimId : childId;
  const existing = entries.find((child) => child.id === editingId);
  const [form, setForm] = useState<ChildRecord>(
    existing ??
      (claimsPage
        ? {
            kind: entries.some((entry) => entry.kind === "truth")
              ? "belief"
              : "truth",
            statement: "",
            provenance: "",
            relation: "supports",
          }
        : {
            name: "",
            ...(collection === "discoveries"
              ? {
                  truth: { id: crypto.randomUUID(), statement: "" },
                  beliefs: [],
                  rumors: [],
                }
              : { description: "" }),
          }),
  );
  const [error, setError] = useState("");
  const base = `/campaigns/definitions/${encodeURIComponent(definition.id)}/plots/${encodeURIComponent(plotId)}/${collection}`;
  const list = claimsPage
    ? `${base}/${encodeURIComponent(childId ?? "")}/claims`
    : base;
  const title = claimsPage ? "Discovery facets" : labels[collection];
  const itemLabel = claimsPage ? "facet" : singular[collection];
  const claimOptions = childRecords(payload.discoveries).flatMap((item) =>
    discoveryClaims(item).map((claim) => ({
      claim,
      label: `${childText(item.name) || "Discovery"} · ${childText(claim.statement) || "Claim"}`,
    })),
  );
  function update(field: string, value: ChildRecord[string]) {
    setForm((previous) => ({ ...previous, [field]: value }));
    markDirty();
  }
  async function persist(next: ChildRecord[]) {
    if (!plot || !canEdit || saveState === "saving") return false;
    return saveRecord({
      ...plot,
      payload: {
        ...payload,
        [collection]: claimsPage
          ? putPlotChild(children, putDiscoveryClaims(discovery!, next))
          : next,
      },
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!childText(form[claimsPage ? "statement" : "name"]).trim()) return;
    const value: ChildRecord = {
      ...form,
      id: existing?.id ?? crypto.randomUUID(),
    };
    if (claimsPage) {
      if (
        value.kind === "truth" &&
        entries.some(
          (entry) => entry.kind === "truth" && entry.id !== existing?.id,
        )
      ) {
        setError(
          "This discovery already has a truth. Edit that truth or choose Belief or Rumor.",
        );
        return;
      }
      if (
        existing?.kind === "truth" &&
        value.kind !== "truth" &&
        claimOptions.some(
          ({ claim }) =>
            claim.id !== existing.id &&
            claim.relatedTruthClaimId === existing.id,
        )
      ) {
        setError(
          "This truth is referenced by a rumor. Remove its related-truth reference before changing this claim’s kind.",
        );
        return;
      }
      const target = childText(value.relatedTruthClaimId);
      if (
        value.kind === "rumor" &&
        target &&
        !claimOptions.some(
          (option) =>
            option.claim.id === target && option.claim.kind === "truth",
        )
      ) {
        setError("Choose an available truth claim.");
        return;
      }
      // Kind transitions intentionally remove fields that do not belong to the new variant.
      if (value.kind === "truth") {
        delete value.conflictsWithClaimIds;
        delete value.relatedTruthClaimId;
        delete value.relation;
      }
      if (value.kind === "belief") delete value.relatedTruthClaimId;
      if (
        value.kind !== "truth" &&
        value.relation !== "supports" &&
        value.relation !== "contradicts"
      ) {
        value.relation = "supports";
      }
    }
    if (await persist(putPlotChild(entries, value)))
      await navigate(`${list}${suffix}`);
  }
  async function remove(entry: ChildRecord) {
    setError("");
    const removed = new Set(
      claimsPage
        ? [childText(entry.id)]
        : collection === "discoveries"
          ? discoveryClaims(entry).map((claim) => childText(claim.id))
          : [],
    );
    const references = plotClaimReferences(payload, removed);
    if (references.length) {
      setError(
        `Remove the references to this ${itemLabel} first: ${references.join("; ")}`,
      );
      return;
    }
    if (
      !window.confirm(
        `Delete ${childText(entry[claimsPage ? "statement" : "name"]) || `this ${itemLabel}`}? This removes its authored content from this draft.`,
      )
    )
      return;
    if (
      (await persist(entries.filter((child) => child.id !== entry.id))) &&
      editingId
    )
      await navigate(`${list}${suffix}`);
  }
  if (!(rawCollection in labels))
    return <Alert tone="warning">This Plot collection is unavailable.</Alert>;
  if (
    !plot ||
    (claimsPage && !discovery) ||
    (editingId && editingId !== "new" && !existing)
  )
    return (
      <Alert tone="warning">
        This Plot content is unavailable. Return to the Plot and choose an
        available entry.
      </Alert>
    );
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold">
        {editingId
          ? `${editingId === "new" ? "Add" : "Edit"} ${itemLabel}`
          : title}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        {childText(payload.name)}
        {claimsPage ? ` · ${childText(discovery?.name)}` : ""}
      </p>
      <CampaignDraftRequired>
        {collection === "discoveries" &&
          discovery &&
          discoveryClaims(discovery).length === 0 && (
            <Alert tone="warning" className="mt-4">
              Add the truth and at least one supporting or contradicting belief
              or rumor before publishing.
            </Alert>
          )}
        {error && (
          <Alert tone="warning" className="mt-4">
            {error}
          </Alert>
        )}
        {!editingId ? (
          <>
            <RouterButtonLink className="mt-6" href={`${list}/new${suffix}`}>
              Add {itemLabel}
            </RouterButtonLink>
            <ul className="mt-6 space-y-3">
              {entries.map((entry) => (
                <li
                  key={childText(entry.id)}
                  className="rounded border border-slate-700 p-4"
                >
                  <InternalLink
                    href={`${list}/${encodeURIComponent(childText(entry.id))}${suffix}`}
                  >
                    {childText(entry[claimsPage ? "statement" : "name"]) ||
                      `Unnamed ${itemLabel}`}
                  </InternalLink>
                  {claimsPage && <p>{childText(entry.kind)}</p>}
                  <p className="text-sm text-slate-400">
                    {childText(entry.description)}
                  </p>
                  <Button
                    tone="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void remove(entry)}
                  >
                    Delete {itemLabel}
                  </Button>
                </li>
              ))}
            </ul>
            {!entries.length && (
              <p className="mt-6">No {title.toLowerCase()} yet.</p>
            )}
          </>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={submit}>
            {claimsPage ? (
              <>
                <Label>
                  Kind
                  <Select
                    value={childText(form.kind)}
                    onChange={(event) =>
                      update("kind", event.currentTarget.value)
                    }
                  >
                    <option value="truth">Truth</option>
                    <option value="belief">Belief</option>
                    <option value="rumor">Rumor</option>
                  </Select>
                </Label>
                {form.kind !== "truth" && (
                  <Label>
                    Relationship to the truth
                    <Select
                      value={childText(form.relation) || "supports"}
                      onChange={(event) =>
                        update("relation", event.currentTarget.value)
                      }
                    >
                      <option value="supports">Supports</option>
                      <option value="contradicts">Contradicts</option>
                    </Select>
                  </Label>
                )}
                <Label>
                  Statement
                  <Textarea
                    required
                    value={childText(form.statement)}
                    onChange={(event) =>
                      update("statement", event.currentTarget.value)
                    }
                  />
                </Label>
                <Label>
                  Provenance
                  <Textarea
                    value={childText(form.provenance)}
                    onChange={(event) =>
                      update("provenance", event.currentTarget.value)
                    }
                  />
                </Label>
                {form.kind === "rumor" && (
                  <Label>
                    Related truth
                    <Select
                      value={childText(form.relatedTruthClaimId)}
                      onChange={(event) =>
                        update("relatedTruthClaimId", event.currentTarget.value)
                      }
                    >
                      <option value="">No related truth</option>
                      {childText(form.relatedTruthClaimId) &&
                        !claimOptions.some(
                          ({ claim }) =>
                            claim.id === form.relatedTruthClaimId &&
                            claim.kind === "truth",
                        ) && (
                          <option value={childText(form.relatedTruthClaimId)}>
                            Unavailable truth — choose a replacement or clear
                          </option>
                        )}
                      {claimOptions
                        .filter(
                          ({ claim }) =>
                            claim.kind === "truth" && claim.id !== existing?.id,
                        )
                        .map(({ claim, label }) => (
                          <option
                            key={childText(claim.id)}
                            value={childText(claim.id)}
                          >
                            {label}
                          </option>
                        ))}
                    </Select>
                  </Label>
                )}
                {form.kind !== "truth" && (
                  <fieldset>
                    <legend>Conflicting claims</legend>
                    {Array.isArray(form.conflictsWithClaimIds) &&
                      form.conflictsWithClaimIds
                        .filter(
                          (id) =>
                            !claimOptions.some(({ claim }) => claim.id === id),
                        )
                        .map((id, index) => (
                          <Label
                            key={childText(id)}
                            className="mt-2 flex gap-2"
                          >
                            <Checkbox
                              checked
                              onChange={() =>
                                update(
                                  "conflictsWithClaimIds",
                                  (Array.isArray(form.conflictsWithClaimIds)
                                    ? form.conflictsWithClaimIds
                                    : []
                                  ).filter((value) => value !== id),
                                )
                              }
                            />
                            Unavailable claim {index + 1} (clear this reference
                            to remove)
                          </Label>
                        ))}
                    {claimOptions
                      .filter(({ claim }) => claim.id !== existing?.id)
                      .map(({ claim, label }) => (
                        <Label
                          key={childText(claim.id)}
                          className="mt-2 flex gap-2"
                        >
                          <Checkbox
                            checked={
                              Array.isArray(form.conflictsWithClaimIds) &&
                              form.conflictsWithClaimIds.includes(claim.id)
                            }
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              const ids = Array.isArray(
                                form.conflictsWithClaimIds,
                              )
                                ? form.conflictsWithClaimIds
                                : [];
                              update(
                                "conflictsWithClaimIds",
                                checked
                                  ? [...ids, claim.id]
                                  : ids.filter((id) => id !== claim.id),
                              );
                            }}
                          />
                          {label}
                        </Label>
                      ))}
                  </fieldset>
                )}
              </>
            ) : (
              <>
                <Label>
                  Name
                  <Input
                    required
                    value={childText(form.name)}
                    onChange={(event) =>
                      update("name", event.currentTarget.value)
                    }
                  />
                </Label>
                {collection !== "discoveries" && (
                  <Label>
                    Description
                    <Textarea
                      value={childText(form.description)}
                      onChange={(event) =>
                        update("description", event.currentTarget.value)
                      }
                    />
                  </Label>
                )}
                {collection === "discoveries" && (
                  <p>
                    {existing ? (
                      <InternalLink
                        href={`${base}/${encodeURIComponent(childText(existing.id))}/claims${suffix}`}
                      >
                        Manage discovery facets (
                        {discoveryClaims(existing).length})
                      </InternalLink>
                    ) : (
                      "Save this discovery, then add its truth and supporting or contradicting beliefs and rumors from the discovery editor."
                    )}
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Save {itemLabel}</Button>
              <RouterButtonLink tone="outline" href={`${list}${suffix}`}>
                Cancel
              </RouterButtonLink>
            </div>
          </form>
        )}
      </CampaignDraftRequired>
    </div>
  );
}
