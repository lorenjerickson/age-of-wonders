export const QUICK_START_ACTIVITIES = [
  {
    key: "choose-world",
    title: "Choose a World Definition",
    description:
      "Open the World you want to author and review its revision context.",
    href: "/worlds?quickStart=choose-world",
    steps: [
      "Open the Worlds library.",
      "Choose a named World Definition.",
      "Confirm the published revision shown in the World workspace.",
    ],
  },
  {
    key: "review-campaign-definition",
    title: "Author your first Campaign Definition",
    description:
      "Create real authoring material against one explicitly captured World revision.",
    href: "/campaigns/definitions/new?quickStart=review-campaign-definition",
    steps: [
      "Choose a published World revision.",
      "Create the Campaign Definition working draft.",
      "Add the GM premise and player-safe introduction.",
      "Add at least one root Plot.",
      "Validate and publish the first Campaign revision.",
    ],
  },
  {
    key: "review-campaign-instance",
    title: "Review a Campaign Instance",
    description:
      "Open a played realization without entering Definition authoring.",
    href: "/campaigns?quickStart=review-campaign-instance",
    steps: [
      "Find the Instances section.",
      "Manage an active Campaign Instance.",
      "Review its captured compatible pair and runtime status.",
    ],
  },
  {
    key: "invite-players",
    title: "Prepare your players",
    description:
      "Visit the stable Players destination and review participation readiness.",
    href: "/players?quickStart=invite-players",
    steps: [
      "Open Players.",
      "Review the distinction between server profiles and Campaign membership.",
      "Note which invitations still need to be created.",
    ],
  },
] as const;

export type QuickStartActivityKey =
  (typeof QUICK_START_ACTIVITIES)[number]["key"];

export function quickStartActivity(value: string | undefined) {
  return QUICK_START_ACTIVITIES.find((activity) => activity.key === value);
}

export function quickStartKeyFromSearch(search: string) {
  const value = new URLSearchParams(search.replace(/^\?/, "")).get(
    "quickStart",
  );
  return quickStartActivity(value ?? undefined)?.key;
}

export function quickStartSuffix(search: string) {
  const key = quickStartKeyFromSearch(search);
  return key ? `?quickStart=${encodeURIComponent(key)}` : "";
}

export function quickStartStorageKey(gmScope: string) {
  const normalized = gmScope.trim().toLocaleLowerCase() || "local-gm";
  let hash = 2166136261;
  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `aow.quick-start.v1.${(hash >>> 0).toString(36)}`;
}

export function quickStartActivityIsComplete(
  completedSteps: ReadonlySet<number>,
  stepCount: number,
) {
  return stepCount > 0 && completedSteps.size === stepCount;
}

export function parseQuickStartProgress(value: string | null) {
  if (!value) return new Set<QuickStartActivityKey>();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set<QuickStartActivityKey>();
    return new Set(
      parsed.filter(
        (key): key is QuickStartActivityKey =>
          typeof key === "string" && quickStartActivity(key) !== undefined,
      ),
    );
  } catch {
    return new Set<QuickStartActivityKey>();
  }
}
