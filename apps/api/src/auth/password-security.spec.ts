import { hashPassword, verifyPassword } from "./password-security";

describe("password security", () => {
  it("uses unique salts and verifies only the correct password", async () => {
    const first = await hashPassword("a long unique password");
    const second = await hashPassword("a long unique password");
    expect(first).not.toBe(second);
    expect(first).not.toContain("a long unique password");
    await expect(verifyPassword("a long unique password", first)).resolves.toBe(
      true,
    );
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it("safely rejects unknown accounts and malformed hashes", async () => {
    await expect(verifyPassword("password")).resolves.toBe(false);
    await expect(
      verifyPassword("password", "scrypt-v1:bad:hash"),
    ).resolves.toBe(false);
  });
});
