import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import { SystemSettingsService } from "./system-settings.service";

function harness() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
    systemAdministrator: { count: jest.fn().mockResolvedValue(1) },
    domainRecord: { count: jest.fn().mockResolvedValue(2) },
    graphEntry: { count: jest.fn().mockResolvedValue(12) },
    mediaAsset: { count: jest.fn().mockResolvedValue(3) },
  };
  const config = new ConfigService({
    AOW_INSTALLATION_NAME: "Glasswake Table",
    PUBLIC_WEB_URL: "https://table.example.test",
    WEB_ORIGIN: "https://table.example.test",
    CONTACT_ENCRYPTION_KEY: "configured-secret",
    GM_BOOTSTRAP_TOKEN: "configured-bootstrap",
    S3_BUCKET: "table-media",
    EMAIL_PROVIDER: "capture",
    SMS_PROVIDER: "capture",
  });
  return {
    prisma,
    service: new SystemSettingsService(prisma as never, config),
  };
}

describe("SystemSettingsService", () => {
  it("returns the complete hosted-system taxonomy without secret values", async () => {
    const { service } = harness();
    const result = await service.index();

    expect(result.installationName).toBe("Glasswake Table");
    expect(result.areas).toHaveLength(12);
    expect(result.areas.map(({ area }) => area)).toContain("access-security");
    expect(JSON.stringify(result)).not.toContain("configured-secret");
    expect(JSON.stringify(result)).not.toContain("configured-bootstrap");
  });

  it("classifies observed graph and media status under data and storage", async () => {
    const { service } = harness();
    const result = await service.area("data-storage");

    expect(result.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "graph-index", status: "ready" }),
        expect.objectContaining({
          key: "media-inventory",
          valueLabel: "3 assets",
        }),
      ]),
    );
  });

  it("uses a neutral miss for an unsupported settings area", async () => {
    const { service } = harness();
    await expect(service.area("worlds")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
