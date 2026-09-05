import { ConfigService } from "@nestjs/config";
import {
  ContactProtector,
  InvitationTokenService,
} from "./invitation-security";

describe("InvitationTokenService", () => {
  it("persists only a one-way digest and verifies the original token", () => {
    const service = new InvitationTokenService();
    const issued = service.issue();

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(issued.token).not.toBe(issued.tokenHash);
    expect(service.hash(issued.token)).toBe(issued.tokenHash);
    expect(service.matches(issued.token, issued.tokenHash)).toBe(true);
    expect(service.matches(`${issued.token}x`, issued.tokenHash)).toBe(false);
  });
});

describe("ContactProtector", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const service = new ContactProtector(
    new ConfigService({ CONTACT_ENCRYPTION_KEY: key }),
  );

  it("normalizes, encrypts, and hashes email without retaining plaintext", () => {
    const protectedValue = service.protectEmail(" Player@Example.COM ");

    expect(protectedValue.normalized).toBe("player@example.com");
    expect(protectedValue.encrypted).not.toContain("player@example.com");
    expect(service.decrypt(protectedValue.encrypted)).toBe(
      "player@example.com",
    );
  });

  it("normalizes phone numbers to E.164 and rejects ambiguous local numbers", () => {
    expect(service.protectPhone("+1 (415) 555-0100").normalized).toBe(
      "+14155550100",
    );
    expect(() => service.protectPhone("415-555-0100")).toThrow(
      "international E.164",
    );
  });
});
