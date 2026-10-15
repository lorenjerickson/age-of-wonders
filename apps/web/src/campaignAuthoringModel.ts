import { PlotDefinition } from "@aow/domain";
import type { JsonValue } from "./api";

export interface CampaignDraftRecord {
  resourceType: string;
  sourceId: string;
  sourceRevision?: number;
  payload: JsonValue;
}

export interface CampaignNavigationChild {
  label: string;
  href: string;
}

export interface CampaignNavigationGroup {
  key: "story" | "world-context" | "lifecycle";
  label: string;
  active: boolean;
  children: readonly CampaignNavigationChild[];
}

export function campaignProposalRecoveryRequested(search: string) {
  return (
    new URLSearchParams(search.replace(/^\?/, "")).get("creationNotice") ===
    "proposal-not-applied"
  );
}

export function campaignProposalRecoverySuffix(search: string) {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  params.set("creationNotice", "proposal-not-applied");
  return `?${params.toString()}`;
}

export function reviewedRangesCoverTotal(
  ranges: readonly { start: number; end: number }[],
  total: number,
) {
  if (total <= 0) return true;
  let reviewedThrough = 0;
  for (const range of [...ranges].sort(
    (left, right) => left.start - right.start,
  )) {
    if (range.start > reviewedThrough) return false;
    reviewedThrough = Math.max(reviewedThrough, range.end);
    if (reviewedThrough >= total) return true;
  }
  return false;
}

export function campaignDefinitionNavigationForPath(
  campaignDefinitionId: string,
  pathname: string,
): readonly CampaignNavigationGroup[] {
  const base = `/campaigns/definitions/${encodeURIComponent(campaignDefinitionId)}`;
  const segment = pathname.split("/").filter(Boolean)[3];
  return [
    {
      key: "story",
      label: "Story",
      active: segment === "plots",
      children: [{ label: "Plots", href: `${base}/plots` }],
    },
    {
      key: "world-context",
      label: "World context",
      active: segment === "placements" || segment === "preparation",
      children: [
        { label: "Placements", href: `${base}/placements` },
        { label: "Preparation defaults", href: `${base}/preparation` },
      ],
    },
    {
      key: "lifecycle",
      label: "Lifecycle",
      active: segment === "versions",
      children: [
        { label: "Versions", href: `${base}/versions` },
        { label: "World migration", href: `${base}/versions/migrate` },
      ],
    },
  ];
}

type ObjectValue = Record<string, JsonValue>;

export interface CampaignPlotNode {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  children: CampaignPlotNode[];
  record: CampaignDraftRecord;
}

export function recordObject(record: CampaignDraftRecord): ObjectValue {
  return typeof record.payload === "object" &&
    record.payload !== null &&
    !Array.isArray(record.payload)
    ? record.payload
    : {};
}

export function campaignRecordLabel(record: CampaignDraftRecord) {
  const value = recordObject(record).name;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : record.resourceType === "plots"
      ? "Unnamed Plot"
      : "Unnamed Campaign content";
}

export function humanReferenceLabel(
  value: string | undefined,
  fallback: string,
) {
  const label = value?.trim();
  if (!label) return fallback;
  if (
    /^[a-z-]+:[0-9a-f-]{16,}$/i.test(label) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(label)
  )
    return fallback;
  return label;
}

export function campaignDraftWithRecord(
  records: readonly CampaignDraftRecord[],
  record: CampaignDraftRecord,
) {
  const existing = records.findIndex(
    (candidate) =>
      candidate.resourceType === record.resourceType &&
      candidate.sourceId === record.sourceId,
  );
  if (existing < 0) return [...records, record];
  return records.map((candidate, index) =>
    index === existing ? record : candidate,
  );
}

export function campaignDraftWithoutRecord(
  records: readonly CampaignDraftRecord[],
  resourceType: string,
  sourceId: string,
) {
  return records.filter(
    (candidate) =>
      candidate.resourceType !== resourceType ||
      candidate.sourceId !== sourceId,
  );
}

