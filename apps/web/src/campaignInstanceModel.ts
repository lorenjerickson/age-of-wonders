import type { JsonValue } from "./api";
import type {
  CampaignInstanceMigrationPreviewProjection,
  CampaignInstancePlacementCommandRequest,
  CreatureId,
  ItemInstanceId,
} from "@aow/common";

export interface CampaignInstanceNavigationGroup {
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
  readonly children: readonly { label: string; href: string }[];
}

export function campaignInstanceNavigationForPath(
  campaignInstanceId: string,
  pathname: string,
): readonly CampaignInstanceNavigationGroup[] {
  const base = `/campaigns/instances/${encodeURIComponent(campaignInstanceId)}`;
  const groups = [
    {
      key: "preparation",
      label: "Preparation",
      children: [
        { label: "Plots & staging", href: `${base}/plots` },
        { label: "Placements", href: `${base}/placements` },
      ],
    },
    {
      key: "participation",
      label: "Participation",
      children: [
        { label: "Roster", href: `${base}/roster` },
        { label: "Agents", href: `${base}/roster/agents` },
      ],
    },
    {
      key: "history",
      label: "History",
      children: [
        { label: "Sessions", href: `${base}/sessions` },
        { label: "Versions & migrations", href: `${base}/versions` },
      ],
    },
  ] as const;
  return groups.map((group) => ({
    ...group,
    active: group.children.some(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
    ),
  }));
}

export interface ContinuationSession {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export type CampaignContinuationAction =
  | {
      readonly kind: "continue" | "resume" | "open";
      readonly label: "Continue" | "Resume" | "Open Session";
      readonly sessionId: string;
      readonly sessionName: string;
    }
  | {
      readonly kind: "choose" | "plan" | "unavailable";
      readonly label:
        "Choose Session" | "Plan Session" | "Continue unavailable";
      readonly explanation: string;
    };

export function continueCampaignAction(input: {
  readonly instanceStatus: string;
  readonly sessions: readonly ContinuationSession[];
}): CampaignContinuationAction {
  const status = input.instanceStatus.toLowerCase();
  const live = input.sessions.filter(
    ({ status: value }) => value.toLowerCase() === "live",
  );
  if (live.length === 1) return sessionAction("continue", "Continue", live[0]!);
  if (live.length > 1)
    return {
      kind: "choose",
      label: "Choose Session",
      explanation: "Choose which Session to continue.",
    };
  const paused = input.sessions.filter(
    ({ status: value }) => value.toLowerCase() === "paused",
  );
  if (paused.length === 1) return sessionAction("resume", "Resume", paused[0]!);
  const eligible = input.sessions.filter(({ status: value }) =>
    ["paused", "lobby", "planned"].includes(value.toLowerCase()),
  );
  if (eligible.length > 1)
    return {
      kind: "choose",
      label: "Choose Session",
      explanation: "Choose which Session to continue.",
    };
  if (eligible.length === 1)
    return sessionAction("open", "Open Session", eligible[0]!);
  if (["concluded", "archived"].includes(status))
    return {
      kind: "unavailable",
      label: "Continue unavailable",
      explanation: "This Campaign Instance is no longer active.",
    };
  return {
    kind: "plan",
    label: "Plan Session",
    explanation: "Plan the first Session before continuing this campaign.",
  };
}

function sessionAction(
  kind: "continue" | "resume" | "open",
  label: "Continue" | "Resume" | "Open Session",
  session: ContinuationSession,
): CampaignContinuationAction {
  return { kind, label, sessionId: session.id, sessionName: session.name };
}

export interface InstanceReadinessInput {
  readonly hasSnapshot: boolean;
  readonly hasStartingContext: boolean;
  readonly stagedPlotCount: number;
  readonly activePlayerCount: number;
  readonly readyCharacterCount: number;
  readonly plannedSessionCount: number;
  readonly unresolvedMigrationCount: number;
}

export function instanceReadinessSummary(input: InstanceReadinessInput) {
  const items = [
    readiness(
      "snapshot",
      "Compatible Campaign and World captured",
      input.hasSnapshot,
    ),
    readiness(
      "preparation",
      "Starting context prepared",
      input.hasStartingContext,
    ),
    readiness("plots", "At least one Plot staged", input.stagedPlotCount > 0),
    {
      key: "characters",
      label: "Every active Player has a ready Character",
      state:
        input.activePlayerCount === 0
          ? ("incomplete" as const)
          : input.readyCharacterCount >= input.activePlayerCount
            ? ("complete" as const)
            : ("blocked" as const),
    },
    readiness("session", "A Session is planned", input.plannedSessionCount > 0),
    readiness(
      "migration",
      "No unresolved migration conflict",
      input.unresolvedMigrationCount === 0,
    ),
  ];
  return {
    items,
    complete: items.filter(({ state }) => state === "complete").length,
  };
}

function readiness(key: string, label: string, complete: boolean) {
  return {
    key,
    label,
    state: complete ? ("complete" as const) : ("incomplete" as const),
  };
}

export function visibleInstanceReference(
  value: string | undefined,
  fallback: string,
) {
  const label = value?.trim();
  if (!label || /(?:^|:)[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(label))
    return fallback;
  return label;
}

export function mergeInstanceRuntimeState(
  current: Record<string, JsonValue>,
  supported: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return { ...current, ...supported };
}

export function campaignInstanceInvitationCanRetry(status: string) {
  return status === "pending" || status === "expired";
}

export function mergeMigrationPreviewPages(
  pages: readonly CampaignInstanceMigrationPreviewProjection[],
): CampaignInstanceMigrationPreviewProjection | undefined {
  const first = pages[0];
  if (!first) return undefined;
  if (pages.some(({ planHash }) => planHash !== first.planHash)) return undefined;
  const conflicts = new Map(
    pages.flatMap(({ conflicts }) => conflicts).map((item) => [item.key, item]),
  );
  const candidates = new Map(
    pages
      .flatMap(({ mappingCandidates }) => mappingCandidates)
      .map((item) => [
        `${item.conflictKey}:${item.resourceType}:${item.sourceId}:${item.targetId}`,
        item,
      ]),
  );
  const last = pages.at(-1)!;
  return {
    ...last,
    changes: pages.flatMap(({ changes }) => changes),
    conflicts: [...conflicts.values()],
    mappingCandidates: [...candidates.values()],
  };
}

export function migrationPreviewIsComplete(
  preview: CampaignInstanceMigrationPreviewProjection,
) {
  return (
    preview.nextChangeOffset === undefined &&
    preview.nextConflictOffset === undefined &&
    preview.nextCandidateOffset === undefined &&
    preview.changes.length === preview.totalChanges &&
    preview.conflicts.length === preview.totalConflicts &&
    preview.mappingCandidates.length === preview.totalMappingCandidates
  );
}

export function placementCommand(
  expectedRuntimeRevision: number,
  action: CampaignInstancePlacementCommandRequest["action"],
  replacementSelection = "",
): CampaignInstancePlacementCommandRequest | undefined {
  if (action !== "replace") return { expectedRuntimeRevision, action };
  const [kind, entityId] = replacementSelection.split("\u0000");
  if (kind === "existing-creature" && entityId) {
    return {
      expectedRuntimeRevision,
      action,
      replacement: {
        kind,
        runtimeCreatureId: entityId as CreatureId,
      },
    };
  }
  if (kind === "existing-item" && entityId) {
    return {
      expectedRuntimeRevision,
      action,
      replacement: { kind, runtimeItemId: entityId as ItemInstanceId },
    };
  }
  return undefined;
}
