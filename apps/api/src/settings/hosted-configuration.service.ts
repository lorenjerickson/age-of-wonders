import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConfigurationBindingKind,
  ConfigurationRevisionAction,
  ConfigurationValidationStatus,
  Prisma,
} from "@prisma/client";
import type {
  ConfigurationHistoryProjection,
  SystemSettingArea,
  SystemSettingControl,
  SystemSettingSource,
} from "@aow/common";
import { ContactProtector } from "../invitations/invitation-security";
import { PrismaService } from "../prisma/prisma.service";

type DefinitionKey =
  "installation-name" | "invitation-lifetime" | "default-model" | "openai";

interface ConfigurationDefinition {
  key: DefinitionKey;
  area: SystemSettingArea;
  label: string;
  kind: "text" | "number" | "secret";
  environmentKey: string;
  defaultValue?: string | number;
  minimum?: number;
  maximum?: number;
  maximumLength?: number;
  canDisable: boolean;
  canTest: boolean;
}

const DEFINITIONS: Record<DefinitionKey, ConfigurationDefinition> = {
  "installation-name": {
    key: "installation-name",
    area: "overview",
    label: "Installation name",
    kind: "text",
    environmentKey: "AOW_INSTALLATION_NAME",
    defaultValue: "Age of Wonders",
    maximumLength: 120,
    canDisable: false,
    canTest: false,
  },
  "invitation-lifetime": {
    key: "invitation-lifetime",
    area: "communications",
    label: "Invitation lifetime",
    kind: "number",
    environmentKey: "INVITATION_TTL_HOURS",
    defaultValue: 168,
    minimum: 1,
    maximum: 2_160,
    canDisable: false,
    canTest: false,
  },
  "default-model": {
    key: "default-model",
    area: "ai",
    label: "Default AI model",
    kind: "text",
    environmentKey: "OPENAI_MODEL",
    defaultValue: "gpt-5.6-terra",
    maximumLength: 120,
    canDisable: false,
    canTest: false,
  },
  openai: {
    key: "openai",
    area: "ai",
    label: "OpenAI provider",
    kind: "secret",
    environmentKey: "OPENAI_API_KEY",
    maximumLength: 1_000,
    canDisable: true,
    canTest: true,
  },
};

