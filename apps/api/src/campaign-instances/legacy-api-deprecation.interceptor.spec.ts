import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { of } from "rxjs";
import { LegacyApiDeprecationInterceptor } from "./legacy-api-deprecation.interceptor";

describe("LegacyApiDeprecationInterceptor", () => {
  it("marks compatibility responses as deprecated without changing the result", (done) => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
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
});
