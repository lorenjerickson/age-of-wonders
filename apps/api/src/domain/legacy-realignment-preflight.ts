import { Injectable } from "@nestjs/common";
import { DOMAIN_RESOURCES } from "./domain-resource";

export const LEGACY_REALIGNMENT_PREFLIGHT_VERSION =
  "aow:legacy-realignment-preflight/v1";

type JsonObject = Record<string, unknown>;

interface LegacyDomainRecord {
  readonly resource: string;
  readonly id: string;
  readonly kind: string | null;
  readonly name: string | null;
  readonly data: unknown;
}

interface LegacyCampaignRelation {
  readonly id: string;
  readonly campaignId: string;
  readonly role: unknown;
  readonly status: unknown;
}

interface LegacyCharacterDraft {
  readonly id: string;
  readonly membershipId: string;
  readonly characterId: string | null;
  readonly status: unknown;
}

export interface LegacyRealignmentPreflightPrisma {
  readonly domainRecord: {
    findMany(args: unknown): Promise<readonly LegacyDomainRecord[]>;
  };
  readonly campaignMembership: {
    findMany(args: unknown): Promise<readonly LegacyCampaignRelation[]>;
  };
  readonly campaignInvitation: {
    findMany(args: unknown): Promise<readonly LegacyCampaignRelation[]>;
  };
  readonly characterCreationDraft: {
    findMany(args: unknown): Promise<readonly LegacyCharacterDraft[]>;
  };
}

export interface LegacyRealignmentInventory {
  readonly rootWorlds: number;
  readonly campaigns: number;
  readonly games: number;
  readonly sessions: number;
  readonly memberships: number;
  readonly invitations: number;
  readonly characterDrafts: number;
  readonly characters: number;
  readonly definitions: number;
  readonly creatures: number;
  readonly items: number;
  readonly otherDomainRecords: number;
}

export interface LegacyRealignmentIssue {
  readonly code: string;
  readonly severity: "blocking";
  readonly subject: string;
  readonly detail: string;
}

export interface LegacyCampaignMappingProposal {
  readonly campaign: string;
  readonly world: string;
  readonly createCampaignDefinition: true;
  readonly createCampaignInstance: boolean;
  readonly rationale: string;
  readonly dependents: {
    readonly games: number;
    readonly sessions: number;
    readonly memberships: number;
    readonly invitations: number;
    readonly characterDrafts: number;
    readonly characters: number;
  };
}

export interface LegacyRealignmentPreflightReport {
  readonly version: typeof LEGACY_REALIGNMENT_PREFLIGHT_VERSION;
  readonly mode: "read-only";
  readonly inventory: LegacyRealignmentInventory;
  readonly mappingProposals: readonly LegacyCampaignMappingProposal[];
  readonly issues: readonly LegacyRealignmentIssue[];
  readonly readyForMigration: boolean;
}

/**
 * Reads the legacy ownership graph and proposes its Definition/Instance split.
 *
 * This service deliberately exposes no apply mode and accepts a persistence
 * capability containing only `findMany`. Sensitive relational columns are not
 * selected, and opaque identifiers are used only inside this process to join
 * records; they are never included in the report.
 */
@Injectable()
export class LegacyRealignmentPreflightService {
  constructor(private readonly prisma: LegacyRealignmentPreflightPrisma) {}

