import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { Observable } from "rxjs";
import { catchError, throwError } from "rxjs";

@Injectable()
export class ServiceFailureInterceptor implements NestInterceptor {
  private readonly logger = new Logger("ServiceFailure");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const suppliedRequestId = request.headers["x-request-id"];
    const requestId =
      typeof suppliedRequestId === "string" && suppliedRequestId.trim()
        ? suppliedRequestId.trim().slice(0, 200)
        : randomUUID();
    response.setHeader("x-request-id", requestId);

    return next.handle().pipe(
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const failure = {
          event: "service_failure",
          requestId,
          method: request.method,
          path: request.originalUrl.split("?", 1)[0],
          status,
          exception:
            error instanceof Error ? error.constructor.name : typeof error,
          message:
            error instanceof Error ? error.message : "Unknown service failure",
        };
        const serialized = JSON.stringify(failure);
        const stack = error instanceof Error ? error.stack : undefined;
        if (status >= 500) {
          this.logger.error(serialized, stack);
        } else {
          this.logger.warn(serialized);
        }
        return throwError(() => error);
      }),
    );
  }
}
