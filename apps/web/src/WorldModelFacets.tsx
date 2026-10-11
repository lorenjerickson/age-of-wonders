import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { RecordTabs, recordTabId } from "./RecordTabs";
import { useWorldAuthoring } from "./WorldAuthoringShell";
import { worldWorkspaceSuffix } from "./worldAuthoringModel";

/** Model vocabularies are facets of one World destination. Existing routes
 * retain their unsaved-change guards when a different facet is selected. */
export function WorldModelFacets({ children }: { children: ReactNode }) {
  const { definition } = useWorldAuthoring();
  const location = useLocation();
  const base = `/worlds/${encodeURIComponent(definition.id)}/characters`;
  const suffix = worldWorkspaceSuffix(location.searchStr);
  const facets = [
    { id: "overview", label: "Overview", path: "/models" },
    {
      id: "structure",
      label: "Schema structure",
      path: "/model/structure/effective",
    },
    {
      id: "attributes",
      label: "Attributes",
      path: "/model/attributes/effective",
    },
    {
      id: "equipment-slots",
      label: "Equipment slots",
      path: "/model/equipment-slots/effective",
    },
    {
      id: "profession-ranks",
      label: "Profession ranks",
      path: "/model/profession-ranks/effective",
    },
  ];
  const active =
    facets.find(({ id }) => location.pathname.includes(`/model/${id}/`))?.id ??
    "overview";
  return (
    <>
      <div className="mx-auto w-full max-w-5xl min-w-0 px-6 lg:px-10">
        <RecordTabs
          label="Models and taxonomies"
          idPrefix="world-models"
          panelId="world-models-panel"
          activeTab={active}
          tabs={facets.map(({ id, label, path }) => ({
            id,
            label,
            href: `${base}${path}${suffix}`,
          }))}
        />
      </div>
      <div
        id="world-models-panel"
        role="tabpanel"
        aria-labelledby={recordTabId("world-models", active)}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
