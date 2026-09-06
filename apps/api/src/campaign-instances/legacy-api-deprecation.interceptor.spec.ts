import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { of } from "rxjs";
import { LegacyApiDeprecationInterceptor } from "../api-compat/legacy-api-deprecation.interceptor";

describe("LegacyApiDeprecationInterceptor", () => {
  it("marks compatibility responses as deprecated without changing the result", (done) => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ setHeader }),
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of({ ok: true }) } as CallHandler;

    new LegacyApiDeprecationInterceptor().intercept(context, next).subscribe({
      next: (value) => {
        expect(value).toEqual({ ok: true });
        expect(setHeader).toHaveBeenCalledWith("Deprecation", "true");
      },
      complete: done,
    });
  });

  it("names a successor when a compatibility root maps unambiguously", (done) => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({ setHeader }),
        getRequest: () => ({
          originalUrl: "/api/world-definitions/world-1/draft",
        }),
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of({ ok: true }) } as CallHandler;

    new LegacyApiDeprecationInterceptor().intercept(context, next).subscribe({
      complete: () => {
        expect(setHeader).toHaveBeenCalledWith(
          "Link",
          '</api/worlds/world-1/draft>; rel="successor-version"',
        );
        done();
      },
    });
  });
});
