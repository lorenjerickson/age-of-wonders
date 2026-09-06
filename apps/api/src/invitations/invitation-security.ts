import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface ProtectedContact {
  normalized: string;
  encrypted: string;
  hash: string;
}

@Injectable()
export class InvitationTokenService {
  issue(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  matches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}

@Injectable()
export class ContactProtector {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configured = config.get<string>("CONTACT_ENCRYPTION_KEY");
    const fallback =
      config.get<string>("NODE_ENV", "development") === "production"
        ? undefined
        : Buffer.alloc(32, 1).toString("base64");
    const decoded = configured ?? fallback;
    if (!decoded || Buffer.from(decoded, "base64").length !== 32) {
      throw new Error(
        "CONTACT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
      );
    }
    this.key = Buffer.from(decoded, "base64");
  }

  protectEmail(value: string): ProtectedContact {
    const normalized = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException("Email address is invalid.");
    }
    return this.protect(normalized);
  }

  protectPhone(value: string): ProtectedContact {
    const compact = value.trim().replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
      throw new BadRequestException(
        "Phone number must use international E.164 format.",
      );
    }
    return this.protect(compact);
  }

  /** Protect a provider subject or other opaque identity value without contact normalization. */
  protectOpaque(value: string): ProtectedContact {
    const normalized = value.trim();
    if (!normalized || normalized.length > 1_000) {
      throw new BadRequestException("Identity subject is invalid.");
    }
    return this.protect(normalized);
  }

  decrypt(value: string): string {
    const [ivPart, tagPart, ciphertextPart] = value.split(".");
    if (!ivPart || !tagPart || !ciphertextPart) {
      throw new Error("Encrypted contact value is malformed.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  private protect(normalized: string): ProtectedContact {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(normalized, "utf8"),
      cipher.final(),
    ]);
    const encrypted = [
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
    return {
      normalized,
      encrypted,
      hash: createHash("sha256")
        .update(this.key)
        .update(normalized, "utf8")
        .digest("hex"),
    };
  }
}
