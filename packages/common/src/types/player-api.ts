import type {
  CampaignDefinitionId,
  CampaignInstanceId,
  CampaignInstanceMembershipId,
  CharacterId,
  PlayerProfileId,
} from "./primitives";
import type { PlayerServerStanding } from "./participation";

export interface PlayerDirectoryItem {
  readonly playerId: PlayerProfileId;
  readonly displayName: string;
  readonly standing: PlayerServerStanding;
  readonly hasEmail: boolean;
  readonly hasPhone: boolean;
  readonly membershipCount: number;
  readonly characterCount: number;
}

export interface PlayerDirectoryProjection {
  readonly items: readonly PlayerDirectoryItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface PlayerDetailProjection extends PlayerDirectoryItem {
  readonly email?: string;
  readonly phone?: string;
  readonly authenticationProviders: readonly {
    readonly provider: string;
    readonly status: "pending" | "associated" | "disabled";
    readonly associatedAt?: string;
  }[];
  readonly memberships: readonly {
    readonly membershipId: CampaignInstanceMembershipId;
    readonly campaignDefinitionId: CampaignDefinitionId;
    readonly campaignDefinitionName: string;
    readonly campaignInstanceId: CampaignInstanceId;
    readonly campaignInstanceName: string;
    readonly status: "active" | "inactive" | "left" | "banned";
    readonly joinedAt: string;
    readonly characters: readonly {
      readonly characterId: CharacterId;
      readonly name: string;
      readonly status: "draft" | "active" | "inactive" | "retired" | "dead";
      readonly importedFrom?: {
        readonly campaignInstanceName: string;
        readonly characterName: string;
      };
    }[];
  }[];
}

export interface ChangePlayerStandingRequest {
  readonly expectedStanding: PlayerServerStanding;
  readonly targetStanding: PlayerServerStanding;
}

export interface ChangePlayerStandingResult {
  readonly displayName: string;
  readonly standing: PlayerServerStanding;
}
