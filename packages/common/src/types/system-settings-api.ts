export const SYSTEM_SETTING_AREAS = [
  "overview",
  "hosting-network",
  "access-security",
  "plugins",
  "integrations-api",
  "ai",
  "communications",
  "data-storage",
  "backup-recovery",
  "operations",
  "privacy-governance",
  "updates-lifecycle",
] as const;

export type SystemSettingArea = (typeof SYSTEM_SETTING_AREAS)[number];

export type SystemSettingClassification =
  "application-managed" | "secret-backed" | "deployment-managed" | "observed";

export interface SystemSettingStatus {
  readonly key: string;
  readonly label: string;
  readonly classification: SystemSettingClassification;
  readonly status: "ready" | "attention" | "disabled" | "unavailable";
  readonly detail: string;
  readonly valueLabel?: string;
  readonly restartRequired?: boolean;
}

export interface SystemSettingAreaSummary {
  readonly area: SystemSettingArea;
  readonly label: string;
  readonly description: string;
  readonly status: SystemSettingStatus["status"];
}

export interface SystemSettingAreaProjection extends SystemSettingAreaSummary {
  readonly settings: readonly SystemSettingStatus[];
}

export interface SystemSettingsIndexProjection {
  readonly installationName: string;
  readonly areas: readonly SystemSettingAreaSummary[];
}
