import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { InternalLink } from "./navigation";
import { RecordTabs, recordTabId } from "./RecordTabs";
import { recordName, worldWorkspaceSuffix } from "./worldAuthoringModel";
import {
  LOCATION_SECTIONS,
  locationSectionHref,
  type LocationSection,
} from "./locationWorkspaceModel";

export function LocationRecordView({
  locationId,
  children,
}: {
  locationId: string;
  children: ReactNode;
}) {
  const { definition, draft } = useWorldAuthoring();
  const location = useLocation();
  const record = draft?.records.find(
    (entry) =>
      entry.resourceType === "locations" && entry.sourceId === locationId,
  );
  if (!record) return children;
  const suffix = worldWorkspaceSuffix(location.searchStr);
  const tabs = LOCATION_SECTIONS.map((label) => {
    const id = label.toLowerCase() as LocationSection;
    return {
      id,
      label,
      href: locationSectionHref(definition.id, locationId, id) + suffix,
    };
  });
  const activeTab =
    LOCATION_SECTIONS.map(
      (label) => label.toLowerCase() as LocationSection,
    ).find(
      (section) =>
        location.pathname.replace(/\/$/, "") ===
        locationSectionHref(definition.id, locationId, section),
    ) ?? "description";
  return (
    <section aria-label="Location record" className="min-w-0">
      <header className="mx-auto w-full max-w-6xl px-4 pt-4 lg:px-8 lg:pt-7">
        <InternalLink
          href={`/worlds/${encodeURIComponent(definition.id)}/atlas${suffix}`}
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          All locations
        </InternalLink>
        <h1 className="mt-2 text-3xl font-semibold">
          {recordName(record, "Unnamed Location")}
        </h1>
        <RecordTabs
          label="Location properties"
          tabs={tabs}
          activeTab={activeTab}
          idPrefix="location-properties"
          panelId="location-property-panel"
        />
      </header>
      <div
        id="location-property-panel"
        role="tabpanel"
        aria-labelledby={recordTabId("location-properties", activeTab)}
        tabIndex={0}
      >
        {children}
      </div>
    </section>
  );
}
