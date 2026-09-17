import { createContext, type Dispatch, type SetStateAction } from "react";
import type { WorldDraftRecord } from "./api";
export interface LiveNavigationWorld {
  worldId: string;
  records: WorldDraftRecord[];
}
export interface LiveNavigationCampaign {
  campaignId: string;
  records: readonly {
    sourceId: string;
    resourceType: string;
    payload: unknown;
  }[];
  locations?: readonly { id: string; name: string }[];
}
export const NavigationLiveData = createContext<{
  world?: LiveNavigationWorld;
  campaign?: LiveNavigationCampaign;
  setCampaign?: Dispatch<SetStateAction<LiveNavigationCampaign | undefined>>;
  setWorld: Dispatch<SetStateAction<LiveNavigationWorld | undefined>>;
} | null>(null);