@Injectable()
export class HostedConfigurationService {
  private readonly lastConnectionTestByActor = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly protector: ContactProtector,
  ) {}

  definitionsFor(area: SystemSettingArea) {
    return Object.values(DEFINITIONS).filter(
      (definition) => definition.area === area,
    );
  }

  definition(area: string, key: string): ConfigurationDefinition {
    const definition = DEFINITIONS[key as DefinitionKey];
    if (!definition || definition.area !== area) {
      throw new NotFoundException("The selected system setting was not found.");
    }
    return definition;
  }

  async installationName(): Promise<string> {
    const value = await this.effectiveValue(DEFINITIONS["installation-name"]);
    if (typeof value !== "string")
      throw new Error("Installation name is invalid.");
    return value;
  }

  async invitationLifetimeHours(): Promise<number> {
    const value = await this.effectiveValue(DEFINITIONS["invitation-lifetime"]);
    if (typeof value !== "number")
      throw new Error("Invitation lifetime is invalid.");
    return value;
  }

  async openAiModel(): Promise<string> {
    const value = await this.effectiveValue(DEFINITIONS["default-model"]);
    if (typeof value !== "string")
      throw new Error("Default AI model is invalid.");
    return value;
  }

  openAiImageModel(): string {
    return (
      this.config.get<string>("OPENAI_IMAGE_MODEL")?.trim() ||
      "gpt-image-2.5-flare"
    );
  }

  async openAiApiKey(): Promise<string | undefined> {
    const effective = await this.effective(DEFINITIONS.openai);
    return typeof effective.value === "string" ? effective.value : undefined;
  }

  async control(key: DefinitionKey): Promise<{
    source: SystemSettingSource;
    control: SystemSettingControl;
    validationStatus: "untested" | "valid" | "invalid";
    configured: boolean;
  }> {
    const definition = DEFINITIONS[key];
    const effective = await this.effective(definition);
    return {
      source: effective.source,
      configured: effective.value !== undefined,
      validationStatus: effective.validationStatus,
      control: {
        kind: definition.kind,
        expectedRevision: effective.revision,
        ...(definition.kind !== "secret" && effective.value !== undefined
          ? { value: effective.value as string | number }
          : {}),
        ...(definition.minimum !== undefined
          ? { minimum: definition.minimum }
          : {}),
        ...(definition.maximum !== undefined
          ? { maximum: definition.maximum }
          : {}),
        canReset:
          effective.revision > 0 &&
          (effective.source === "application" ||
            effective.source === "disabled"),
        canDisable: definition.canDisable && effective.value !== undefined,
        canTest: definition.canTest && effective.value !== undefined,
      },
    };
  }

  async setValue(
    area: string,
    key: string,
    value: unknown,
    expectedRevision: number,
    actorUserId: string,
    reason?: string,
  ) {
    const definition = this.definition(area, key);
    if (definition.kind === "secret") {
      throw new BadRequestException(
        "This setting requires secret replacement.",
      );
    }
    const validated = this.validateValue(definition, value);
    await this.change(
      definition,
      expectedRevision,
      actorUserId,
      ConfigurationBindingKind.VALUE,
      ConfigurationRevisionAction.VALUE_SET,
      { value: validated },
      reason,
    );
  }

  async replaceSecret(
    area: string,
    key: string,
    secret: string,
    expectedRevision: number,
    actorUserId: string,
    reason?: string,
  ) {
    const definition = this.definition(area, key);
    if (definition.kind !== "secret") {
      throw new BadRequestException("This setting does not accept a secret.");
    }
    const normalized = secret.trim();
    if (
      normalized.length < 8 ||
      normalized.length > (definition.maximumLength ?? 1_000)
    ) {
      throw new BadRequestException(
        "The replacement secret has an invalid length.",
      );
    }
    const protectedSecret = this.protector.protectOpaque(normalized);
    const prior = await this.prisma.configurationBinding.findUnique({
      where: { definitionKey: definition.key },
      select: { kind: true },
    });
    await this.change(
      definition,
      expectedRevision,
      actorUserId,
      ConfigurationBindingKind.SECRET,
      prior?.kind === ConfigurationBindingKind.SECRET
        ? ConfigurationRevisionAction.SECRET_ROTATED
        : ConfigurationRevisionAction.SECRET_REPLACED,
      {
        secretEncrypted: protectedSecret.encrypted,
      },
      reason,
    );
  }

  async revokeSecret(
    area: string,
    key: string,
    expectedRevision: number,
    actorUserId: string,
    reason?: string,
  ) {
    const definition = this.definition(area, key);
    if (definition.kind !== "secret" || !definition.canDisable) {
      throw new BadRequestException("This setting cannot be disabled.");
    }
    await this.change(
      definition,
      expectedRevision,
      actorUserId,
      ConfigurationBindingKind.DISABLED,
      ConfigurationRevisionAction.SECRET_REVOKED,
      {},
      reason,
    );
  }

  async reset(
    area: string,
    key: string,
    expectedRevision: number,
    actorUserId: string,
    reason?: string,
  ) {
    const definition = this.definition(area, key);
    await this.change(
      definition,
      expectedRevision,
      actorUserId,
      ConfigurationBindingKind.INHERIT,
      ConfigurationRevisionAction.OVERRIDE_RESET,
      {},
      reason,
    );
  }

  async test(
    area: string,
    key: string,
    expectedRevision: number,
    actorUserId: string,
    reason?: string,
  ): Promise<boolean> {
    const definition = this.definition(area, key);
    if (!definition.canTest || definition.key !== "openai") {
      throw new BadRequestException("This setting does not support testing.");
    }
    const binding = await this.prisma.configurationBinding.findUnique({
      where: { definitionKey: definition.key },
      select: { version: true },
    });
    this.assertRevision(binding?.version ?? 0, expectedRevision);
    const now = Date.now();
    const lastTestAt = this.lastConnectionTestByActor.get(actorUserId);
    if (lastTestAt !== undefined && now - lastTestAt < 10_000) {
      throw new HttpException(
        "Wait before testing this connection again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastConnectionTestByActor.set(actorUserId, now);
    const secret = await this.openAiApiKey();
    if (!secret) {
      throw new BadRequestException("OpenAI is not configured.");
    }
    let valid = false;
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10_000),
      });
      valid = response.ok;
    } catch {
      valid = false;
    }
    await this.prisma
      .$transaction(
        async (tx) => {
          const prior = await tx.configurationBinding.findUnique({
            where: { definitionKey: definition.key },
          });
          this.assertRevision(prior?.version ?? 0, expectedRevision);
          const version = prior?.version ?? 1;
          const binding = prior
            ? await tx.configurationBinding.update({
                where: { id: prior.id },
                data: {
                  validationStatus: valid ? "VALID" : "INVALID",
                  validatedAt: new Date(),
                  updatedByUserId: actorUserId,
                },
              })
            : await tx.configurationBinding.create({
                data: {
                  definitionKey: definition.key,
                  kind: "INHERIT",
                  version,
                  validationStatus: valid ? "VALID" : "INVALID",
                  validatedAt: new Date(),
                  updatedByUserId: actorUserId,
                },
              });
          await tx.configurationRevision.create({
            data: {
              configurationBindingId: binding.id,
              configurationVersion: version,
              action: valid ? "VALIDATION_SUCCEEDED" : "VALIDATION_FAILED",
              reason: normalizeReason(reason),
              actorUserId,
            },
          });
        },
        { isolationLevel: "Serializable" },
      )
      .catch(rethrowConfigurationConflict);
    return valid;
  }

  async history(
    area: string,
    key: string,
  ): Promise<ConfigurationHistoryProjection> {
    const definition = this.definition(area, key);
    const binding = await this.prisma.configurationBinding.findUnique({
      where: { definitionKey: definition.key },
      select: {
        revisions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
          include: { actor: { select: { displayName: true } } },
        },
      },
    });
    return {
      settingLabel: definition.label,
      revisions: (binding?.revisions ?? []).map((revision) => ({
        revision: revision.configurationVersion,
        action: revision.action
          .toLowerCase()
          .replaceAll(
            "_",
            "-",
          ) as ConfigurationHistoryProjection["revisions"][number]["action"],
        actorName: revision.actor.displayName || "System administrator",
        ...(revision.reason ? { reason: revision.reason } : {}),
        createdAt: revision.createdAt.toISOString(),
      })),
    };
  }

  private async change(
    definition: ConfigurationDefinition,
    expectedRevision: number,
    actorUserId: string,
    kind: ConfigurationBindingKind,
    action: ConfigurationRevisionAction,
    values: {
      value?: Prisma.InputJsonValue;
      secretEncrypted?: string;
    },
    reason?: string,
  ) {
    await this.prisma
      .$transaction(
        async (tx) => {
          const prior = await tx.configurationBinding.findUnique({
            where: { definitionKey: definition.key },
          });
          this.assertRevision(prior?.version ?? 0, expectedRevision);
          const version = expectedRevision + 1;
          const data = {
            kind,
            value: values.value ?? Prisma.DbNull,
            secretEncrypted: values.secretEncrypted ?? null,
            version,
            validationStatus: ConfigurationValidationStatus.UNTESTED,
            validatedAt: null,
            updatedByUserId: actorUserId,
          };
          const binding = prior
            ? await tx.configurationBinding.update({
                where: { id: prior.id },
                data,
              })
            : await tx.configurationBinding.create({
                data: { definitionKey: definition.key, ...data },
              });
          await tx.configurationRevision.create({
            data: {
              configurationBindingId: binding.id,
              configurationVersion: version,
              action,
              reason: normalizeReason(reason),
              actorUserId,
            },
          });
        },
        { isolationLevel: "Serializable" },
      )
      .catch(rethrowConfigurationConflict);
  }

  private async effectiveValue(definition: ConfigurationDefinition) {
    const effective = await this.effective(definition);
    if (effective.value === undefined) {
      throw new Error(
        `Required configuration '${definition.key}' is unavailable.`,
      );
    }
    return effective.value;
  }

  private async effective(definition: ConfigurationDefinition): Promise<{
    value: unknown;
    source: SystemSettingSource;
    revision: number;
    validationStatus: "untested" | "valid" | "invalid";
  }> {
    const binding = await this.prisma.configurationBinding.findUnique({
      where: { definitionKey: definition.key },
    });
    const validationStatus = binding?.validationStatus.toLowerCase() as
      "untested" | "valid" | "invalid" | undefined;
    if (binding?.kind === "DISABLED") {
      return {
        value: undefined,
        source: "disabled",
        revision: binding.version,
        validationStatus: validationStatus ?? "untested",
      };
    }
    if (binding?.kind === "VALUE") {
      return {
        value: binding.value,
        source: "application",
        revision: binding.version,
        validationStatus: validationStatus ?? "untested",
      };
    }
    if (binding?.kind === "SECRET" && binding.secretEncrypted) {
      return {
        value: this.protector.decrypt(binding.secretEncrypted),
        source: "application",
        revision: binding.version,
        validationStatus: validationStatus ?? "untested",
      };
    }
    const configured = this.config.get<string>(definition.environmentKey);
    if (configured !== undefined && String(configured).trim() !== "") {
      return {
        value: this.validateValue(definition, configured),
        source: "deployment",
        revision: binding?.version ?? 0,
        validationStatus: validationStatus ?? "untested",
      };
    }
    return {
      value: definition.defaultValue,
      source: "default",
      revision: binding?.version ?? 0,
      validationStatus: validationStatus ?? "untested",
    };
  }

  private validateValue(definition: ConfigurationDefinition, value: unknown) {
    if (definition.kind === "number") {
      const parsed = typeof value === "number" ? value : Number(value);
      if (
        !Number.isInteger(parsed) ||
        parsed < (definition.minimum ?? Number.MIN_SAFE_INTEGER) ||
        parsed > (definition.maximum ?? Number.MAX_SAFE_INTEGER)
      ) {
        throw new BadRequestException(
          `${definition.label} must be a whole number from ${definition.minimum} to ${definition.maximum}.`,
        );
      }
      return parsed;
    }
    if (typeof value !== "string") {
      throw new BadRequestException(`${definition.label} must be text.`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > (definition.maximumLength ?? 500)) {
      throw new BadRequestException(
        `${definition.label} has an invalid length.`,
      );
    }
    return normalized;
  }

  private assertRevision(actual: number, expected: number) {
    if (!Number.isInteger(expected) || expected < 0 || actual !== expected) {
      throw new ConflictException(
        "This setting changed after it was loaded. Refresh and try again.",
      );
    }
  }
}

function rethrowConfigurationConflict(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new ConflictException(
      "This setting changed after it was loaded. Refresh and try again.",
    );
  }
  throw error;
}

function normalizeReason(reason: string | undefined) {
  const normalized = reason?.trim();
  return normalized || undefined;
}
