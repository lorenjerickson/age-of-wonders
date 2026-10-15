import { PlotDefinition } from "@aow/domain";
import { useState, type FormEvent } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Disclosure,
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
const pageClass = "mx-auto w-full max-w-none px-4 py-6 sm:p-8";
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
    const issue = PlotDefinition.authoringDeletionIssue(
      draft?.records ?? [],
      record.sourceId,
    );
    if (issue) {
      setMessage(issue);
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
      <h1 className="mt-3 text-3xl font-semibold">
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
  const [editing, setEditing] = useState(!selected);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineQuery, setOutlineQuery] = useState("");
  const [outlineId, setOutlineId] = useState(selected?.sourceId);
  const records = (draft?.records ?? []).filter(
    (r) => r.resourceType === "plots",
  );
  const outlineRecord = records.find((record) => record.sourceId === outlineId);
  const outlineParentId = outlineRecord
    ? text(obj(recordObject(outlineRecord).parent).parentPlotDefinitionId)
    : "";
  const outlineParent = records.find(
    (record) => record.sourceId === outlineParentId,
  );
  const ancestry: CampaignDraftRecord[] = [];
  let ancestor = outlineRecord;
  const seen = new Set<string>();
  while (ancestor && !seen.has(ancestor.sourceId)) {
    seen.add(ancestor.sourceId);
    ancestry.unshift(ancestor);
    const parentId = text(
      obj(recordObject(ancestor).parent).parentPlotDefinitionId,
    );
    ancestor = records.find((record) => record.sourceId === parentId);
  }
  const candidates = selected
    ? campaignPlotParentCandidates(records, selected.sourceId)
    : records;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const issue = PlotDefinition.authoringParentChangeIssue(
      payload,
      records,
      parentId,
    );
    if (issue) {
      setMessage(issue);
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
      setEditing(false);
      if (!selected)
        await navigate(`${base}/${encodeURIComponent(id)}${suffix}`);
    }
  }
  return (
    <main className={pageClass}>
      <h1 className="text-3xl font-semibold">
        {selected
          ? campaignRecordLabel(selected)
          : parentPlotId
            ? "Add subplot"
            : "Add Plot"}
      </h1>
      {selected && !editing && (
        <>
          <p className="mt-3 text-sm text-base-content/65">
            {parentId ? "Subplot" : "Overarching plot"} · {definition.name}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:flex">
            <Button
              tone="outline"
              className="min-h-11"
              onClick={() => setOutlineOpen(!outlineOpen)}
              aria-expanded={outlineOpen}
            >
              Outline
            </Button>
            <Button
              tone="outline"
              className="min-h-11"
              onClick={() => setEditing(true)}
            >
              Edit plot
            </Button>
            <InternalLink
              className="btn btn-outline min-h-11"
              href={`${base}/${encodeURIComponent(selected.sourceId)}/subplots/new${suffix}`}
            >
              + Subplot
            </InternalLink>
          </div>
          {outlineOpen && (
            <section
              className="mt-5 space-y-3 rounded-box border border-base-300 p-4"
              aria-label="Plot outline"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Plot outline</h2>
                <Button tone="ghost" onClick={() => setOutlineOpen(false)}>
                  Close outline
                </Button>
              </div>
              {outlineRecord && (
                <div className="space-y-3 rounded-box border border-base-300 p-4">
                  <h3 className="font-semibold">
                    {campaignRecordLabel(outlineRecord)}
                  </h3>
                  <p className="text-sm text-base-content/65">
                    Level {ancestry.length}
                    {outlineParent
                      ? ` · Under ${campaignRecordLabel(outlineParent)}`
                      : " · Overarching plot"}
                  </p>
                  <Disclosure summary={`Full path · ${ancestry.length} levels`}>
                    <ol className="space-y-2">
                      {ancestry.map((record) => (
                        <li key={record.sourceId}>
                          <Button
                            tone="ghost"
                            className="min-h-11"
                            onClick={() => {
                              setOutlineId(record.sourceId);
                              setOutlineQuery("");
                            }}
                          >
                            {campaignRecordLabel(record)}
                          </Button>
                        </li>
                      ))}
                    </ol>
                  </Disclosure>
                  <InternalLink
                    className="btn btn-outline min-h-11"
                    href={`${base}/${encodeURIComponent(outlineRecord.sourceId)}${suffix}`}
                  >
                    Open current plot
                  </InternalLink>
                </div>
              )}
              {outlineRecord && (
                <Button
                  tone="outline"
                  className="min-h-11 w-full justify-start"
                  onClick={() => {
                    setOutlineId(outlineParent?.sourceId);
                    setOutlineQuery("");
                  }}
                >
                  Up ·{" "}
                  {outlineParent
                    ? campaignRecordLabel(outlineParent)
                    : "All root plots"}
                </Button>
              )}
              <h3 className="font-semibold">
                {outlineQuery
                  ? "Search results"
                  : outlineRecord
                    ? "Immediate children"
                    : "Root plots"}
              </h3>
              <Label>
                Search all plots
                <Input
                  type="search"
                  className="w-full"
                  value={outlineQuery}
                  onChange={(e) => setOutlineQuery(e.currentTarget.value)}
                />
              </Label>
              {records
                .filter((record) =>
                  outlineQuery
                    ? campaignRecordLabel(record)
                        .toLowerCase()
                        .includes(outlineQuery.toLowerCase())
                    : outlineRecord
                      ? obj(recordObject(record).parent)
                          .parentPlotDefinitionId === outlineRecord.sourceId
                      : obj(recordObject(record).parent).kind === "root",
                )
                .map((record) => (
                  <Button
                    key={record.sourceId}
                    tone="outline"
                    className="min-h-11 w-full justify-start whitespace-normal text-left"
                    onClick={() => {
                      setOutlineId(record.sourceId);
                      setOutlineQuery("");
                    }}
                  >
                    {campaignRecordLabel(record)} →
                  </Button>
                ))}
              <p className="text-sm text-base-content/60">
                Browse one level at a time. Closing keeps your selected plot.
              </p>
            </section>
          )}
          <section className="mt-5 rounded-box border border-base-300 p-4">
            <h2 className="text-lg font-semibold">GM intent</h2>
            <p className="mt-2 text-base-content/70">
              {description || "Add the intended possibilities for this plot."}
            </p>
          </section>
          <section className="mt-5 rounded-box border border-base-300 p-4">
            <h2 className="text-lg font-semibold">Subplots</h2>
            <ul className="my-3 space-y-2">
              {records
                .filter(
                  (record) =>
                    obj(recordObject(record).parent).parentPlotDefinitionId ===
                    selected.sourceId,
                )
                .map((record) => (
                  <li key={record.sourceId}>
                    <InternalLink
                      className="link"
                      href={`${base}/${encodeURIComponent(record.sourceId)}${suffix}`}
                    >
                      {campaignRecordLabel(record)}
                    </InternalLink>
                  </li>
                ))}
            </ul>
            <InternalLink
              className="btn btn-outline min-h-11"
              href={`${base}/${encodeURIComponent(selected.sourceId)}/subplots${suffix}`}
            >
              View all subplots
            </InternalLink>
          </section>
        </>
      )}
      <CampaignDraftRequired>
        {editing && (
          <form onSubmit={save} className="mt-6 grid max-w-4xl gap-5">
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
        )}
        {selected && !editing && (
          <section className="mt-8">
            <h2 className="sr-only">Story elements</h2>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:max-w-xl">
              {sections
                .filter(([key]) => key !== "subplots")
                .map(([key, label]) => (
                  <li key={key}>
                    <InternalLink
                      className="flex items-center justify-between min-h-11 gap-2 rounded-box border border-base-300 p-3 hover:bg-base-200"
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
