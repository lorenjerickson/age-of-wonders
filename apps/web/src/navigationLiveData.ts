import { createContext, type Dispatch, type SetStateAction } from "react";
import type { WorldDraftRecord } from "./api";
export interface LiveNavigationWorld {
  worldId: string;
  records: WorldDraftRecord[];
}
export const NavigationLiveData = createContext<{
  world?: LiveNavigationWorld;
  setWorld: Dispatch<SetStateAction<LiveNavigationWorld | undefined>>;
} | null>(null);
