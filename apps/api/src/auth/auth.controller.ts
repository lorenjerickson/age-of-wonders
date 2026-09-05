import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { requestToken, SessionGuard } from "./auth.guard";
import { AUTH_COOKIE, type AuthenticatedRequest } from "./auth.types";

class BootstrapGmSessionDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  token!: string;
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("gm-session")
  async createGmSession(
    @Body() dto: BootstrapGmSessionDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.authenticateBootstrap(
      dto.token,
      request.ip ?? request.socket.remoteAddress ?? "unknown",
    );
    const sessionToken = await this.auth.issueSession(user.id);
    setSessionCookie(response, sessionToken);
    return { user: await this.auth.publicUser(user) };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Req() request: Request & AuthenticatedRequest) {
    return { user: await this.auth.publicUser(request.user!) };
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = requestToken(request);
    if (token) await this.auth.revoke(token);
    response.clearCookie(AUTH_COOKIE, { path: "/" });
    return { signedOut: true };
  }
}
