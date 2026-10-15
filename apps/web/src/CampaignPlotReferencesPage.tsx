import { PlotDefinition as PlotOwner } from "@aow/domain";
import { CampaignPlacementsPage } from "./CampaignDefinitionPages";
import {
  eligiblePlotContextPlacements,
  plotContextAssociationsValid,
} from "./campaignPlotReferencesModel";
import { useState, type FormEvent } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Alert, Button, Input, Label, Select } from "@aow/ui";
import { type PlotDefinition } from "@aow/common";
import type { JsonValue } from "./api";
import {
  CampaignDraftRequired,
  useCampaignDefinitionAuthoring,
} from "./CampaignDefinitionAuthoringShell";
import { campaignRecordLabel, recordObject } from "./campaignAuthoringModel";
import { InternalLink } from "./navigation";
import { quickStartSuffix } from "./quickStartModel";

type Collection = "locations" | "prerequisites" | "dependencies";
type Value = Record<string, JsonValue>;
function object(value: JsonValue | undefined): Value {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
function values(value: JsonValue | undefined): Value[] {
  return Array.isArray(value) ? value.map(object) : [];
}

export function CampaignPlotReferencesPage(props: {
  plotId: string;
  collection: string;
  childId?: string;
  associationPage?: boolean;
  placementId?: string;
}) {
  if (
    !["locations", "prerequisites", "dependencies"].includes(props.collection)
  )
    return <Alert tone="warning">This collection is unavailable.</Alert>;
  return (
    <CampaignDraftRequired>
      <References
        key={`${props.plotId}:${props.collection}:${props.childId ?? "list"}:${props.associationPage}:${props.placementId}`}
        {...props}
        collection={props.collection as Collection}
      />
    </CampaignDraftRequired>
  );
}
function References({
  plotId,
  collection,
  childId,
  associationPage,
  placementId,
}: {
  plotId: string;
  collection: Collection;
  childId?: string;
  associationPage?: boolean;
  placementId?: string;
}) {
  const context = useCampaignDefinitionAuthoring();
  const { draft, definition, saveState } = context;
  const router = useRouter();
  const suffix = quickStartSuffix(useLocation().searchStr);
  const record = draft?.records.find(
    (item) => item.resourceType === "plots" && item.sourceId === plotId,
  );
  const payload = record ? recordObject(record) : {};
  const field = collection === "locations" ? "locationContexts" : collection;
  const entries = values(payload[field]);
  const idField = collection === "locations" ? "id" : "plotDefinitionId";
  const prior = entries.find((entry) => entry[idField] === childId);
  const [target, setTarget] = useState(
    String(
      prior?.[collection === "locations" ? "locationId" : "plotDefinitionId"] ??
        "",
    ),
  );
  const [rationale, setRationale] = useState(
    String(prior?.crossBranchRationale ?? ""),
  );
  const [placements] = useState<string[]>(
    Array.isArray(prior?.placementDefinitionIds)
      ? prior.placementDefinitionIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const [associationTarget, setAssociationTarget] = useState(
    placementId === "new" ? "" : (placementId ?? ""),
  );
  const [error, setError] = useState("");
  const [intentsOpen, setIntentsOpen] = useState(false);
  const base = `/campaigns/definitions/${encodeURIComponent(definition.id)}/plots/${encodeURIComponent(plotId)}/${collection}`;
  const singular =
    collection === "locations"
      ? "Location context"
      : collection === "prerequisites"
        ? "prerequisite"
        : "dependency";
  const title =
    collection === "locations"
      ? "Locations"
      : collection === "prerequisites"
        ? "Prerequisites"
        : "Dependencies";
  const plots =
    draft?.records.filter((item) => item.resourceType === "plots") ?? [];
  const options =
    collection === "locations"
      ? (draft?.capturedWorldContent?.locations ?? [])
      : plots
          .filter((item) => item.sourceId !== plotId)
          .map((item) => ({
            id: item.sourceId,
            name: campaignRecordLabel(item),
          }));
  function label(entry: Value) {
    return (
      options.find(
        (option) =>
          option.id ===
          entry[collection === "locations" ? "locationId" : "plotDefinitionId"],
      )?.name ??
      (collection === "locations" ? "Unavailable Location" : "Unavailable Plot")
    );
  }
  const associatedPlacements =
    draft?.records.filter(
      (item) => item.resourceType === "campaign-placements",
    ) ?? [];
  async function persist(next: Value[]) {
    if (
      !record ||
      !draft ||
      context.getSaveState() === "saving" ||
      context.getSaveState() === "stale"
    )
      return false;
    const nextRecord = { ...record, payload: { ...payload, [field]: next } };
    if (collection !== "locations") {
      const result = PlotOwner.validateHierarchy(
        plots.map(
          (item) =>
            (item.sourceId === plotId
              ? nextRecord.payload
              : item.payload) as unknown as PlotDefinition,
        ),
      );
      if (!result.valid) {
        setError(result.issues.map((issue) => issue.message).join(" "));
        return false;
      }
    }
    return context.saveRecord(nextRecord);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    if (
      entries.some(
        (entry) =>
          entry !== prior &&
          entry[
            collection === "locations" ? "locationId" : "plotDefinitionId"
          ] === target,
      )
    ) {
      setError("This reference already exists in this Plot.");
      return;
    }
    if (
      collection === "locations" &&
      !plotContextAssociationsValid(
        placements,
        associatedPlacements,
        plotId,
        target,
      )
    ) {
      setError(
        "Remove incompatible placement associations before changing this Location. Every associated placement must support this Plot at the selected Location.",
      );
      return;
    }
    const next: Value =
      collection === "locations"
        ? {
            ...prior,
            id: prior?.id ?? `plot-location:${crypto.randomUUID()}`,
            locationId: target,
            placementDefinitionIds: placements,
          }
        : { ...prior, plotDefinitionId: target };
    if (collection !== "locations") {
      if (rationale.trim()) next.crossBranchRationale = rationale.trim();
      else delete next.crossBranchRationale;
    }
    if (
      await persist(
        prior
          ? entries.map((entry) => (entry === prior ? next : entry))
          : [...entries, next],
      )
    )
      await router.navigate({ to: `${base}${suffix}` });
  }
  if (!record) return <Alert tone="warning">This Plot is unavailable.</Alert>;
  if (childId && childId !== "new" && !prior)
    return (
      <Alert tone="warning">
        This reference is unavailable.{" "}
        <InternalLink href={`${base}${suffix}`}>Back to {title}</InternalLink>
      </Alert>
    );
  if (intentsOpen && prior && collection === "locations")
    return (
      <>
        <Button
          className="m-4 min-h-11"
          onClick={() => {
            if (
              (saveState === "dirty" || saveState === "error") &&
              !window.confirm("Discard unsaved intent changes?")
            )
              return;
            context.discardLocalChanges();
            setIntentsOpen(false);
          }}
        >
          Back to Location context
        </Button>
        <CampaignPlacementsPage
          plotContext={{
            plotId,
            contextId: String(prior.id),
            locationId: String(prior.locationId),
          }}
        />
      </>
    );
  if (associationPage) {
    if (!prior)
      return (
        <Alert tone="warning">This Location context is unavailable.</Alert>
      );
    const eligiblePlacements = eligiblePlotContextPlacements(
      associatedPlacements,
      plotId,
      prior.locationId,
    );
    const associationTargetValid = eligiblePlacements.some(
      (placement) => placement.sourceId === associationTarget,
    );
    const associationBase = `${base}/${encodeURIComponent(childId!)}/placements`;
    const associationName = (id: string) => {
      const placement = associatedPlacements.find(
        (item) => item.sourceId === id,
      );
      return placement
        ? String(recordObject(placement).name || "Campaign placement")
        : "Unavailable Campaign placement";
    };
    const saveAssociations = (ids: string[]) =>
      persist(
        entries.map((entry) =>
          entry === prior ? { ...prior, placementDefinitionIds: ids } : entry,
        ),
      );
    if (
      placementId &&
      placementId !== "new" &&
      !placements.includes(placementId)
    )
      return <Alert tone="warning">This association is unavailable.</Alert>;
    return (
      <section className="space-y-5 p-6">
        <h1 className="text-2xl font-semibold">
          {placementId
            ? `${placementId === "new" ? "Add" : "Edit"} placement association`
            : "Placement associations"}
        </h1>
        <p>{label(prior)}</p>
        {error && <Alert tone="error">{error}</Alert>}
        {!placementId ? (
          <>
            <InternalLink
              className="btn btn-primary"
              href={`${associationBase}/new${suffix}`}
            >
              Add placement association
            </InternalLink>
            {!placements.length && <p>No placement associations yet.</p>}
            <ul className="space-y-3">
              {placements.map((id) => (
                <li key={id} className="flex justify-between gap-3">
                  <InternalLink
                    className="link"
                    href={`${associationBase}/${encodeURIComponent(id)}${suffix}`}
                  >
                    {associationName(id)}
                  </InternalLink>
                  <Button
                    type="button"
                    tone="outline"
                    disabled={saveState === "saving"}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${associationName(id)} from this Location context?`,
                        )
                      )
                        void saveAssociations(
                          placements.filter((value) => value !== id),
                        );
                    }}
                  >
                    Remove association
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <form
            className="max-w-2xl space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!associationTargetValid) {
                setError(
                  "Choose a placement that supports this Plot at this Location.",
                );
                return;
              }
              if (
                placements.some(
                  (id) => id === associationTarget && id !== placementId,
                )
              ) {
                setError("This placement is already associated.");
                return;
              }
              void saveAssociations(
                placementId === "new"
                  ? [...placements, associationTarget]
                  : placements.map((id) =>
                      id === placementId ? associationTarget : id,
                    ),
              ).then((saved) => {
                if (saved)
                  void router.navigate({ to: `${associationBase}${suffix}` });
              });
            }}
          >
            <Label className="block">
              Campaign placement
              <Select
                required
                className="mt-2 w-full"
                value={associationTarget}
                onChange={(event) => {
                  setAssociationTarget(event.currentTarget.value);
                  context.markDirty();
                }}
              >
                <option value="">
                  {eligiblePlacements.length
                    ? "Choose a Campaign placement"
                    : "No matching Campaign placements"}
                </option>
                {associationTarget && !associationTargetValid && (
                  <option value={associationTarget} disabled>
                    Unavailable matching placement
                  </option>
                )}
                {eligiblePlacements.map((placement) => (
                  <option key={placement.sourceId} value={placement.sourceId}>
                    {associationName(placement.sourceId)}
                  </option>
                ))}
              </Select>
            </Label>
            {!eligiblePlacements.length && (
              <p>
                No Campaign placements support this Plot at this Location.{" "}
                <InternalLink
                  className="link"
                  href={`/campaigns/definitions/${encodeURIComponent(definition.id)}/placements${suffix}`}
                >
                  Manage Campaign placements
                </InternalLink>{" "}
                to set their Location and supporting Plots.
              </p>
            )}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={!associationTargetValid || saveState === "saving"}
              >
                Save placement association
              </Button>
              <InternalLink
                className="btn btn-ghost"
                href={`${associationBase}${suffix}`}
              >
                Cancel
              </InternalLink>
            </div>
          </form>
        )}
      </section>
    );
  }
  return (
    <section className="space-y-5 p-6">
      <h1 className="text-2xl font-semibold">
        {childId ? `${childId === "new" ? "Add" : "Edit"} ${singular}` : title}
      </h1>
      <p className="text-sm text-base-content/65">
        {campaignRecordLabel(record)}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {!childId ? (
        <>
          <InternalLink
            className="btn btn-primary"
            href={`${base}/new${suffix}`}
          >
            Add {singular}
          </InternalLink>
          {!entries.length && <p>No {title.toLowerCase()} yet.</p>}
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={String(entry[idField])}
                className="flex items-center justify-between gap-4 rounded-box border border-base-300 p-4"
              >
                <InternalLink
                  className="link"
                  href={`${base}/${encodeURIComponent(String(entry[idField]))}${suffix}`}
                >
                  {label(entry)}
                </InternalLink>
                <Button
                  type="button"
                  tone="outline"
                  disabled={saveState === "saving"}
                  onClick={() => {
                    if (
                      window.confirm(`Remove ${label(entry)} from this Plot?`)
                    )
                      void persist(entries.filter((item) => item !== entry));
                  }}
                >
                  Remove {singular}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form
          className="max-w-2xl space-y-5"
          onSubmit={(event) => void save(event)}
        >
          <Label className="block">
            {collection === "locations" ? "Location" : "Plot"}
            <Select
              className="mt-2 w-full"
              required
              value={target}
              onChange={(event) => {
                setTarget(event.currentTarget.value);
                context.markDirty();
              }}
            >
              <option value="">
                {options.length
                  ? "Choose a reference"
                  : "No available references"}
              </option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Label>
          {collection !== "locations" && (
            <div>
              <Label className="block">
                Cross-branch rationale
                <Input
                  className="mt-2 w-full"
                  aria-describedby="rationale-help"
                  value={rationale}
                  onChange={(event) => {
                    setRationale(event.currentTarget.value);
                    context.markDirty();
                  }}
                />
              </Label>
              <p className="text-sm" id="rationale-help">
                Required for a Plot outside the parent or ancestor chain.
              </p>
            </div>
          )}
          {collection === "locations" && childId !== "new" && (
            <Button
              type="button"
              tone="outline"
              className="min-h-11"
              onClick={() => {
                if (
                  (saveState === "dirty" || saveState === "error") &&
                  !window.confirm("Discard unsaved Location context changes?")
                )
                  return;
                context.discardLocalChanges();
                setIntentsOpen(true);
              }}
            >
              Edit actor and Item intents
            </Button>
          )}
          {collection === "locations" && childId !== "new" && (
            <InternalLink
              className="link"
              href={`${base}/${encodeURIComponent(childId!)}/placements${suffix}`}
            >
              Placement associations
            </InternalLink>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={!target || saveState === "saving"}>
              Save {singular}
            </Button>
            <InternalLink className="btn btn-ghost" href={`${base}${suffix}`}>
              Cancel
            </InternalLink>
          </div>
        </form>
      )}
    </section>
  );
}
