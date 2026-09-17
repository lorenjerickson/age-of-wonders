import { useState, type FormEvent } from "react";
import { useLocation } from "@tanstack/react-router";
import { Alert, Button, Input, Label, Select, Textarea } from "@aow/ui";
import {
  CampaignDraftRequired,
  useCampaignDefinitionAuthoring,
} from "./CampaignDefinitionAuthoringShell";
import {
  campaignPlotParentCandidates,
  campaignRecordLabel,
  recordObject,
  type CampaignDraftRecord,
} from "./campaignAuthoringModel";
import { InternalLink, useInternalNavigate } from "./navigation";
import { quickStartSuffix } from "./quickStartModel";
import type { JsonValue } from "./api";
const obj = (value: JsonValue | undefined): Record<string, JsonValue> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const arr = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : [];
const text = (value: JsonValue | undefined) =>
  typeof value === "string" ? value : "";
const pageClass = "mx-auto max-w-6xl px-6 py-12 lg:px-10";
const sections = [
  ["subplots", "Subplots"],
  ["objectives", "Objectives"],
  ["pressures", "Pressures"],
  ["resistances", "Resistances"],
  ["discoveries", "Discoveries"],
  ["locations", "Location contexts"],
  ["prerequisites", "Prerequisites"],
  ["dependencies", "Dependencies"],
] as const;

export function CampaignPlotsPage({
  plotId,
  parentPlotId,
}: {
  plotId?: string;
  parentPlotId?: string;
}) {
  const { definition, draft } = useCampaignDefinitionAuthoring();
  const suffix = quickStartSuffix(useLocation().searchStr);
  const records = (draft?.records ?? []).filter(
    (r) => r.resourceType === "plots",
  );
  const selected = records.find((r) => r.sourceId === plotId);
  const parent = records.find((r) => r.sourceId === parentPlotId);
  if (parentPlotId && !parent)
    return (
      <main className={pageClass}>
        <Alert tone="warning">This parent Plot is unavailable.</Alert>
      </main>
    );
  if (plotId === "new")
    return (
      <PlotEditor
        key={`new-${parentPlotId ?? "root"}`}
        parentPlotId={parentPlotId}
      />
    );
  if (
    plotId &&
    (!selected ||
      (parentPlotId &&
        text(obj(recordObject(selected).parent).parentPlotDefinitionId) !==
          parentPlotId))
  )
    return (
      <main className={pageClass}>
        <Alert tone="warning">
          This Plot is unavailable. Choose a Plot from the list.
        </Alert>
        <InternalLink
          href={`/campaigns/definitions/${encodeURIComponent(definition.id)}/plots${suffix}`}
        >
          Back to Plots
        </InternalLink>
      </main>
    );
  if (selected)
    return <PlotEditor key={selected.sourceId} selected={selected} />;
  return <PlotList parent={parent} />;
}

