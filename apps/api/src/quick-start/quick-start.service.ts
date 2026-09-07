import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  QUICK_START_ACTIVITY_DEFINITIONS,
  type QuickStartActivityDefinition,
  type QuickStartActivityKey,
  type QuickStartActivityView,
  type QuickStartOverview,
} from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignSessionService } from "../campaign-instances/campaign-session.service";
import type { UpdateQuickStartProgressDto } from "./dto/quick-start.dto";

type TargetContext = {
  worldDefinitionId?: string;
  campaignDefinitionId?: string;
  campaignInstanceId?: string;
  sessionId?: string;
};

type Evidence = { complete: boolean; detail: string };

@Injectable()
export class QuickStartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: CampaignSessionService,
  ) {}

  async overview(userId: string): Promise<QuickStartOverview> {
    return {
      activities: await Promise.all(
        QUICK_START_ACTIVITY_DEFINITIONS.map((definition) =>
          this.evaluate(userId, definition),
        ),
      ),
    };
  }

  async activity(userId: string, activityKey: string) {
    return this.evaluate(userId, definitionFor(activityKey));
  }

  async update(
    userId: string,
    activityKey: string,
    input: UpdateQuickStartProgressDto,
  ) {
    const definition = definitionFor(activityKey);
    const existing = await this.prisma.quickStartProgress.findUnique({
      where: { userId_activityKey: { userId, activityKey } },
    });
    const priorTargets = targetContext(existing?.targetContext);
    const route = input.lastCanonicalRoute?.trim();
    const routeTargets = route
      ? await this.targetsFromRoute(userId, definition.key, route)
      : undefined;
    const retainedRoute = route
      ? definition.key === "invite-players" || hasTarget(routeTargets)
        ? route
        : (existing?.lastCanonicalRoute ?? route)
      : undefined;
    const allowedSelfKeys = new Set(
      definition.steps
        .filter(({ verification }) => verification === "self")
        .map(({ key }) => key),
    );
    const selfConfirmedStepKeys = (
      input.selfConfirmedStepKeys ??
      stringArray(existing?.selfConfirmedStepKeys)
    )
      .filter((key) => allowedSelfKeys.has(key))
      .sort();
    await this.prisma.quickStartProgress.upsert({
      where: { userId_activityKey: { userId, activityKey } },
      create: {
        userId,
        activityKey,
        activityRevision: definition.revision,
        collapsed: input.collapsed ?? false,
        selfConfirmedStepKeys,
        targetContext: json({ ...priorTargets, ...routeTargets }),
        lastCanonicalRoute: retainedRoute,
      },
      update: {
        activityRevision: definition.revision,
        ...(input.collapsed === undefined
          ? {}
          : { collapsed: input.collapsed }),
        selfConfirmedStepKeys,
        targetContext: json({ ...priorTargets, ...routeTargets }),
        ...(retainedRoute === undefined
          ? {}
          : { lastCanonicalRoute: retainedRoute }),
      },
    });
    return this.evaluate(userId, definition);
  }

  private async evaluate(
    userId: string,
    definition: QuickStartActivityDefinition,
  ): Promise<QuickStartActivityView> {
    let progress = await this.prisma.quickStartProgress.findUnique({
      where: {
        userId_activityKey: { userId, activityKey: definition.key },
      },
    });
    if (progress && progress.activityRevision !== definition.revision) {
      const allowedSelfKeys = new Set(
        definition.steps
          .filter(({ verification }) => verification === "self")
          .map(({ key }) => key),
      );
      progress = await this.prisma.quickStartProgress.update({
        where: { id: progress.id },
        data: {
          activityRevision: definition.revision,
          selfConfirmedStepKeys: stringArray(
            progress.selfConfirmedStepKeys,
          ).filter((key) => allowedSelfKeys.has(key)),
          currentStepKey: null,
        },
      });
    }
    const targets = targetContext(progress?.targetContext);
    const { evidence, labels } = await this.evidence(
      userId,
      definition.key,
      targets,
    );
    const confirmations = new Set(stringArray(progress?.selfConfirmedStepKeys));
    let firstIncomplete = -1;
    const completed = definition.steps.map((step, index) => {
      const item =
        step.verification === "self"
          ? {
              complete: confirmations.has(step.key),
              detail: confirmations.has(step.key)
                ? "Self-confirmed by you."
                : "Confirm this learning step when you have reviewed it.",
            }
          : (evidence[step.key] ?? {
              complete: false,
              detail: "Select an accessible target to evaluate this step.",
            });
      if (!item.complete && firstIncomplete < 0) firstIncomplete = index;
      return item;
    });
    const steps = definition.steps.map((step, index) => ({
      ...step,
      status: completed[index].complete
        ? ("complete" as const)
        : index === firstIncomplete
          ? ("current" as const)
          : ("blocked" as const),
      detail: completed[index].detail,
    }));
    const currentStepKey = steps.find(
      ({ status }) => status === "current",
    )?.key;
    if (progress && progress.currentStepKey !== currentStepKey) {
      await this.prisma.quickStartProgress.update({
        where: { id: progress.id },
        data: { currentStepKey: currentStepKey ?? null },
      });
    }
    return {
      definition,
      steps,
      complete: completed.every(({ complete }) => complete),
      completedStepCount: completed.filter(({ complete }) => complete).length,
      currentStepKey,
      collapsed: progress?.collapsed ?? false,
      lastCanonicalRoute: progress?.lastCanonicalRoute ?? undefined,
      targetLabels: labels,
    };
  }

  private async evidence(
    userId: string,
    key: QuickStartActivityKey,
    targets: TargetContext,
  ): Promise<{ evidence: Record<string, Evidence>; labels: string[] }> {
    if (key === "choose-world") return this.worldEvidence(userId, targets);
    if (key === "review-campaign-definition")
      return this.campaignEvidence(userId, targets);
    if (key === "create-campaign-instance")
      return this.instanceEvidence(userId, targets);
    if (key === "invite-players") return this.playerEvidence(userId);
    return this.sessionEvidence(userId, targets);
  }

  private async worldEvidence(userId: string, targets: TargetContext) {
    const world = targets.worldDefinitionId
      ? await this.prisma.worldDefinition.findFirst({
          where: { id: targets.worldDefinitionId, ownerUserId: userId },
          select: {
            name: true,
            currentRevisionId: true,
            currentRevision: { select: { content: true } },
            draft: { select: { content: true, snapshotRecords: true } },
          },
        })
      : null;
    const content = objectValue(
      world?.draft?.content ?? world?.currentRevision?.content,
    );
    const hasAtlas =
      text(content.rootLocationId) !== "" &&
      stringArray(content.locationIds).length > 0;
    return {
      labels: world ? [world.name] : [],
      evidence: {
        "world-selected": state(
          Boolean(world),
          "A World is selected.",
          "Choose a World by name.",
        ),
        "atlas-started": state(
          hasAtlas,
          "The selected World has an Atlas root.",
          "Create the root Location in Atlas.",
        ),
        "world-published": state(
          Boolean(world?.currentRevisionId),
          "The selected World has a published revision.",
          "Validate and publish the World draft.",
        ),
      },
    };
  }

  private async campaignEvidence(userId: string, targets: TargetContext) {
    const campaign = targets.campaignDefinitionId
      ? await this.prisma.campaignDefinition.findFirst({
          where: { id: targets.campaignDefinitionId, ownerUserId: userId },
          select: {
            name: true,
            currentRevisionId: true,
            currentRevision: { select: { content: true } },
            draft: { select: { content: true, snapshotRecords: true } },
          },
        })
      : null;
    const content = objectValue(
      campaign?.draft?.content ?? campaign?.currentRevision?.content,
    );
    const records = arrayValue(campaign?.draft?.snapshotRecords);
    const completeIntroduction =
      text(content.gmPremise).trim().length > 0 &&
      text(content.playerIntroduction).trim().length > 0;
    const rootPlot =
      records.some((record) => {
        const row = objectValue(record);
        const payload = objectValue(row.payload);
        return (
          row.resourceType === "plots" &&
          objectValue(payload.parent).kind === "root"
        );
      }) || stringArray(content.plotDefinitionIds).length > 0;
    return {
      labels: campaign ? [campaign.name] : [],
      evidence: {
        "campaign-created": state(
          Boolean(campaign),
          "The Campaign Definition exists and captures a World.",
          "Create or choose a Campaign Definition.",
        ),
        "campaign-introduction": state(
          completeIntroduction,
          "The premise and player introduction are present.",
          "Add both introductions in Overview.",
        ),
        "root-plot": state(
          rootPlot,
          "The Campaign contains a Plot.",
          "Add a root Plot in Plots.",
        ),
        "campaign-published": state(
          Boolean(campaign?.currentRevisionId),
          "The Campaign has a published revision.",
          "Validate and publish the Campaign draft.",
        ),
      },
    };
  }

  private async instanceEvidence(userId: string, targets: TargetContext) {
    const instance = targets.campaignInstanceId
      ? await this.prisma.campaignInstance.findFirst({
          where: { id: targets.campaignInstanceId, ownerUserId: userId },
          select: {
            name: true,
            currentSnapshot: {
              select: {
                campaignDefinitionSnapshotId: true,
                worldDefinitionSnapshotId: true,
              },
            },
            runtime: { select: { id: true } },
          },
        })
      : null;
    return {
      labels: instance ? [instance.name] : [],
      evidence: {
        "instance-created": state(
          Boolean(instance),
          "The Campaign Instance exists.",
          "Create or choose a Campaign Instance.",
        ),
        "campaign-captured": state(
          Boolean(instance?.currentSnapshot?.campaignDefinitionSnapshotId),
          "An exact Campaign Definition snapshot is captured.",
          "Create the Instance from a published Campaign revision.",
        ),
        "world-captured": state(
          Boolean(instance?.currentSnapshot?.worldDefinitionSnapshotId),
          "The compatible World snapshot is captured.",
          "Resolve the captured Campaign and World pair.",
        ),
        "runtime-ready": state(
          Boolean(instance?.runtime),
          "The continuing Instance runtime is initialized.",
          "Open preparation and resolve initialization problems.",
        ),
      },
    };
  }

  private async playerEvidence(userId: string) {
    const [profiles, invitations, memberships] = await Promise.all([
      this.prisma.playerProfile.count(),
      this.prisma.campaignInstanceInvitation.count({
        where: { campaignInstance: { ownerUserId: userId }, role: "PLAYER" },
      }),
      this.prisma.campaignInstanceHumanMembership.count({
        where: {
          campaignInstance: { ownerUserId: userId },
          role: "PLAYER",
          status: "ACTIVE",
        },
      }),
    ]);
    return {
      labels: [],
      evidence: {
        "player-profile": state(
          profiles > 0,
          "A Player profile exists on this server.",
          "Invite a person to establish a Player profile.",
        ),
        "player-invited": state(
          invitations > 0,
          "A Player invitation exists for one of your Instances.",
          "Open an Instance roster and invite a Player.",
        ),
        "player-member": state(
          memberships > 0,
          "An active Player membership exists.",
          "Have an invited Player accept an Instance invitation.",
        ),
      },
    };
  }

  private async sessionEvidence(userId: string, targets: TargetContext) {
    const instance = targets.campaignInstanceId
      ? await this.prisma.campaignInstance.findFirst({
          where: { id: targets.campaignInstanceId, ownerUserId: userId },
          select: { id: true, name: true },
        })
      : null;
    const session =
      instance && targets.sessionId
        ? await this.prisma.campaignInstanceSession.findFirst({
            where: { id: targets.sessionId, campaignInstanceId: instance.id },
            select: {
              id: true,
              name: true,
              status: true,
              participations: { select: { role: true, response: true } },
            },
          })
        : null;
    const players =
      session?.participations.filter(({ role }) => role === "PLAYER") ?? [];
    const invitees =
      session?.participations.filter(
        ({ role }) => role === "PLAYER" || role === "SPECTATOR",
      ) ?? [];
    let ready = false;
    if (instance && session) {
      try {
        ready = (await this.sessions.readiness(instance.id, session.id, userId))
          .ready;
      } catch {
        ready = false;
      }
    }
    return {
      labels: [instance?.name, session?.name].filter((value): value is string =>
        Boolean(value),
      ),
      evidence: {
        "instance-selected": state(
          Boolean(instance),
          "A Campaign Instance is selected.",
          "Choose an Instance by name.",
        ),
        "session-planned": state(
          Boolean(session),
          "A named Session is planned.",
          "Open Sessions and plan a Session.",
        ),
        "players-selected": state(
          players.length > 0,
          "At least one Instance Player is selected.",
          "Select an existing Instance Player.",
        ),
        "invitations-issued": state(
          Boolean(
            session &&
            session.status !== "PLANNED" &&
            invitees.length > 0 &&
            invitees.every(({ response }) => response !== "NOT_REQUESTED"),
          ),
          "The lobby is open and invitations were issued.",
          "Open the lobby and issue invitations.",
        ),
        "lobby-ready": state(
          ready ||
            Boolean(
              session &&
              ["ACTIVE", "PAUSED", "CONCLUDED"].includes(session.status),
            ),
          "Every blocking readiness check is resolved.",
          "Resolve the blocking checks shown in the lobby.",
        ),
      },
    };
  }

  private async targetsFromRoute(
    userId: string,
    key: QuickStartActivityKey,
    route: string,
  ): Promise<TargetContext> {
    if (!route.startsWith("/") || route.includes("?") || route.includes("#"))
      throw new BadRequestException("The Quick Start route is invalid.");
    if (key === "invite-players") {
      if (!/^\/players(?:\/[^/]+)?$/.test(route))
        throw new BadRequestException(
          "The route is outside this Quick Start activity.",
        );
      return {};
    }
    const patterns: Record<
      Exclude<QuickStartActivityKey, "invite-players">,
      RegExp
    > = {
      "choose-world": /^\/worlds(?:\/([^/]+).*)?$/,
      "review-campaign-definition":
        /^\/campaigns\/definitions(?:\/([^/]+).*)?$/,
      "create-campaign-instance": /^\/campaigns\/instances(?:\/([^/]+).*)?$/,
      "plan-session":
        /^\/campaigns\/instances(?:\/([^/]+)(?:\/sessions\/([^/]+).*)?)?$/,
    };
    const match = route.match(patterns[key]);
    if (!match)
      throw new BadRequestException(
        "The route is outside this Quick Start activity.",
      );
    const first = decode(match[1]);
    const second = decode(match[2]);
    if (!first || first === "new") return {};
    if (key === "choose-world") {
      const row = await this.prisma.worldDefinition.findFirst({
        where: { id: first, ownerUserId: userId },
        select: { id: true },
      });
      return row ? { worldDefinitionId: row.id } : {};
    }
    if (key === "review-campaign-definition") {
      const row = await this.prisma.campaignDefinition.findFirst({
        where: { id: first, ownerUserId: userId },
        select: { id: true },
      });
      return row ? { campaignDefinitionId: row.id } : {};
    }
    const row = await this.prisma.campaignInstance.findFirst({
      where: { id: first, ownerUserId: userId },
      select: { id: true },
    });
    if (!row) return {};
    if (key === "plan-session" && second) {
      const session = await this.prisma.campaignInstanceSession.findFirst({
        where: { id: second, campaignInstanceId: row.id },
        select: { id: true },
      });
      return {
        campaignInstanceId: row.id,
        ...(session ? { sessionId: session.id } : {}),
      };
    }
    return { campaignInstanceId: row.id };
  }
}

function definitionFor(value: string): QuickStartActivityDefinition {
  const definition = QUICK_START_ACTIVITY_DEFINITIONS.find(
    ({ key }) => key === value,
  );
  if (!definition)
    throw new BadRequestException("The Quick Start activity is invalid.");
  return definition;
}

function state(complete: boolean, yes: string, no: string): Evidence {
  return { complete, detail: complete ? yes : no };
}

function targetContext(value: unknown): TargetContext {
  const object = objectValue(value);
  return {
    worldDefinitionId: optionalText(object.worldDefinitionId),
    campaignDefinitionId: optionalText(object.campaignDefinitionId),
    campaignInstanceId: optionalText(object.campaignInstanceId),
    sessionId: optionalText(object.sessionId),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result || undefined;
}

function json(value: TargetContext): Prisma.InputJsonValue {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function hasTarget(value: TargetContext | undefined): boolean {
  return Boolean(
    value?.worldDefinitionId ||
    value?.campaignDefinitionId ||
    value?.campaignInstanceId ||
    value?.sessionId,
  );
}

function decode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
