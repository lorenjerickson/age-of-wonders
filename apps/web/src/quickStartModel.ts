import { QUICK_START_ACTIVITY_DEFINITIONS } from "@aow/common";

export type { QuickStartActivityKey } from "@aow/common";

export const QUICK_START_ACTIVITIES = QUICK_START_ACTIVITY_DEFINITIONS.map(
  (activity) => ({
    ...activity,
    steps: activity.steps.map(({ label }) => label),
  }),
);

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