function PlotList({ parent }: { parent?: CampaignDraftRecord }) {
  const { definition, draft, removeRecord } = useCampaignDefinitionAuthoring();
  const suffix = quickStartSuffix(useLocation().searchStr);
  const base = `/campaigns/definitions/${encodeURIComponent(definition.id)}/plots`;
  const records = (draft?.records ?? []).filter(
    (r) => r.resourceType === "plots",
  );
  const children = records.filter((r) =>
    parent
      ? text(obj(recordObject(r).parent).parentPlotDefinitionId) ===
        parent.sourceId
      : obj(recordObject(r).parent).kind === "root",
  );
  const [message, setMessage] = useState("");
  async function remove(record: CampaignDraftRecord) {
    setMessage("");
    const hasChildren = records.some(
      (r) =>
        text(obj(recordObject(r).parent).parentPlotDefinitionId) ===
        record.sourceId,
    );
    const hasReferences =
      records.some((r) =>
        [
          ...arr(recordObject(r).prerequisites),
          ...arr(recordObject(r).dependencies),
        ].some((link) => obj(link).plotDefinitionId === record.sourceId),
      ) ||
      (draft?.records ?? []).some(
        (r) =>
          r.resourceType === "campaign-placements" &&
          arr(recordObject(r).plotDefinitionIds).includes(record.sourceId),
      );
    if (hasChildren || hasReferences) {
      setMessage(
        hasChildren
          ? "Move or delete this Plot’s subplots before deleting it."
          : "Remove this Plot’s prerequisite, dependency, and placement associations before deleting it.",
      );
      return;
    }
    if (
      !window.confirm(
        `Delete ${campaignRecordLabel(record)} and its authored contents?`,
      )
    )
      return;
    await removeRecord("plots", record.sourceId);
  }
  return (
    <main className={pageClass}>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        Story
      </p>
      <h1 className="mt-3 text-4xl font-semibold">
        {parent ? "Subplots" : "Plots"}
      </h1>
      <p className="mt-3 text-base-content/65">
        {parent
          ? `Plots within ${campaignRecordLabel(parent)}.`
          : "Root Plots in this Campaign. Open a Plot to manage its details and child collections."}
      </p>
      <CampaignDraftRequired>
        <div className="mt-6">
          <InternalLink
            className="btn btn-primary"
            href={`${parent ? `${base}/${encodeURIComponent(parent.sourceId)}/subplots/new` : `${base}/new`}${suffix}`}
          >
            {parent ? "Add subplot" : "Add Plot"}
          </InternalLink>
        </div>
        {message && (
          <Alert tone="warning" className="mt-4">
            {message}
          </Alert>
        )}
        <ul className="mt-6 divide-y divide-base-300 rounded-box border border-base-300">
          {children.map((record) => (
            <li
              key={record.sourceId}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="min-w-0">
                <InternalLink
                  className="font-semibold text-primary"
                  href={`${base}/${encodeURIComponent(record.sourceId)}${suffix}`}
                >
                  {campaignRecordLabel(record)}
                </InternalLink>
                <p className="mt-1 text-sm text-base-content/65">
                  {text(recordObject(record).description) ||
                    "No description yet."}
                </p>
              </div>
              <div className="flex gap-3">
                <InternalLink
                  className="btn btn-outline btn-sm"
                  href={`${base}/${encodeURIComponent(record.sourceId)}${suffix}`}
                >
                  Edit Plot
                </InternalLink>
                <Button
                  size="sm"
                  tone="ghost"
                  onClick={() => void remove(record)}
                >
                  Delete Plot
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!children.length && (
          <p className="mt-6 text-base-content/65">
            {parent ? "No subplots yet." : "No Plots yet."}
          </p>
        )}
      </CampaignDraftRequired>
    </main>
  );
}

function PlotEditor({
  selected,
  parentPlotId,
}: {
  selected?: CampaignDraftRecord;
  parentPlotId?: string;
}) {
  const { definition, draft, saveRecord, markDirty } =
    useCampaignDefinitionAuthoring();
  const navigate = useInternalNavigate();
  const suffix = quickStartSuffix(useLocation().searchStr);
  const base = `/campaigns/definitions/${encodeURIComponent(definition.id)}/plots`;
  const payload = selected ? recordObject(selected) : {};
  const [name, setName] = useState(
    selected ? campaignRecordLabel(selected) : "",
  );
  const [description, setDescription] = useState(text(payload.description));
  const [parentId, setParentId] = useState(
    text(obj(payload.parent).parentPlotDefinitionId) || parentPlotId || "",
  );
  const originalParentId =
    text(obj(payload.parent).parentPlotDefinitionId) || parentPlotId || "";
  const [message, setMessage] = useState("");
  const records = (draft?.records ?? []).filter(
    (r) => r.resourceType === "plots",
  );
  const candidates = selected
    ? campaignPlotParentCandidates(records, selected.sourceId)
    : records;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const ancestors = new Set<string>();
    let next = parentId;
    while (next && !ancestors.has(next)) {
      ancestors.add(next);
      next = text(
        obj(
          recordObject(
            records.find((r) => r.sourceId === next) ?? {
              resourceType: "plots",
              sourceId: "",
              payload: {},
            },
          ).parent,
        ).parentPlotDefinitionId,
      );
    }
    if (
      [...arr(payload.prerequisites), ...arr(payload.dependencies)].some(
        (link) =>
          !ancestors.has(text(obj(link).plotDefinitionId)) &&
          !text(obj(link).crossBranchRationale).trim(),
      )
    ) {
      setMessage(
        "This parent would make an existing relationship cross-branch. Add its rationale on the Prerequisites or Dependencies page first.",
      );
      return;
    }
    const id = selected?.sourceId ?? `plot:${crypto.randomUUID()}`;
    const record: CampaignDraftRecord = {
      ...(selected ?? { resourceType: "plots", sourceId: id }),
      payload: {
        ...(selected
          ? payload
          : {
              id,
              campaignDefinitionId: definition.id,
              objectives: [],
              pressures: [],
              resistances: [],
              discoveries: [],
              locationContexts: [],
              prerequisites: [],
              dependencies: [],
            }),
        name: name.trim(),
        description: description.trim(),
        parent: parentId
          ? { kind: "subplot", parentPlotDefinitionId: parentId }
          : { kind: "root" },
      },
    };
    if (await saveRecord(record)) {
      setMessage("");
      if (!selected)
        await navigate(`${base}/${encodeURIComponent(id)}${suffix}`);
    }
  }
  return (
    <main className={pageClass}>
      <h1 className="text-4xl font-semibold">
        {selected
          ? campaignRecordLabel(selected)
          : parentPlotId
            ? "Add subplot"
            : "Add Plot"}
      </h1>
      <CampaignDraftRequired>
        <form
          onSubmit={save}
          className="mt-6 grid max-w-3xl gap-5 rounded-box border border-base-300 p-6"
        >
          <h2 className="text-xl font-semibold">Plot details</h2>
          <Label>
            Name
            <Input
              required
              value={name}
              onChange={(e) => {
                setName(e.currentTarget.value);
                markDirty();
              }}
            />
          </Label>
          <Label>
            Description
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.currentTarget.value);
                markDirty();
              }}
            />
          </Label>
          <Label>
            Parent Plot
            <Select
              value={parentId}
              onChange={(e) => {
                setParentId(e.currentTarget.value);
                markDirty();
              }}
            >
              <option value="">Root Plot</option>
              {candidates.map((r) => (
                <option key={r.sourceId} value={r.sourceId}>
                  {campaignRecordLabel(r)}
                </option>
              ))}
            </Select>
          </Label>
          {message && <Alert tone="warning">{message}</Alert>}
          <div className="flex gap-3">
            <Button type="submit">Save Plot</Button>
            <InternalLink
              className="btn btn-outline"
              href={`${originalParentId ? `${base}/${encodeURIComponent(originalParentId)}/subplots` : base}${suffix}`}
            >
              Cancel
            </InternalLink>
          </div>
        </form>
        {selected && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">Plot collections</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {sections.map(([key, label]) => (
                <li key={key}>
                  <InternalLink
                    className="flex items-center justify-between rounded-box border border-base-300 p-4 hover:bg-base-200"
                    href={`${base}/${encodeURIComponent(selected.sourceId)}/${key}${suffix}`}
                  >
                    <span>{label}</span>
                    <span className="text-sm text-base-content/60">
                      {key === "subplots"
                        ? records.filter(
                            (r) =>
                              obj(recordObject(r).parent)
                                .parentPlotDefinitionId === selected.sourceId,
                          ).length
                        : arr(
                            payload[
                              key === "locations" ? "locationContexts" : key
                            ],
                          ).length}
                    </span>
                  </InternalLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CampaignDraftRequired>
    </main>
  );
}
