import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthService } from "./auth.service";
import { AUTH_COOKIE, type AuthenticatedRequest } from "./auth.types";

export function requestToken(
  request: AuthenticatedRequest,
): string | undefined {
  const authorization = request.headers.authorization;
  if (
    typeof authorization === "string" &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization.slice(7).trim();
  }
  const cookie = request.headers.cookie;
  if (typeof cookie !== "string") return undefined;
  for (const pair of cookie.split(";")) {
    const [name, ...parts] = pair.trim().split("=");
    if (name === AUTH_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.auth.authenticate(requestToken(request));
    return true;
  }
}

@Injectable()
export class GmGuard extends SessionGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== UserRole.GM) {
      throw new ForbiddenException("Game Master access is required.");
    }
    return true;
  }
}
