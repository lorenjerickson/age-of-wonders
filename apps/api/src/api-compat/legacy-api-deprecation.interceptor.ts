import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";

@Injectable()
export class LegacyApiDeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    response.setHeader("Deprecation", "true");
    const request = http.getRequest<{ originalUrl?: string }>();
    const successor = successorUrl(request.originalUrl);
    if (successor) {
      response.setHeader("Link", `<${successor}>; rel="successor-version"`);
    }
    return next.handle();
  }
}

function successorUrl(originalUrl?: string): string | undefined {
  if (!originalUrl) return undefined;
  if (/(^|\/)world-definitions(?=\/|\?|$)/.test(originalUrl)) {
    return originalUrl.replace("world-definitions", "worlds");
  }
  if (/(^|\/)campaign-definitions(?=\/|\?|$)/.test(originalUrl)) {
    return originalUrl.replace("campaign-definitions", "campaigns");
  }
  return undefined;
}
