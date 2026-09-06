import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
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

  @Post("gm-session")
  @Header("Deprecation", "true")
  @Header("Link", '</api/auth/session>; rel="successor-version"')
  async createGmSession(
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