export function campaignPlacementSourceId(record: CampaignDraftRecord) {
  const source = recordObject(record).source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  if (source.kind === "world-creature" && typeof source.creatureId === "string")
    return source.creatureId;
  if (
    source.kind === "world-item" &&
    typeof source.itemDefinitionId === "string"
  )
    return source.itemDefinitionId;
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function jsonArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

export function mergeNamedComponentLines(
  lines: string,
  existing: JsonValue | undefined,
  prefix: string,
): Record<string, JsonValue>[] {
  const previous = jsonArray(existing).map(jsonObject);
  const names = lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const reserved = new Set<Record<string, JsonValue>>();
  // Reserve retained names before positional rename fallback sees new lines.
  // Searching unreserved records also keeps duplicate names distinct.
  const matches = names.map((name) => {
    const match = previous.find(
      (entry) =>
        !reserved.has(entry) && String(entry.name ?? "").trim() === name,
    );
    if (match) reserved.add(match);
    return match;
  });
  const claimed = new Set<Record<string, JsonValue>>();
  return names.map<Record<string, JsonValue>>((name, index) => {
    const exact = matches[index];
    const ordered = previous[index];
    const prior =
      exact && !claimed.has(exact)
        ? exact
        : ordered && !reserved.has(ordered) && !claimed.has(ordered)
          ? ordered
          : previous.find(
              (entry) => !reserved.has(entry) && !claimed.has(entry),
            );
    if (prior) claimed.add(prior);
    if (prior) return { ...prior, name } as Record<string, JsonValue>;
    return { id: `${prefix}:${crypto.randomUUID()}`, name };
  });
}

export function mergeDiscoveryLines(
  lines: string,
  existing: JsonValue | undefined,
): Record<string, JsonValue>[] {
  const previous = jsonArray(existing).map(jsonObject);
  const parsedLines = lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const renderedLine = (discovery: Record<string, JsonValue>) => {
    const claim = jsonObject(jsonArray(discovery.claims)[0]);
    return `${String(claim.kind ?? "rumor")} | ${String(discovery.name ?? "Discovery")} | ${String(claim.statement ?? "")}`;
  };
  const reserved = new Set<Record<string, JsonValue>>();
  const matches = parsedLines.map((line) => {
    const match = previous.find(
      (entry) => !reserved.has(entry) && renderedLine(entry) === line,
    );
    if (match) reserved.add(match);
    return match;
  });
  // Name matches preserve identity when only a claim changes. Reserve them too
  // before treating unmatched lines as renames or additions.
  parsedLines.forEach((line, index) => {
    if (matches[index]) return;
    const name = line.split("|")[1]?.trim() || "Discovery";
    const match = previous.find(
      (entry) =>
        !reserved.has(entry) && String(entry.name ?? "").trim() === name,
    );
    if (match) {
      reserved.add(match);
      matches[index] = match;
    }
  });
  const claimed = new Set<Record<string, JsonValue>>();
  const merged = parsedLines.map<Record<string, JsonValue>>((line, index) => {
    const named = matches[index];
    if (named && renderedLine(named) === line) {
      claimed.add(named);
      return named;
    }
    const [rawKind, rawName, ...statementParts] = line.split("|");
    const name = rawName?.trim() || "Discovery";
    const kind = rawKind?.trim().toLowerCase();
    const approvedKind = kind === "truth" || kind === "belief" ? kind : "rumor";
    const ordered = previous[index];
    const prior =
      named && !claimed.has(named)
        ? named
        : ordered &&
            !reserved.has(ordered) &&
            !claimed.has(ordered) &&
            jsonArray(ordered.claims).length > 0
          ? ordered
          : previous.find(
              (entry) =>
                !reserved.has(entry) &&
                !claimed.has(entry) &&
                jsonArray(entry.claims).length > 0,
            );
    if (prior) claimed.add(prior);
    const claims = jsonArray(prior?.claims);
    const first = jsonObject(claims[0]);
    return {
      ...(prior ?? {}),
      id:
        typeof prior?.id === "string"
          ? prior.id
          : `discovery:${crypto.randomUUID()}`,
      name,
      claims: [
        {
          ...first,
          id:
            typeof first.id === "string"
              ? first.id
              : `claim:${crypto.randomUUID()}`,
          kind: approvedKind,
          statement: statementParts.join("|").trim() || name,
        },
        ...claims.slice(1),
      ],
    };
  });
  return [
    ...merged,
    ...previous.filter(
      (discovery) =>
        !claimed.has(discovery) && jsonArray(discovery.claims).length === 0,
    ),
  ];
}

export function mergePlotLocationContexts(
  locationIds: readonly string[],
  existing: JsonValue | undefined,
) {
  const previous = jsonArray(existing).map(jsonObject);
  const byLocation = new Map(
    previous.map((entry) => [entry.locationId, entry]),
  );
  return locationIds.map((locationId) => {
    const prior = byLocation.get(locationId);
    return (
      prior ?? {
        id: `plot-location:${crypto.randomUUID()}`,
        locationId,
        placementDefinitionIds: [],
      }
    );
  });
}

export function mergePlotRelationships(
  plotIds: readonly string[],
  existing: JsonValue | undefined,
  rationales: Readonly<Record<string, string>> = {},
) {
  const previous = jsonArray(existing).map(jsonObject);
  const byTarget = new Map(
    previous.map((entry) => [entry.plotDefinitionId, entry]),
  );
  return plotIds.map((plotDefinitionId) => ({
    ...(byTarget.get(plotDefinitionId) ?? {}),
    plotDefinitionId,
    ...(rationales[plotDefinitionId]?.trim()
      ? { crossBranchRationale: rationales[plotDefinitionId].trim() }
      : {}),
  }));
}

export function mergeCampaignPlacementPayload(
  existing: CampaignDraftRecord,
  kind: "independent" | "world-decoration",
  updates: Record<string, JsonValue>,
) {
  const compatible = { ...recordObject(existing) };
  if (kind === "independent") {
    delete compatible.capturedWorldPlacementId;
    return { ...compatible, ...updates, kind };
  }
  delete compatible.source;
  return { ...compatible, ...updates, kind };
}

function plotParentId(record: CampaignDraftRecord) {
  const parent = recordObject(record).parent;
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) return;
  const parentId = parent.parentPlotDefinitionId;
  return parent.kind === "subplot" && typeof parentId === "string"
    ? parentId
    : undefined;
}

