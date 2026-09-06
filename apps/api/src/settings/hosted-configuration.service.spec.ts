import { ConfigService } from "@nestjs/config";
import { ConflictException } from "@nestjs/common";
import { ContactProtector } from "../invitations/invitation-security";
import { HostedConfigurationService } from "./hosted-configuration.service";

function protector() {
  return new ContactProtector(
    new ConfigService({
      CONTACT_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    }),
  );
}

describe("HostedConfigurationService", () => {
  it("uses a protected application secret without returning it in controls", async () => {
    const contacts = protector();
    const protectedSecret = contacts.protectOpaque("sk-private-value");
    const prisma = {
      configurationBinding: {
        findUnique: jest.fn().mockResolvedValue({
          kind: "SECRET",
          secretEncrypted: protectedSecret.encrypted,
          version: 4,
          validationStatus: "VALID",
        }),
      },
    };
    const service = new HostedConfigurationService(
      prisma as never,
      new ConfigService({ OPENAI_API_KEY: "deployment-value" }),
      contacts,
    );

    await expect(service.openAiApiKey()).resolves.toBe("sk-private-value");
    const control = await service.control("openai");
    expect(control).toMatchObject({
      configured: true,
      source: "application",
      validationStatus: "valid",
      control: { kind: "secret", expectedRevision: 4 },
    });
    expect(JSON.stringify(control)).not.toContain("sk-private-value");
    expect(JSON.stringify(control)).not.toContain(protectedSecret.encrypted);
  });

  it("encrypts replacement secrets and writes value-free audit history", async () => {
    const tx = {
      configurationBinding: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "binding-1" }),
      },
      configurationRevision: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      configurationBinding: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const service = new HostedConfigurationService(
      prisma as never,
      new ConfigService({}),
      protector(),
    );

    await service.replaceSecret(
      "ai",
      "openai",
      "sk-private-value",
      0,
      "operator-1",
      "Initial provider setup",
    );

    const persistence = JSON.stringify({
      binding: tx.configurationBinding.create.mock.calls,
      audit: tx.configurationRevision.create.mock.calls,
    });
    expect(persistence).not.toContain("sk-private-value");
    expect(tx.configurationBinding.create).toHaveBeenCalledWith({
      // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        definitionKey: "openai",
        kind: "SECRET",
        secretEncrypted: expect.any(String) as string,
        version: 1,
      }),
    });
    expect(tx.configurationRevision.create).toHaveBeenCalledWith({
      data: {
        configurationBindingId: "binding-1",
        configurationVersion: 1,
        action: "SECRET_REPLACED",
        reason: "Initial provider setup",
        actorUserId: "operator-1",
      },
    });
  });

  it("treats explicit revocation as stronger than a deployment fallback", async () => {
    const prisma = {
      configurationBinding: {
        findUnique: jest.fn().mockResolvedValue({
          kind: "DISABLED",
          version: 2,
          validationStatus: "UNTESTED",
        }),
      },
    };
    const service = new HostedConfigurationService(
      prisma as never,
      new ConfigService({ OPENAI_API_KEY: "deployment-value" }),
      protector(),
    );

    await expect(service.openAiApiKey()).resolves.toBeUndefined();
    await expect(service.control("openai")).resolves.toMatchObject({
      configured: false,
      source: "disabled",
      control: { expectedRevision: 2 },
    });
  });

  it("rejects a stale connection test before contacting the provider", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    const prisma = {
      configurationBinding: {
        findUnique: jest.fn().mockResolvedValue({ version: 3 }),
      },
    };
    const service = new HostedConfigurationService(
      prisma as never,
      new ConfigService({ OPENAI_API_KEY: "deployment-value" }),
      protector(),
    );

    await expect(
      service.test("ai", "openai", 2, "operator-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
