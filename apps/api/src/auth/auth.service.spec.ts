import { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

function service() {
  const prisma = {
    user: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: "gm-1",
          displayName: "Game Master",
          role: UserRole.GM,
        }),
      ),
    },
  } as unknown as PrismaService;
  return new AuthService(
    prisma,
    new ConfigService({ GM_BOOTSTRAP_TOKEN: "correct-bootstrap-token" }),
  );
}

describe("AuthService bootstrap exchange", () => {
  it("accepts the configured credential without persisting it as a session", async () => {
    await expect(
      service().authenticateBootstrap("correct-bootstrap-token", "client-1"),
    ).resolves.toMatchObject({ id: "gm-1", role: UserRole.GM });
  });

  it("rate limits repeated failed exchanges by client", async () => {
    const auth = service();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        auth.authenticateBootstrap("incorrect-bootstrap", "client-1"),
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    }
    await expect(
      auth.authenticateBootstrap("incorrect-bootstrap", "client-1"),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