  async run(): Promise<LegacyRealignmentPreflightReport> {
    const [domainRecords, memberships, invitations, characterDrafts] =
      await Promise.all([
        this.prisma.domainRecord.findMany({
          where: { resource: { in: [...DOMAIN_RESOURCES] } },
          select: {
            resource: true,
            id: true,
            kind: true,
            name: true,
            data: true,
          },
          orderBy: [{ resource: "asc" }, { id: "asc" }],
        }),
        this.prisma.campaignMembership.findMany({
          select: {
            id: true,
            campaignId: true,
            role: true,
            status: true,
          },
          orderBy: { id: "asc" },
        }),
        this.prisma.campaignInvitation.findMany({
          select: {
            id: true,
            campaignId: true,
            role: true,
            status: true,
          },
          orderBy: { id: "asc" },
        }),
        this.prisma.characterCreationDraft.findMany({
          select: {
            id: true,
            membershipId: true,
            characterId: true,
            status: true,
          },
          orderBy: { id: "asc" },
        }),
      ]);

    const recordsByResource = new Map<string, LegacyDomainRecord[]>();
    for (const record of domainRecords) {
      const records = recordsByResource.get(record.resource) ?? [];
      records.push(record);
      recordsByResource.set(record.resource, records);
    }
    const locations = recordsByResource.get("locations") ?? [];
    const campaigns = recordsByResource.get("campaigns") ?? [];
    const games = recordsByResource.get("games") ?? [];
    const sessions = recordsByResource.get("sessions") ?? [];
    const characters = recordsByResource.get("characters") ?? [];
    const definitions = recordsByResource.get("definitions") ?? [];
    const creatures = recordsByResource.get("creatures") ?? [];
    const items = recordsByResource.get("items") ?? [];
    const rootWorlds = locations.filter(
      (record) =>
        record.kind === "world" ||
        (isObject(record.data) && record.data.kind === "world"),
    );

    const issues: LegacyRealignmentIssue[] = [];
    const addIssue = (code: string, subject: string, detail: string) => {
      issues.push({ code, severity: "blocking", subject, detail });
    };

    const worldNames = new Map<string, string>();
    rootWorlds.forEach((world, index) => {
      const subject = humanName(world, "world", index);
      const data = objectOrEmpty(world.data);
      const placement = objectOrEmpty(data.placement);
      if (data.kind !== "world" || placement.kind !== "root") {
        addIssue(
          "world-root-malformed",
          subject,
          "The World record is not a valid root Location and cannot seed a World lineage.",
        );
        return;
      }
      worldNames.set(world.id, subject);
    });

    this.inspectWorldOwnership(definitions, "definition", worldNames, addIssue);
    this.inspectWorldOwnership(
      creatures,
      "creature",
      worldNames,
      addIssue,
      true,
    );
    this.inspectWorldOwnership(items, "item", worldNames, addIssue);

    const campaignNames = new Map<string, string>();
    const campaignWorlds = new Map<string, string>();
    campaigns.forEach((campaign, index) => {
      const subject = humanName(campaign, "campaign", index);
      campaignNames.set(campaign.id, subject);
      const data = objectOrEmpty(campaign.data);
      if (typeof data.worldId !== "string" || !worldNames.has(data.worldId)) {
        addIssue(
          "campaign-world-not-found",
          subject,
          "The Campaign does not resolve to a valid root World.",
        );
        return;
      }
      campaignWorlds.set(campaign.id, data.worldId);
    });

    const gameCampaignIds = new Map<string, string[]>();
    games.forEach((game, index) => {
      const subject = humanName(game, "game runtime", index);
      const data = objectOrEmpty(game.data);
      const campaign = objectOrEmpty(data.campaign);
      const identity = objectOrEmpty(campaign.identity);
      if (typeof identity.id !== "string") {
        addIssue(
          "game-campaign-reference-malformed",
          subject,
          "The runtime snapshot has no usable legacy Campaign reference.",
        );
        return;
      }
      if (!campaignNames.has(identity.id)) {
        addIssue(
          "game-campaign-not-found",
          subject,
          "The runtime snapshot refers to a Campaign record that is not present.",
        );
        return;
      }
      const matching = gameCampaignIds.get(identity.id) ?? [];
      matching.push(game.id);
      gameCampaignIds.set(identity.id, matching);
    });
    for (const [campaignId, gameIds] of gameCampaignIds) {
      if (gameIds.length > 1) {
        addIssue(
          "campaign-runtime-ambiguous",
          campaignNames.get(campaignId) ?? "Unnamed campaign",
          "More than one runtime snapshot uses the same legacy Campaign identity; the Instance source is ambiguous.",
        );
      }
    }

    const sessionCampaignIds = new Map<string, string[]>();
    sessions.forEach((session, index) => {
      const subject = humanName(session, "session", index);
      const data = objectOrEmpty(session.data);
      if (typeof data.campaignId !== "string") {
        addIssue(
          "session-campaign-reference-malformed",
          subject,
          "The Session has no usable legacy Campaign reference.",
        );
        return;
      }
      if (!campaignNames.has(data.campaignId)) {
        addIssue(
          "session-campaign-not-found",
          subject,
          "The Session refers to a Campaign record that is not present.",
        );
        return;
      }
      const expectedWorldId = campaignWorlds.get(data.campaignId);
      if (
        expectedWorldId &&
        typeof data.worldId === "string" &&
        data.worldId !== expectedWorldId
      ) {
        addIssue(
          "session-world-mismatch",
          subject,
          "The Session World does not match its Campaign's resolved World.",
        );
      }
      const matching = sessionCampaignIds.get(data.campaignId) ?? [];
      matching.push(session.id);
      sessionCampaignIds.set(data.campaignId, matching);
    });

    const membershipsById = new Map(
      memberships.map((membership) => [membership.id, membership]),
    );
    const membershipCampaignIds = groupCampaignRelations(
      memberships,
      campaignNames,
      "membership-campaign-not-found",
      "A membership",
      "The membership refers to a Campaign record that is not present.",
      addIssue,
    );
    const invitationCampaignIds = groupCampaignRelations(
      invitations,
      campaignNames,
      "invitation-campaign-not-found",
      "An invitation",
      "The invitation refers to a Campaign record that is not present.",
      addIssue,
    );

    const draftsByCampaign = new Map<string, number>();
    characterDrafts.forEach((draft) => {
      const membership = membershipsById.get(draft.membershipId);
      if (!membership) {
        addIssue(
          "draft-membership-not-found",
          "A character draft",
          "The draft refers to a membership record that is not present.",
        );
        return;
      }
      increment(draftsByCampaign, membership.campaignId);
    });

    const charactersByCampaign = new Map<string, number>();
    characters.forEach((character, index) => {
      const subject = humanName(character, "character", index);
      const data = objectOrEmpty(character.data);
      if (typeof data.ownerMembershipId !== "string") {
        addIssue(
          "character-membership-missing",
          subject,
          "The Character has no owning membership and cannot be bound to a Campaign Instance.",
        );
        return;
      }
      const membership = membershipsById.get(data.ownerMembershipId);
      if (!membership) {
        addIssue(
          "character-membership-not-found",
          subject,
          "The Character's owning membership record is not present.",
        );
        return;
      }
      increment(charactersByCampaign, membership.campaignId);
    });

    const mappingProposals = campaigns
      .map((campaign, index): LegacyCampaignMappingProposal => {
        const gamesCount = gameCampaignIds.get(campaign.id)?.length ?? 0;
        const sessionsCount = sessionCampaignIds.get(campaign.id)?.length ?? 0;
        const membershipsCount =
          membershipCampaignIds.get(campaign.id)?.length ?? 0;
        const invitationsCount =
          invitationCampaignIds.get(campaign.id)?.length ?? 0;
        const characterDraftsCount = draftsByCampaign.get(campaign.id) ?? 0;
        const charactersCount = charactersByCampaign.get(campaign.id) ?? 0;
        const createCampaignInstance =
          gamesCount +
            sessionsCount +
            membershipsCount +
            invitationsCount +
            characterDraftsCount +
            charactersCount >
          0;
        const worldId = campaignWorlds.get(campaign.id);
        return {
          campaign: humanName(campaign, "campaign", index),
          world: worldId
            ? (worldNames.get(worldId) ?? "Unresolved World")
            : "Unresolved World",
          createCampaignDefinition: true,
          createCampaignInstance,
          rationale: createCampaignInstance
            ? "Create a Definition from authored content and a separate Instance for runtime or participation data."
            : "Create a Definition only; no runtime or participation data requires an Instance.",
          dependents: {
            games: gamesCount,
            sessions: sessionsCount,
            memberships: membershipsCount,
            invitations: invitationsCount,
            characterDrafts: characterDraftsCount,
            characters: charactersCount,
          },
        };
      })
      .sort((left, right) => left.campaign.localeCompare(right.campaign, "en"));

    issues.sort((left, right) =>
      [left.code, left.subject, left.detail]
        .join("\0")
        .localeCompare(
          [right.code, right.subject, right.detail].join("\0"),
          "en",
        ),
    );

    return {
      version: LEGACY_REALIGNMENT_PREFLIGHT_VERSION,
      mode: "read-only",
      inventory: {
        rootWorlds: rootWorlds.length,
        campaigns: campaigns.length,
        games: games.length,
        sessions: sessions.length,
        memberships: memberships.length,
        invitations: invitations.length,
        characterDrafts: characterDrafts.length,
        characters: characters.length,
        definitions: definitions.length,
        creatures: creatures.length,
        items: items.length,
        otherDomainRecords:
          domainRecords.length -
          locations.length -
          campaigns.length -
          games.length -
          sessions.length -
          characters.length -
          definitions.length -
          creatures.length -
          items.length,
      },
      mappingProposals,
      issues,
      readyForMigration: issues.length === 0,
    };
  }

