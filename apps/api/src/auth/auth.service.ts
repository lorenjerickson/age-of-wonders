import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ContactProtector } from "../invitations/invitation-security";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./auth.types";

export interface EstablishAdministratorInput {
  displayName: string;
  email: string;
  phone: string;
  grantGameMaster: boolean;
}

@Injectable()
export class AuthService {
  private readonly bootstrapFailures = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly contacts: ContactProtector,
  ) {}

  bootstrapToken(): string {
    const configured = this.config.get<string>("GM_BOOTSTRAP_TOKEN");
    if (configured?.trim()) return configured.trim();
    if (this.config.get<string>("NODE_ENV", "development") === "production") {
      throw new Error("GM_BOOTSTRAP_TOKEN is required in production.");
    }
    return "development-gm-session-change-me";
  }

  async authenticate(token: string | undefined): Promise<AuthenticatedUser> {
    if (!token) throw new UnauthorizedException("Authentication is required.");
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException("Authentication is invalid or expired.");
    }
    return {
      id: session.user.id,
      displayName: session.user.displayName,
      role: session.user.role,
    };
  }

  async authenticateBootstrap(
    token: string,
    attemptKey = "unknown",
  ): Promise<AuthenticatedUser> {
    this.verifyBootstrapCredential(token, attemptKey);
    const administrator = await this.prisma.systemAdministrator.findFirst({
      where: { status: "ACTIVE" },
      include: { user: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!administrator) {
      throw new UnauthorizedException(
        "Active installation administration is required before sign in.",
      );
    }
    return {
      id: administrator.user.id,
      displayName: administrator.user.displayName,
      role: administrator.user.role,
    };
  }

  async bootstrapStatus() {
    return {
      setupRequired:
        (await this.prisma.systemAdministrator.count({
          where: {},
        })) === 0,
    };
  }

  async establishFirstAdministrator(
    token: string,
    input: EstablishAdministratorInput,
    attemptKey = "unknown",
  ): Promise<AuthenticatedUser> {
    this.verifyBootstrapCredential(token, attemptKey);
    const email = this.contacts.protectEmail(input.email);
    const phone = this.contacts.protectPhone(input.phone);
    const providerSubject = this.contacts.protectOpaque(
      randomBytes(32).toString("base64url"),
    );
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new UnauthorizedException("Administrator name is required.");
    }
    const administrator = await this.prisma
      .$transaction(
        async (tx) => {
          if ((await tx.systemAdministrator.count()) !== 0) {
            throw new HttpException(
              "First-launch administration is already complete.",
              HttpStatus.CONFLICT,
            );
          }
          const existingGms = await tx.user.findMany({
            where: { role: UserRole.GM },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 2,
          });
          if (existingGms.length > 1) {
            throw new HttpException(
              "Multiple legacy Game Masters require an explicit administrator migration.",
              HttpStatus.CONFLICT,
            );
          }
          const existingGm = existingGms[0];
          const user = existingGm
            ? await tx.user.update({
                where: { id: existingGm.id },
                data: { displayName },
              })
            : await tx.user.create({
                data: {
                  displayName,
                  role: input.grantGameMaster
                    ? UserRole.GM
                    : UserRole.PARTICIPANT,
                },
              });
          const profile = await tx.playerProfile.findUnique({
            where: { userId: user.id },
            select: { id: true },
          });
          await tx.authenticationProviderAssociation.create({
            data: {
              userId: user.id,
              playerProfileId: profile?.id,
              providerKey: "aow:bootstrap",
              providerSubjectHash: providerSubject.hash,
              providerSubjectEncrypted: providerSubject.encrypted,
              status: "ASSOCIATED",
              associatedAt: new Date(),
            },
          });
          const record = await tx.systemAdministrator.create({
            data: {
              userId: user.id,
              displayName,
              emailEncrypted: email.encrypted,
              emailHash: email.hash,
              phoneEncrypted: phone.encrypted,
              phoneHash: phone.hash,
            },
          });
          return { record, user };
        },
        { isolationLevel: "Serializable" },
      )
      .catch((error: unknown) => {
        if (isPrismaCode(error, "P2002") || isPrismaCode(error, "P2034")) {
          throw new HttpException(
            "First-launch administration is already complete.",
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });
    return {
      id: administrator.user.id,
      displayName: administrator.user.displayName,
      role: administrator.user.role,
    };
  }

  private verifyBootstrapCredential(token: string, attemptKey: string): void {
    const now = Date.now();
    const prior = this.bootstrapFailures.get(attemptKey);
    if (
      prior &&
      now - prior.windowStartedAt < 15 * 60 * 1000 &&
      prior.count >= 5
    ) {
      throw new HttpException(
        "Too many sign-in attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const actual = Buffer.from(this.hash(token), "hex");
    const expected = Buffer.from(this.hash(this.bootstrapToken()), "hex");
    if (!timingSafeEqual(actual, expected)) {
      this.bootstrapFailures.set(attemptKey, {
        count:
          prior && now - prior.windowStartedAt < 15 * 60 * 1000
            ? prior.count + 1
            : 1,
        windowStartedAt:
          prior && now - prior.windowStartedAt < 15 * 60 * 1000
            ? prior.windowStartedAt
            : now,
      });
      throw new UnauthorizedException("Bootstrap credentials are invalid.");
    }
    this.bootstrapFailures.delete(attemptKey);
  }

  async publicUser(user: AuthenticatedUser) {
    if (user.role === UserRole.GM) {
      return { displayName: user.displayName, role: "gm" as const };
    }
    const administrator = await this.prisma.systemAdministrator.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (administrator?.status === "ACTIVE") {
      return { displayName: user.displayName, role: "administrator" as const };
    }
    const membership =
      await this.prisma.campaignInstanceHumanMembership.findFirst({
        where: {
          userId: user.id,
          status: "ACTIVE",
          role: { in: ["PLAYER", "SPECTATOR"] },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: { role: true },
      });
    return {
      displayName: user.displayName,
      role: membership?.role === "SPECTATOR" ? "spectator" : "player",
    } as const;
  }

  async issueParticipantSession(userId: string): Promise<string> {
    return this.issueSession(userId);
  }

  async issueSession(userId: string): Promise<string> {
    const prepared = this.prepareSession(userId);
    await this.prisma.authSession.create({
      data: prepared.data,
    });
    return prepared.token;
  }

  prepareSession(userId: string): {
    token: string;
    data: { userId: string; tokenHash: string; expiresAt: Date };
  } {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
