import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { Auth0Service } from "./auth0.service";
import { requestToken, SessionGuard } from "./auth.guard";
import { AUTH_COOKIE, type AuthenticatedRequest } from "./auth.types";

class BootstrapGmSessionDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  token!: string;
}

class EstablishAdministratorDto extends BootstrapGmSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsBoolean()
  grantGameMaster!: boolean;
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

const AUTH0_TRANSACTION_COOKIE = "aow_auth0_transaction";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly auth0: Auth0Service,
  ) {}

  @Get("providers")
  providers() {
    return { auth0: this.auth0.status() };
  }

  @Get("providers/me")
  @UseGuards(SessionGuard)
  async myProviders(@Req() request: Request & AuthenticatedRequest) {
    return { auth0: await this.auth0.statusFor(request.user!.id) };
  }

  @Get("auth0/start")
  async startAuth0(
    @Query("returnTo") returnTo: string | undefined,
    @Res() response: Response,
  ) {
    const result = await this.auth0.begin("sign-in", returnTo);
    setAuth0TransactionCookie(response, result.transactionCookie);
    return response.redirect(result.authorizationUrl);
  }

  @Get("auth0/link")
  @UseGuards(SessionGuard)
  async linkAuth0(
    @Query("returnTo") returnTo: string | undefined,
    @Req() request: Request & AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const result = await this.auth0.begin("link", returnTo, request.user!.id);
    setAuth0TransactionCookie(response, result.transactionCookie);
    return response.redirect(result.authorizationUrl);
  }

  @Get("auth0/callback")
  async completeAuth0(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const transaction = cookieValue(request, AUTH0_TRANSACTION_COOKIE);
    const existingToken = requestToken(request);
    const existingUser = existingToken
      ? await this.auth.authenticate(existingToken).catch(() => undefined)
      : undefined;
    const result = await this.auth0.complete(
      transaction,
      code,
      state,
      existingUser?.id,
    );
    const sessionToken = await this.auth.issueSession(result.userId);
    const signedInUser = await this.auth.authenticate(sessionToken);
    const publicUser = await this.auth.publicUser(signedInUser);
    const returnTo =
      result.returnTo !== "/"
        ? result.returnTo
        : publicUser.role === "administrator"
          ? "/settings"
          : publicUser.role === "player"
            ? "/play"
            : publicUser.role === "spectator"
              ? "/join"
              : "/";
    setSessionCookie(response, sessionToken);
    response.clearCookie(AUTH0_TRANSACTION_COOKIE, {
      path: "/api/auth/auth0",
    });
    return response.redirect(
      new URL(
        returnTo,
        process.env.WEB_ORIGIN ?? "http://localhost:5173",
      ).toString(),
    );
  }

  @Get("bootstrap")
  bootstrapStatus() {
    return this.auth.bootstrapStatus();
  }

  @Post("bootstrap")
  @HttpCode(HttpStatus.CREATED)
  async establishAdministrator(
    @Body() dto: EstablishAdministratorDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.establishFirstAdministrator(
      dto.token,
      dto,
      request.ip ?? request.socket.remoteAddress ?? "unknown",
    );
    const sessionToken = await this.auth.issueSession(user.id);
    setSessionCookie(response, sessionToken);
    return { user: await this.auth.publicUser(user) };
  }

  @Post("session")
  async createSession(
    @Body() dto: BootstrapGmSessionDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exchangeBootstrapSession(dto, request, response);
  }

  private async exchangeBootstrapSession(
    dto: BootstrapGmSessionDto,
    request: Request,
    response: Response,
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

function setAuth0TransactionCookie(response: Response, value: string): void {
  response.cookie(AUTH0_TRANSACTION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1_000,
    path: "/api/auth/auth0",
  });
}

function cookieValue(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}
