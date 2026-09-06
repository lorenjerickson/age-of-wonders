import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SYSTEM_SETTING_AREAS,
  type SystemSettingArea,
  type SystemSettingAreaProjection,
  type SystemSettingStatus,
  type SystemSettingsIndexProjection,
} from "@aow/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ReplaceSystemSecretDto,
  SystemSettingActionDto,
  UpdateSystemSettingDto,
} from "./dto/system-setting.dto";
import { HostedConfigurationService } from "./hosted-configuration.service";

const AREA_METADATA: Record<
  SystemSettingArea,
  { label: string; description: string }
> = {
  overview: {
    label: "Overview & readiness",
    description: "Deployment identity, dependencies, and blocking actions.",
  },
  "hosting-network": {
    label: "Hosting & network",
    description:
      "Public addresses, origins, locale, time zone, and TLS boundaries.",
  },
  "access-security": {
    label: "Access & security",
    description:
      "Administrators, authentication, sessions, and encryption posture.",
  },
  plugins: {
    label: "Plugins",
    description:
      "Installation-wide plugin sources, permissions, versions, and health.",
  },
  "integrations-api": {
    label: "Integrations & API credentials",
    description:
      "Provider connections, API clients, scoped keys, and webhooks.",
  },
  ai: {
    label: "AI",
    description:
      "Provider availability, model selection, budgets, and retention.",
  },
  communications: {
    label: "Communications",
    description: "Email, SMS, invitation delivery, and provider health.",
  },
  "data-storage": {
    label: "Data & storage",
    description:
      "Database, object storage, media, and graph projection status.",
  },
  "backup-recovery": {
    label: "Backup, recovery & transfer",
    description:
      "Backup policy, verification, restore readiness, and host transfer.",
  },
  operations: {
    label: "Operations",
    description:
      "Diagnostics, background work, limits, and maintenance posture.",
  },
  "privacy-governance": {
    label: "Privacy & data governance",
    description: "PII, retention, export, deletion, and audit policy.",
  },
  "updates-lifecycle": {
    label: "Updates & lifecycle",
    description:
      "Version, compatibility, preflight, rollback, and restart impact.",
  },
};

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly hosted: HostedConfigurationService,
  ) {}

  async index(): Promise<SystemSettingsIndexProjection> {
    const areas = await Promise.all(
      SYSTEM_SETTING_AREAS.map((area) => this.area(area)),
    );
    return {
      installationName: await this.hosted.installationName(),
      areas: areas.map(({ settings, ...summary }) => {
        void settings;
        return summary;
      }),
    };
  }

  async area(value: string): Promise<SystemSettingAreaProjection> {
    if (!(SYSTEM_SETTING_AREAS as readonly string[]).includes(value)) {
      throw new NotFoundException(
        "The selected system settings area was not found.",
      );
    }
    const area = value as SystemSettingArea;
    const settings = await this.settings(area);
    return {
      area,
      ...AREA_METADATA[area],
      status: aggregateStatus(settings),
      settings,
    };
  }

  private async settings(
    area: SystemSettingArea,
  ): Promise<SystemSettingStatus[]> {
    if (area === "overview") return this.overview();
    if (area === "hosting-network") return this.hostingNetwork();
    if (area === "access-security") return this.accessSecurity();
    if (area === "plugins") {
      return [
        disabled(
          "plugin-runtime",
          "Plugin runtime",
          "Plugin installation is not enabled in this release.",
        ),
      ];
    }
    if (area === "integrations-api") {
      return [
        disabled(
          "api-clients",
          "API clients and webhooks",
          "Scoped API clients and webhook delivery are not enabled in this release.",
        ),
      ];
    }
    if (area === "ai") return this.ai();
    if (area === "communications") return this.communications();
    if (area === "data-storage") return this.dataStorage();
    if (area === "backup-recovery") {
      return [
        attention(
          "backup-policy",
          "Backup policy",
          "No application-managed backup schedule or verified restore drill is configured.",
        ),
      ];
    }
    if (area === "operations") {
      return [
        ready(
          "request-logging",
          "Request diagnostics",
          "Structured request completion and failure logging are enabled.",
          "observed",
        ),
        attention(
          "background-work",
          "Background work",
          "Queue, retry, and dead-letter administration are not yet surfaced.",
        ),
      ];
    }
    if (area === "privacy-governance") {
      return [
        attention(
          "retention-policy",
          "Retention policy",
          "Participant, AI, audit, Session, and media retention policies are not yet configurable.",
        ),
      ];
    }
    return [
      ready(
        "application-version",
        "Application version",
        "Version is supplied by the deployment.",
        "deployment-managed",
        this.config.get<string>("AOW_VERSION", "Development build"),
      ),
      attention(
        "update-workflow",
        "Update workflow",
        "Compatibility preflight and coordinated rollback are not yet application-managed.",
      ),
    ];
  }

  private async overview(): Promise<SystemSettingStatus[]> {
    let databaseReady = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseReady = false;
    }
    return [
      await this.installationName(),
      databaseReady
        ? ready("database", "Database", "PostgreSQL is reachable.", "observed")
        : unavailable("database", "Database", "PostgreSQL is unavailable."),
      ready(
        "administrator",
        "System Administrator",
        "First-launch administration is complete.",
        "observed",
      ),
      this.configured(
        "public-web-url",
        "Public web address",
        "PUBLIC_WEB_URL",
        true,
      ),
      this.configured(
        "contact-encryption",
        "Contact-data encryption",
        "CONTACT_ENCRYPTION_KEY",
        true,
        "secret-backed",
      ),
    ];
  }

  private hostingNetwork(): SystemSettingStatus[] {
    return [
      this.configured(
        "public-web-url",
        "Public web address",
        "PUBLIC_WEB_URL",
        true,
      ),
      this.configured("web-origin", "Trusted web origin", "WEB_ORIGIN", true),
      ready(
        "time-zone",
        "Server time zone",
        "Observed from the host process.",
        "observed",
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ),
    ];
  }

  private async accessSecurity(): Promise<SystemSettingStatus[]> {
    const administratorCount = await this.prisma.systemAdministrator.count({
      where: { status: "ACTIVE" },
    });
    return [
      administratorCount === 1
        ? ready(
            "administrator",
            "System Administrator",
            "Exactly one active installation administrator is configured.",
            "observed",
          )
        : unavailable(
            "administrator",
            "System Administrator",
            "The installation administrator invariant is not satisfied.",
          ),
      this.configured(
        "bootstrap",
        "Emergency bootstrap credential",
        "GM_BOOTSTRAP_TOKEN",
        true,
        "secret-backed",
      ),
      this.configured(
        "contact-encryption",
        "Contact-data encryption",
        "CONTACT_ENCRYPTION_KEY",
        true,
        "secret-backed",
      ),
      this.auth0(),
    ];
  }

  private async ai(): Promise<SystemSettingStatus[]> {
    const [openai, model] = await Promise.all([
      this.hosted.control("openai"),
      this.hosted.control("default-model"),
    ]);
    return [
      {
        key: "openai",
        label: "OpenAI provider",
        classification: "secret-backed",
        status:
          openai.validationStatus === "invalid"
            ? "unavailable"
            : openai.configured
              ? "ready"
              : "disabled",
        detail:
          openai.validationStatus === "invalid"
            ? "The latest connection test failed. Replace or retest the credential."
            : openai.configured
              ? "A protected credential is available. Its value is never returned."
              : "OpenAI generation is disabled until a credential is supplied.",
        valueLabel: openai.configured ? "Configured" : undefined,
        source: openai.source,
        control: openai.control,
      },
      {
        key: "default-model",
        label: "Default AI model",
        classification: "application-managed",
        status: "ready",
        detail: "Applied immediately to subsequent AI generation requests.",
        valueLabel: String(model.control.value),
        source: model.source,
        control: model.control,
      },
      attention(
        "ai-governance",
        "Budgets and retention",
        "AI budgets, quotas, and history retention are not yet configurable.",
      ),
    ];
  }

  private auth0(): SystemSettingStatus {
    const keys = [
      "AUTH0_DOMAIN",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
      "AUTH0_CALLBACK_URL",
    ];
    const configured = keys.filter((key) =>
      Boolean(this.config.get<string>(key)?.trim()),
    ).length;
    if (configured === keys.length) {
      return ready(
        "auth0",
        "Auth0",
        "Authorization Code with PKCE sign-in and explicit account linking are enabled.",
        "secret-backed",
        "Configured",
      );
    }
    if (configured > 0) {
      return unavailable(
        "auth0",
        "Auth0",
        "Auth0 configuration is incomplete; domain, client ID, client secret, and callback URL are all required.",
      );
    }
    return disabled(
      "auth0",
      "Auth0",
      "Auth0 sign-in is not configured. Bootstrap and invitation sessions remain available.",
    );
  }

  private async communications(): Promise<SystemSettingStatus[]> {
    const emailProvider = this.config.get<string>("EMAIL_PROVIDER", "capture");
    const smsProvider = this.config.get<string>("SMS_PROVIDER", "capture");
    const invitationLifetime = await this.hosted.control("invitation-lifetime");
    return [
      ready(
        "email-provider",
        "Email provider",
        emailProvider === "capture"
          ? "Messages are captured locally and are not delivered."
          : "An outbound email provider is selected.",
        "deployment-managed",
        humanProvider(emailProvider),
      ),
      ready(
        "sms-provider",
        "SMS provider",
        smsProvider === "capture"
          ? "Messages are captured locally and are not delivered."
          : "An outbound SMS provider is selected.",
        "deployment-managed",
        humanProvider(smsProvider),
      ),
      {
        key: "invitation-lifetime",
        label: "Invitation lifetime",
        classification: "application-managed",
        status: "ready",
        detail: "Applied immediately to newly issued and reissued invitations.",
        valueLabel: `${invitationLifetime.control.value} hours`,
        source: invitationLifetime.source,
        control: invitationLifetime.control,
      },
    ];
  }

  private async dataStorage(): Promise<SystemSettingStatus[]> {
    const [domainRecords, graphEntries, mediaAssets] = await Promise.all([
      this.prisma.domainRecord.count(),
      this.prisma.graphEntry.count(),
      this.prisma.mediaAsset.count(),
    ]);
    return [
      ready("database", "Database", "PostgreSQL is reachable.", "observed"),
      this.configured("object-storage", "Object storage", "S3_BUCKET", true),
      ready(
        "media-inventory",
        "Media inventory",
        "Stored media metadata visible to the application.",
        "observed",
        `${mediaAssets} assets`,
      ),
      graphEntries > 0 || domainRecords === 0
        ? ready(
            "graph-index",
            "Graph projection",
            "Graph projection entries are present or there are no generic records to project.",
            "observed",
            `${graphEntries} entries`,
          )
        : attention(
            "graph-index",
            "Graph projection",
            "Domain records exist but the graph projection is empty.",
          ),
    ];
  }

  private configured(
    key: string,
    label: string,
    environmentKey: string,
    required: boolean,
    classification: SystemSettingStatus["classification"] = "deployment-managed",
  ): SystemSettingStatus {
    const configured = Boolean(this.config.get<string>(environmentKey)?.trim());
    if (configured)
      return ready(
        key,
        label,
        "Configured by the deployment.",
        classification,
        "Configured",
      );
    return required
      ? unavailable(
          key,
          label,
          "Required deployment configuration is missing.",
          classification,
        )
      : disabled(
          key,
          label,
          "Optional capability is not configured.",
          classification,
        );
  }

  async updateValue(
    area: string,
    key: string,
    dto: UpdateSystemSettingDto,
    actorUserId: string,
  ) {
    await this.hosted.setValue(
      area,
      key,
      dto.value,
      dto.expectedRevision,
      actorUserId,
      dto.reason,
    );
    return { setting: await this.setting(area, key) };
  }

  async replaceSecret(
    area: string,
    key: string,
    dto: ReplaceSystemSecretDto,
    actorUserId: string,
  ) {
    await this.hosted.replaceSecret(
      area,
      key,
      dto.secret,
      dto.expectedRevision,
      actorUserId,
      dto.reason,
    );
    return { setting: await this.setting(area, key) };
  }

  async revokeSecret(
    area: string,
    key: string,
    dto: SystemSettingActionDto,
    actorUserId: string,
  ) {
    await this.hosted.revokeSecret(
      area,
      key,
      dto.expectedRevision,
      actorUserId,
      dto.reason,
    );
    return { setting: await this.setting(area, key) };
  }

  async reset(
    area: string,
    key: string,
    dto: SystemSettingActionDto,
    actorUserId: string,
  ) {
    await this.hosted.reset(
      area,
      key,
      dto.expectedRevision,
      actorUserId,
      dto.reason,
    );
    return { setting: await this.setting(area, key) };
  }

  async test(
    area: string,
    key: string,
    dto: SystemSettingActionDto,
    actorUserId: string,
  ) {
    await this.hosted.test(
      area,
      key,
      dto.expectedRevision,
      actorUserId,
      dto.reason,
    );
    return { setting: await this.setting(area, key) };
  }

  history(area: string, key: string) {
    return this.hosted.history(area, key);
  }

  private async setting(area: string, key: string) {
    this.hosted.definition(area, key);
    const projection = await this.area(area);
    const setting = projection.settings.find(
      (candidate) => candidate.key === key,
    );
    if (!setting) {
      throw new NotFoundException("The selected system setting was not found.");
    }
    return setting;
  }

  private async installationName(): Promise<SystemSettingStatus> {
    const state = await this.hosted.control("installation-name");
    return {
      key: "installation-name",
      label: "Installation name",
      classification: "application-managed",
      status: "ready",
      detail:
        "Displayed in hosted-system administration and applied immediately.",
      valueLabel: String(state.control.value),
      source: state.source,
      control: state.control,
    };
  }
}

