import type { User, UserRole } from "@prisma/client";

export const AUTH_COOKIE = "aow_session";

export type AuthenticatedUser = Pick<User, "id" | "displayName" | "role">;

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

export function hasRole(
  user: AuthenticatedUser | undefined,
  role: UserRole,
): boolean {
  return user?.role === role;
}
