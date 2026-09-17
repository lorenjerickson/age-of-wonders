import { Alert } from "@aow/ui";
import { CampaignPlotsPage } from "./CampaignPlotPages";
import { CampaignPlotCollectionPage } from "./CampaignPlotCollectionPage";
import { CampaignPlotReferencesPage } from "./CampaignPlotReferencesPage";
export function CampaignPlotRoutePage({
  plotId,
  collection,
  childId,
  claimsPage,
  claimId,
  associationPage,
  placementId,
}: {
  plotId: string;
  collection: string;
  childId?: string;
  claimsPage?: boolean;
  claimId?: string;
  associationPage?: boolean;
  placementId?: string;
}) {
  if (collection === "subplots" && !claimsPage && !associationPage)
    return <CampaignPlotsPage parentPlotId={plotId} plotId={childId} />;
  if (
    ["objectives", "pressures", "resistances", "discoveries"].includes(
      collection,
    ) &&
    !associationPage
  )
    return (
      <CampaignPlotCollectionPage
        key={`${plotId}/${collection}/${childId ?? ""}/${claimsPage ? "claims" : ""}/${claimId ?? ""}`}
        plotId={plotId}
        collection={collection}
        childId={childId}
        claimsPage={claimsPage}
        claimId={claimId}
      />
    );
  if (
    ["locations", "prerequisites", "dependencies"].includes(collection) &&
    !claimsPage
  )
    return (
      <CampaignPlotReferencesPage
        key={`${plotId}/${collection}/${childId ?? ""}/${associationPage ? "placements" : ""}/${placementId ?? ""}`}
        plotId={plotId}
        collection={collection}
        childId={childId}
        associationPage={associationPage}
        placementId={placementId}
      />
    );
  return (
    <main className="p-8">
      <Alert tone="warning">This Plot collection is unavailable.</Alert>
    </main>
  );
}