  private inspectWorldOwnership(
    records: readonly LegacyDomainRecord[],
    resourceLabel: "definition" | "creature" | "item",
    worldNames: ReadonlyMap<string, string>,
    addIssue: (code: string, subject: string, detail: string) => void,
    ownershipRequired = false,
  ): void {
    records.forEach((record, index) => {
      const data = objectOrEmpty(record.data);
      const extensions = objectOrEmpty(data.extensions);
      const typedWorldId =
        typeof data.worldId === "string" ? data.worldId : undefined;
      const extensionWorldId =
        typeof extensions["aow:worldId"] === "string"
          ? extensions["aow:worldId"]
          : undefined;
      const subject = humanName(record, resourceLabel, index);

      if (
        (Object.hasOwn(data, "worldId") && !typedWorldId) ||
        (Object.hasOwn(extensions, "aow:worldId") && !extensionWorldId)
      ) {
        addIssue(
          `${resourceLabel}-world-reference-malformed`,
          subject,
          `The ${capitalize(resourceLabel)} has a World owner that is not a usable reference.`,
        );
        return;
      }

      if (
        typedWorldId &&
        extensionWorldId &&
        typedWorldId !== extensionWorldId
      ) {
        addIssue(
          `${resourceLabel}-world-ownership-conflict`,
          subject,
          `The ${capitalize(resourceLabel)} has conflicting typed and extension World owners.`,
        );
        return;
      }

      const worldId = typedWorldId ?? extensionWorldId;
      if (!worldId) {
        if (ownershipRequired) {
          addIssue(
            `${resourceLabel}-world-reference-malformed`,
            subject,
            `The ${capitalize(resourceLabel)} has no usable World owner.`,
          );
        }
        return;
      }
      if (!worldNames.has(worldId)) {
        addIssue(
          `${resourceLabel}-world-not-found`,
          subject,
          `The ${capitalize(resourceLabel)} refers to a root World that is not present.`,
        );
      }
    });
  }
}

function groupCampaignRelations(
  relations: readonly LegacyCampaignRelation[],
  campaignNames: ReadonlyMap<string, string>,
  issueCode: string,
  issueSubject: string,
  issueDetail: string,
  addIssue: (code: string, subject: string, detail: string) => void,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const relation of relations) {
    if (!campaignNames.has(relation.campaignId)) {
      addIssue(issueCode, issueSubject, issueDetail);
      continue;
    }
    const matching = grouped.get(relation.campaignId) ?? [];
    matching.push(relation.id);
    grouped.set(relation.campaignId, matching);
  }
  return grouped;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectOrEmpty(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function humanName(
  record: Pick<LegacyDomainRecord, "name">,
  kind: string,
  index: number,
): string {
  return record.name?.trim() || `Unnamed ${kind} record ${index + 1}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
