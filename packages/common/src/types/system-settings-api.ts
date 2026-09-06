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

export type SystemSettingSource =
  "application" | "deployment" | "default" | "disabled" | "observed";

export interface SystemSettingOption {
  readonly value: string;
  readonly label: string;
}

export interface SystemSettingControl {
  readonly kind: "text" | "number" | "select" | "secret";
  readonly expectedRevision: number;
  readonly value?: string | number;
  readonly options?: readonly SystemSettingOption[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly canReset: boolean;
  readonly canDisable: boolean;
  readonly canTest: boolean;
}

export interface SystemSettingStatus {
  readonly key: string;
  readonly label: string;
  readonly classification: SystemSettingClassification;
  readonly status: "ready" | "attention" | "disabled" | "unavailable";
  readonly detail: string;
  readonly valueLabel?: string;
  readonly restartRequired?: boolean;
  readonly source?: SystemSettingSource;
  readonly control?: SystemSettingControl;
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

export interface UpdateSystemSettingRequest {
  readonly expectedRevision: number;
  readonly value: string | number;
  readonly reason?: string;
}

export interface ReplaceSystemSecretRequest {
  readonly expectedRevision: number;
  readonly secret: string;
  readonly reason?: string;
}

export interface SystemSettingActionRequest {
  readonly expectedRevision: number;
  readonly reason?: string;
}

export interface SystemSettingMutationResult {
  readonly setting: SystemSettingStatus;
}

export interface ConfigurationRevisionProjection {
  readonly revision: number;
  readonly action:
    | "value-set"
    | "secret-replaced"
    | "secret-rotated"
    | "secret-revoked"
    | "override-reset"
    | "validation-succeeded"
    | "validation-failed";
  readonly actorName: string;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface ConfigurationHistoryProjection {
  readonly settingLabel: string;
  readonly revisions: readonly ConfigurationRevisionProjection[];
}