export function campaignPlotTree(
  records: readonly CampaignDraftRecord[],
): CampaignPlotNode[] {
  const plots = records.filter(({ resourceType }) => resourceType === "plots");
  const byId = new Map<string, CampaignPlotNode>();
  for (const record of plots) {
    const payload = recordObject(record);
    byId.set(record.sourceId, {
      id: record.sourceId,
      name: campaignRecordLabel(record),
      description:
        typeof payload.description === "string" ? payload.description : "",
      parentId: plotParentId(record),
      children: [],
      record,
    });
  }
  const roots: CampaignPlotNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: CampaignPlotNode[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name, "en"));
    nodes.forEach(({ children }) => sort(children));
  };
  sort(roots);
  return roots;
}

export function plotBreadcrumb(
  records: readonly CampaignDraftRecord[],
  plotId: string,
) {
  const plots = new Map(
    records
      .filter(({ resourceType }) => resourceType === "plots")
      .map((record) => [record.sourceId, record]),
  );
  const labels: string[] = [];
  const visited = new Set<string>();
  let current = plots.get(plotId);
  while (current && !visited.has(current.sourceId)) {
    visited.add(current.sourceId);
    labels.unshift(campaignRecordLabel(current));
    const parentId = plotParentId(current);
    current = parentId ? plots.get(parentId) : undefined;
  }
  return labels;
}

export function plotDescendantIds(
  records: readonly CampaignDraftRecord[],
  plotId: string,
) {
  return PlotDefinition.authoringDescendantIds(records, plotId);
}

export function campaignPlotParentCandidates(
  records: readonly CampaignDraftRecord[],
  plotId: string,
) {
  return PlotDefinition.authoringParentCandidates(records, plotId).sort(
    (left, right) =>
      campaignRecordLabel(left).localeCompare(campaignRecordLabel(right), "en"),
  );
}
