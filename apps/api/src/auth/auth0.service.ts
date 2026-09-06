import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { ContactProtector } from "../invitations/invitation-security";
import { PrismaService } from "../prisma/prisma.service";

const FLOW_LIFETIME_MS = 10 * 60 * 1_000;

interface Auth0Configuration {
  issuer: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  providerKey: string;
}

interface Auth0Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

interface AuthorizationTransaction {
  intent: "sign-in" | "link";
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
  userId?: string;
}

interface JwtClaims {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
}

@Injectable()
export class Auth0Service {
  private discoveryCache?: { value: Auth0Discovery; expiresAt: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly protector: ContactProtector,
  ) {}

  status() {
    return { configured: Boolean(this.configuration(false)) };
  }

  async statusFor(userId: string) {
    const configuration = this.configuration(false);
    if (!configuration) return { configured: false, linked: false };
    const association =
      await this.prisma.authenticationProviderAssociation.findUnique({
        where: {
          userId_providerKey: {
            userId,
            providerKey: configuration.providerKey,
          },
        },
        select: { status: true },
      });
    return {
      configured: true,
      linked: association?.status === "ASSOCIATED",
    };
  }

  async begin(
    intent: "sign-in" | "link",
    returnTo: string | undefined,
    userId?: string,
  ) {
    if (intent === "link" && !userId) {
      throw new UnauthorizedException(
        "Authentication is required to link Auth0.",
      );
    }
    const configuration = this.configuration(true);
    const discovery = await this.discovery(configuration);
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const transaction: AuthorizationTransaction = {
      intent,
      state,
      nonce,
      verifier,
      returnTo: this.safeReturnTo(returnTo),
      createdAt: Date.now(),
      ...(userId ? { userId } : {}),
    };
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: configuration.clientId,
      redirect_uri: configuration.callbackUrl,
      scope: "openid profile email",
      code_challenge: createHash("sha256")
        .update(verifier, "utf8")
        .digest("base64url"),
      code_challenge_method: "S256",
      state,
      nonce,
    }).toString();
    return {
      authorizationUrl: authorizationUrl.toString(),
      transactionCookie: this.protector.protectOpaque(
        JSON.stringify(transaction),
      ).encrypted,
    };
  }

  async complete(
    encryptedTransaction: string | undefined,
    code: string | undefined,
    state: string | undefined,
    currentUserId?: string,
  ) {
    const transaction = this.transaction(encryptedTransaction);
    if (!code || !state || !constantEqual(state, transaction.state)) {
      throw new BadRequestException(
        "The Auth0 response is invalid or expired.",
      );
    }
    if (
      transaction.intent === "link" &&
      (!currentUserId || currentUserId !== transaction.userId)
    ) {
      throw new UnauthorizedException(
        "The account-linking session is no longer authenticated.",
      );
    }

    const configuration = this.configuration(true);
    const discovery = await this.discovery(configuration);
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${configuration.clientId}:${configuration.clientSecret}`,
          "utf8",
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: configuration.callbackUrl,
        code_verifier: transaction.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) {
      throw new UnauthorizedException("Auth0 could not complete sign in.");
    }
    const tokens = (await tokenResponse.json()) as { id_token?: unknown };
    if (typeof tokens.id_token !== "string") {
      throw new UnauthorizedException("Auth0 did not return a valid identity.");
    }
    const subject = await this.verifyIdToken(
      tokens.id_token,
      transaction.nonce,
      configuration,
      discovery,
    );
    const protectedSubject = this.protector.protectOpaque(subject);

    const userId =
      transaction.intent === "link"
        ? await this.link(
            transaction.userId!,
            configuration.providerKey,
            protectedSubject,
          )
        : await this.resolve(configuration.providerKey, protectedSubject.hash);
    return { userId, returnTo: transaction.returnTo };
  }

  private async resolve(providerKey: string, subjectHash: string) {
    const association =
      await this.prisma.authenticationProviderAssociation.findUnique({
        where: {
          providerKey_providerSubjectHash: {
            providerKey,
            providerSubjectHash: subjectHash,
          },
        },
        select: { userId: true, status: true },
      });
    if (!association || association.status !== "ASSOCIATED") {
      throw new UnauthorizedException(
        "This Auth0 account is not linked to an Age of Wonders profile.",
      );
    }
    return association.userId;
  }

  private async link(
    userId: string,
    providerKey: string,
    subject: { hash: string; encrypted: string },
  ) {
    const [subjectAssociation, userAssociation, profile] = await Promise.all([
      this.prisma.authenticationProviderAssociation.findUnique({
        where: {
          providerKey_providerSubjectHash: {
            providerKey,
            providerSubjectHash: subject.hash,
          },
        },
        select: { userId: true },
      }),
      this.prisma.authenticationProviderAssociation.findUnique({
        where: { userId_providerKey: { userId, providerKey } },
        select: { id: true, providerSubjectHash: true },
      }),
      this.prisma.playerProfile.findUnique({
        where: { userId },
        select: { id: true },
      }),
    ]);
    if (subjectAssociation && subjectAssociation.userId !== userId) {
      throw new ConflictException(
        "This Auth0 account is already linked to another profile.",
      );
    }
    if (
      userAssociation &&
      userAssociation.providerSubjectHash !== subject.hash
    ) {
      throw new ConflictException(
        "This profile is already linked to a different Auth0 account.",
      );
    }
    await this.prisma.authenticationProviderAssociation
      .upsert({
        where: { userId_providerKey: { userId, providerKey } },
        create: {
          userId,
          playerProfileId: profile?.id,
          providerKey,
          providerSubjectHash: subject.hash,
          providerSubjectEncrypted: subject.encrypted,
          status: "ASSOCIATED",
          associatedAt: new Date(),
        },
        update: {
          playerProfileId: profile?.id,
          providerSubjectEncrypted: subject.encrypted,
          status: "ASSOCIATED",
          associatedAt: new Date(),
          disabledAt: null,
        },
      })
      .catch((error: unknown) => {
        if (isPrismaCode(error, "P2002")) {
          throw new ConflictException(
            "This Auth0 account or profile was linked concurrently.",
          );
        }
        throw error;
      });
    return userId;
  }

  private transaction(encrypted: string | undefined): AuthorizationTransaction {
    if (!encrypted) {
      throw new BadRequestException("The Auth0 sign-in session has expired.");
    }
    let value: unknown;
    try {
      value = JSON.parse(this.protector.decrypt(encrypted));
    } catch {
      throw new BadRequestException("The Auth0 sign-in session is invalid.");
    }
    if (!isAuthorizationTransaction(value)) {
      throw new BadRequestException("The Auth0 sign-in session is invalid.");
    }
    if (
      value.createdAt > Date.now() + 60_000 ||
      value.createdAt + FLOW_LIFETIME_MS < Date.now()
    ) {
      throw new BadRequestException("The Auth0 sign-in session has expired.");
    }
    return value;
  }

  private configuration(required: false): Auth0Configuration | undefined;
  private configuration(required: true): Auth0Configuration;
  private configuration(required: boolean): Auth0Configuration | undefined {
    const domain = this.config.get<string>("AUTH0_DOMAIN")?.trim();
    const clientId = this.config.get<string>("AUTH0_CLIENT_ID")?.trim();
    const clientSecret = this.config.get<string>("AUTH0_CLIENT_SECRET")?.trim();
    const callbackUrl = this.config.get<string>("AUTH0_CALLBACK_URL")?.trim();
    const values = [domain, clientId, clientSecret, callbackUrl];
    if (values.every((value) => !value)) {
      if (required) {
        throw new ServiceUnavailableException("Auth0 is not configured.");
      }
      return undefined;
    }
    if (values.some((value) => !value)) {
      if (required) {
        throw new ServiceUnavailableException(
          "Auth0 configuration is incomplete.",
        );
      }
      return undefined;
    }
    let issuer: string;
    let callback: URL;
    try {
      issuer = normalizeIssuer(domain!);
      callback = new URL(callbackUrl!);
      if (callback.protocol !== "https:" && callback.hostname !== "localhost") {
        throw new Error("insecure callback");
      }
    } catch {
      if (required) {
        throw new ServiceUnavailableException(
          "Auth0 configuration is invalid.",
        );
      }
      return undefined;
    }
    return {
      issuer,
      clientId: clientId!,
      clientSecret: clientSecret!,
      callbackUrl: callback.toString(),
      providerKey: `auth0:${new URL(issuer).hostname.toLowerCase()}`,
    };
  }

  private async discovery(configuration: Auth0Configuration) {
    if (this.discoveryCache && this.discoveryCache.expiresAt > Date.now()) {
      return this.discoveryCache.value;
    }
    const response = await fetch(
      new URL(".well-known/openid-configuration", configuration.issuer),
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException("Auth0 discovery is unavailable.");
    }
    const value = (await response.json()) as Partial<Auth0Discovery>;
    if (
      value.issuer !== configuration.issuer ||
      !isIssuerUrl(value.authorization_endpoint, configuration.issuer) ||
      !isIssuerUrl(value.token_endpoint, configuration.issuer) ||
      !isIssuerUrl(value.jwks_uri, configuration.issuer)
    ) {
      throw new ServiceUnavailableException("Auth0 discovery is invalid.");
    }
    const discovery = value as Auth0Discovery;
    this.discoveryCache = {
      value: discovery,
      expiresAt: Date.now() + 60 * 60 * 1_000,
    };
    return discovery;
  }

  private async verifyIdToken(
    token: string,
    nonce: string,
    configuration: Auth0Configuration,
    discovery: Auth0Discovery,
  ): Promise<string> {
    if (token.length > 20_000) {
      throw new UnauthorizedException("Auth0 identity is invalid.");
    }
    const parts = token.split(".");
    if (parts.length !== 3)
      throw new UnauthorizedException("Auth0 identity is invalid.");
    const parsedHeader = parsePart(parts[0]);
    const parsedClaims = parsePart(parts[1]);
    if (!isRecord(parsedHeader) || !isRecord(parsedClaims)) {
      throw new UnauthorizedException("Auth0 identity is invalid.");
    }
    const header = parsedHeader as { alg?: unknown; kid?: unknown };
    const claims = parsedClaims as JwtClaims;
    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      throw new UnauthorizedException("Auth0 identity is invalid.");
    }
    const jwksResponse = await fetch(discovery.jwks_uri, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!jwksResponse.ok) {
      throw new ServiceUnavailableException(
        "Auth0 signing keys are unavailable.",
      );
    }
    const jwks = (await jwksResponse.json()) as {
      keys?: Array<Record<string, unknown>>;
    };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid);
    if (
      !jwk ||
      jwk.kty !== "RSA" ||
      (jwk.use !== undefined && jwk.use !== "sig") ||
      (jwk.alg !== undefined && jwk.alg !== "RS256")
    ) {
      throw new UnauthorizedException("Auth0 identity is invalid.");
    }
    let validSignature = false;
    try {
      validSignature = verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`, "ascii"),
        createPublicKey({ key: jwk, format: "jwk" }),
        Buffer.from(parts[2], "base64url"),
      );
    } catch {
      validSignature = false;
    }
    const now = Math.floor(Date.now() / 1_000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !validSignature ||
      claims.iss !== configuration.issuer ||
      !audiences.includes(configuration.clientId) ||
      typeof claims.exp !== "number" ||
      claims.exp <= now - 60 ||
      typeof claims.iat !== "number" ||
      claims.iat > now + 60 ||
      typeof claims.nonce !== "string" ||
      !constantEqual(claims.nonce, nonce) ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.sub.length > 1_000 ||
      (audiences.length > 1 && claims.azp !== configuration.clientId)
    ) {
      throw new UnauthorizedException("Auth0 identity is invalid.");
    }
    return claims.sub;
  }

  private safeReturnTo(value: string | undefined) {
    const candidate = value?.trim() || "/";
    if (
      !candidate.startsWith("/") ||
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      [...candidate].some((character) => character.charCodeAt(0) < 32)
    ) {
      return "/";
    }
    return candidate;
  }
}

function normalizeIssuer(domain: string) {
  const candidate = domain.includes("://") ? domain : `https://${domain}`;
  const url = new URL(candidate);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("AUTH0_DOMAIN must be an HTTPS origin without a path.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isIssuerUrl(value: unknown, issuer: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const endpoint = new URL(value);
    return (
      endpoint.protocol === "https:" &&
      endpoint.origin === new URL(issuer).origin
    );
  } catch {
    return false;
  }
}

function parsePart(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new UnauthorizedException("Auth0 identity is invalid.");
  }
}

function constantEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return leftHash.equals(rightHash);
}

function isAuthorizationTransaction(
  value: unknown,
): value is AuthorizationTransaction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthorizationTransaction>;
  return (
    (candidate.intent === "sign-in" || candidate.intent === "link") &&
    typeof candidate.state === "string" &&
    candidate.state.length >= 32 &&
    typeof candidate.nonce === "string" &&
    candidate.nonce.length >= 32 &&
    typeof candidate.verifier === "string" &&
    candidate.verifier.length >= 43 &&
    typeof candidate.returnTo === "string" &&
    typeof candidate.createdAt === "number" &&
    (candidate.intent === "sign-in" || typeof candidate.userId === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
