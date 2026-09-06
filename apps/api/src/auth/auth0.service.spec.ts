import { ConfigService } from "@nestjs/config";
import { generateKeyPairSync, sign } from "node:crypto";
import { ContactProtector } from "../invitations/invitation-security";
import { PrismaService } from "../prisma/prisma.service";
import { Auth0Service } from "./auth0.service";

const configuration = {
  AUTH0_DOMAIN: "tenant.auth0.com",
  AUTH0_CLIENT_ID: "client-1",
  AUTH0_CLIENT_SECRET: "secret-1",
  AUTH0_CALLBACK_URL: "https://app.example.test/api/auth/auth0/callback",
  CONTACT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

function response(value: unknown, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(value),
  } as unknown as Response;
}

function discovery() {
  return {
    issuer: "https://tenant.auth0.com/",
    authorization_endpoint: "https://tenant.auth0.com/authorize",
    token_endpoint: "https://tenant.auth0.com/oauth/token",
    jwks_uri: "https://tenant.auth0.com/.well-known/jwks.json",
  };
}

function service(prisma: object = {}) {
  const config = new ConfigService(configuration);
  return {
    protector: new ContactProtector(config),
    service: new Auth0Service(
      prisma as PrismaService,
      config,
      new ContactProtector(config),
    ),
  };
}

describe("Auth0Service", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("starts an S256 PKCE flow and rejects external return locations", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(discovery()));
    const { service: auth0, protector } = service();

    const result = await auth0.begin("sign-in", "https://evil.example/");
    const url = new URL(result.authorizationUrl);
    const transaction = JSON.parse(
      protector.decrypt(result.transactionCookie),
    ) as { returnTo: string; verifier: string; state: string; nonce: string };

    expect(url.origin).toBe("https://tenant.auth0.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(
      transaction.verifier,
    );
    expect(url.searchParams.get("state")).toBe(transaction.state);
    expect(url.searchParams.get("nonce")).toBe(transaction.nonce);
    expect(transaction.returnTo).toBe("/");
  });

  it("resolves sign-in only through an exact provider subject association", async () => {
    const findAssociation = jest.fn().mockResolvedValue({
      userId: "user-1",
      status: "ASSOCIATED",
    });
    const prisma = {
      authenticationProviderAssociation: { findUnique: findAssociation },
    };
    const { service: auth0, protector } = service(prisma);
    global.fetch = jest.fn().mockResolvedValueOnce(response(discovery()));
    const started = await auth0.begin("sign-in", "/campaigns");
    const transaction = JSON.parse(
      protector.decrypt(started.transactionCookie),
    ) as { state: string; nonce: string };
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const publicJwk = publicKey.export({ format: "jwk" });
    const header = encoded({ alg: "RS256", kid: "key-1", typ: "JWT" });
    const claims = encoded({
      iss: "https://tenant.auth0.com/",
      sub: "auth0|person-1",
      aud: "client-1",
      exp: Math.floor(Date.now() / 1_000) + 300,
      iat: Math.floor(Date.now() / 1_000),
      nonce: transaction.nonce,
    });
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${header}.${claims}`),
      privateKey,
    ).toString("base64url");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({ id_token: `${header}.${claims}.${signature}` }),
      )
      .mockResolvedValueOnce(
        response({ keys: [{ ...publicJwk, kid: "key-1", alg: "RS256" }] }),
      );

    await expect(
      auth0.complete(
        started.transactionCookie,
        "authorization-code",
        transaction.state,
      ),
    ).resolves.toEqual({ userId: "user-1", returnTo: "/campaigns" });
    expect(findAssociation).toHaveBeenCalledWith({
      where: {
        providerKey_providerSubjectHash: {
          providerKey: "auth0:tenant.auth0.com",
          providerSubjectHash: expect.any(String) as string,
        },
      },
      select: { userId: true, status: true },
    });
  });

  it("requires the original authenticated session to finish account linking", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(discovery()));
    const { service: auth0, protector } = service();
    const started = await auth0.begin("link", "/", "user-1");
    const transaction = JSON.parse(
      protector.decrypt(started.transactionCookie),
    ) as { state: string };

    await expect(
      auth0.complete(
        started.transactionCookie,
        "authorization-code",
        transaction.state,
      ),
    ).rejects.toThrow("account-linking session is no longer authenticated");
  });
});

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
