export const QUICK_START_ACTIVITY_KEYS = [
  "choose-world",
  "review-campaign-definition",
  "create-campaign-instance",
  "invite-players",
  "plan-session",
] as const;

export type QuickStartActivityKey = (typeof QUICK_START_ACTIVITY_KEYS)[number];

export type QuickStartVerificationKind = "system" | "self";
export type QuickStartStepStatus =
  "not-started" | "current" | "complete" | "blocked";

export interface QuickStartStepDefinition {
  readonly key: string;
  readonly label: string;
  readonly verification: QuickStartVerificationKind;
}

export interface QuickStartActivityDefinition {
  readonly key: QuickStartActivityKey;
  readonly revision: number;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly steps: readonly QuickStartStepDefinition[];
}

export interface QuickStartStepView extends QuickStartStepDefinition {
  readonly status: QuickStartStepStatus;
  readonly detail: string;
}

export interface QuickStartActivityView {
  readonly definition: QuickStartActivityDefinition;
  readonly steps: readonly QuickStartStepView[];
  readonly complete: boolean;
  readonly completedStepCount: number;
  readonly currentStepKey?: string;
  readonly collapsed: boolean;
  readonly lastCanonicalRoute?: string;
  readonly targetLabels: readonly string[];
}

export interface QuickStartOverview {
  readonly activities: readonly QuickStartActivityView[];
}

export interface UpdateQuickStartProgress {
  readonly lastCanonicalRoute?: string;
  readonly collapsed?: boolean;
  readonly selfConfirmedStepKeys?: readonly string[];
}

export const QUICK_START_ACTIVITY_DEFINITIONS = [
  {
    key: "choose-world",
    revision: 2,
    title: "Choose a World Definition",
    description:
      "Choose a World and establish a published Atlas foundation in its canonical workspace.",
    href: "/worlds?quickStart=choose-world",
    steps: [
      {
        key: "world-selected",
        label: "Choose a named World Definition.",
        verification: "system",
      },
      {
        key: "atlas-started",
        label: "Create its root Location and initial Atlas hierarchy.",
        verification: "system",
      },
      {
        key: "world-published",
        label: "Publish a valid World revision.",
        verification: "system",
      },
    ],
  },
  {
    key: "review-campaign-definition",
    revision: 2,
    title: "Author your first Campaign Definition",
    description:
      "Create real Campaign material against one explicitly captured World revision.",
    href: "/campaigns/definitions/new?quickStart=review-campaign-definition",
    steps: [
      {
        key: "campaign-created",
        label: "Create a Campaign Definition from a published World revision.",
        verification: "system",
      },
      {
        key: "campaign-introduction",
        label: "Add the GM premise and player-safe introduction.",
        verification: "system",
      },
      {
        key: "root-plot",
        label: "Add at least one root Plot.",
        verification: "system",
      },
      {
        key: "campaign-published",
        label: "Validate and publish the first Campaign revision.",
        verification: "system",
      },
    ],
  },
  {
    key: "create-campaign-instance",
    revision: 2,
    title: "Create your first Campaign Instance",
    description:
      "Create a played realization from an exact published Campaign Definition revision.",
    href: "/campaigns/instances/new?quickStart=create-campaign-instance",
    steps: [
      {
        key: "instance-created",
        label: "Create and name a Campaign Instance.",
        verification: "system",
      },
      {
        key: "campaign-captured",
        label: "Capture its exact Campaign Definition revision.",
        verification: "system",
      },
      {
        key: "world-captured",
        label: "Confirm the compatible captured World revision.",
        verification: "system",
      },
      {
        key: "runtime-ready",
        label: "Review its initialized runtime and preparation readiness.",
        verification: "system",
      },
    ],
  },
  {
    key: "invite-players",
    revision: 2,
    title: "Prepare your players",
    description:
      "Establish durable server profiles and Campaign Instance participation.",
    href: "/players?quickStart=invite-players",
    steps: [
      {
        key: "player-profile",
        label: "Establish at least one Player profile.",
        verification: "system",
      },
      {
        key: "player-invited",
        label: "Invite a Player to one of your Campaign Instances.",
        verification: "system",
      },
      {
        key: "player-member",
        label: "Establish an active Player membership in the Instance.",
        verification: "system",
      },
    ],
  },
  {
    key: "plan-session",
    revision: 2,
    title: "Plan and open your first Session",
    description:
      "Choose a Campaign Instance, select participants, and prepare the discrete Session lobby.",
    href: "/campaigns/instances?quickStart=plan-session",
    steps: [
      {
        key: "instance-selected",
        label: "Choose the Campaign Instance you want to continue.",
        verification: "system",
      },
      {
        key: "session-planned",
        label: "Plan a named Session.",
        verification: "system",
      },
      {
        key: "players-selected",
        label: "Select existing Instance Players and optional Spectators.",
        verification: "system",
      },
      {
        key: "invitations-issued",
        label: "Open the lobby and issue Session invitations.",
        verification: "system",
      },
      {
        key: "lobby-ready",
        label: "Resolve every blocking lobby readiness check.",
        verification: "system",
      },
    ],
  },
] as const satisfies readonly QuickStartActivityDefinition[];