function aggregateStatus(
  settings: readonly SystemSettingStatus[],
): SystemSettingStatus["status"] {
  if (settings.some(({ status }) => status === "unavailable"))
    return "unavailable";
  if (settings.some(({ status }) => status === "attention")) return "attention";
  if (settings.every(({ status }) => status === "disabled")) return "disabled";
  return "ready";
}

function ready(
  key: string,
  label: string,
  detail: string,
  classification: SystemSettingStatus["classification"] = "observed",
  valueLabel?: string,
): SystemSettingStatus {
  return { key, label, detail, classification, status: "ready", valueLabel };
}

function attention(
  key: string,
  label: string,
  detail: string,
): SystemSettingStatus {
  return {
    key,
    label,
    detail,
    classification: "application-managed",
    status: "attention",
  };
}

function disabled(
  key: string,
  label: string,
  detail: string,
  classification: SystemSettingStatus["classification"] = "application-managed",
): SystemSettingStatus {
  return { key, label, detail, classification, status: "disabled" };
}

function unavailable(
  key: string,
  label: string,
  detail: string,
  classification: SystemSettingStatus["classification"] = "observed",
): SystemSettingStatus {
  return { key, label, detail, classification, status: "unavailable" };
}

function humanProvider(value: string): string {
  if (value === "capture") return "Capture mode";
  if (value === "resend") return "Resend";
  if (value === "twilio") return "Twilio";
  return "Configured provider";
}
