import {createFileRoute} from "@tanstack/react-router";
import {ActorEquipmentPanel} from "../ActorEquipmentPanel";
import {useCampaignInstance} from "../CampaignInstanceWorkspace";
import {RouterButtonLink} from "../navigation";
export const Route=createFileRoute("/_gm/campaigns/instances/$campaignInstanceId/actors_/$actorId/items/$itemId")({component:Detail});
function Detail(){const {instance}=useCampaignInstance();const {actorId,itemId}=Route.useParams();return <main className="mx-auto max-w-4xl p-4"><h1 className="text-2xl font-semibold">Item details</h1><RouterButtonLink className="mt-4 min-h-11" href={`/campaigns/instances/${encodeURIComponent(instance.id)}/actors/${encodeURIComponent(actorId)}`}>Back to actor</RouterButtonLink><ActorEquipmentPanel campaignId={instance.campaignDefinitionId} instanceId={instance.id} actorId={actorId} selectedItemId={itemId}/></main>;}
