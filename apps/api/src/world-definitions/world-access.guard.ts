import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { SessionGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedRequest } from "../auth/auth.types";
/** Services enforce World ownership/sharing. Only GMs may create a new World. */
@Injectable()
export class WorldAccessGuard extends SessionGuard {
  constructor(auth: AuthService) {
    super(auth);
  }
  override async canActivate(context: ExecutionContext) {
    await super.canActivate(context);
    const req = context
      .switchToHttp()
      .getRequest<
        AuthenticatedRequest & { params: { worldId?: string }; method: string }
      >();
    if (!req.params.worldId && req.method !== "GET" && req.user!.role !== "GM")
      throw new ForbiddenException(
        "Game Master access is required to create Worlds.",
      );
    return true;
  }
}
