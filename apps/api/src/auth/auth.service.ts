import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./auth.types";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly bootstrapFailures = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    void this.bootstrapToken();
    if (!(await this.prisma.user.findFirst({ where: { role: UserRole.GM } }))) {
      await this.prisma.user.create({
        data: {
          displayName: this.config.get<string>(
            "GM_DISPLAY_NAME",
            "Game Master",
          ),
          role: UserRole.GM,
        },
      });
    }
  }

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
    const gm = await this.prisma.user.findFirst({
      where: { role: UserRole.GM },
    });
    if (!gm) throw new UnauthorizedException("Game Master is unavailable.");
    return { id: gm.id, displayName: gm.displayName, role: gm.role };
  }

  async publicUser(user: AuthenticatedUser) {
    if (user.role === UserRole.GM) {
      return { displayName: user.displayName, role: "gm" as const };
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
