import {
  BadGatewayException,
  type CallHandler,
  type ExecutionContext,
  Logger,
} from "@nestjs/common";
import { lastValueFrom, throwError } from "rxjs";
import { ServiceFailureInterceptor } from "./service-failure.interceptor";

describe("ServiceFailureInterceptor", () => {
  it("logs service exceptions with request context and preserves the error", async () => {
    const error = new BadGatewayException("Invalid AI response");
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          originalUrl: "/api/ai/generate?debug=true",
          headers: { "x-request-id": "request-123" },
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    const handler = {
      handle: () => throwError(() => error),
    } as CallHandler;
    const logged = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const interceptor = new ServiceFailureInterceptor();

    await expect(
      lastValueFrom(interceptor.intercept(context, handler)),
    ).rejects.toBe(error);

    expect(setHeader).toHaveBeenCalledWith("x-request-id", "request-123");
    const entry = String(logged.mock.calls[0]?.[0]);
    expect(JSON.parse(entry)).toEqual({
      event: "service_failure",
      requestId: "request-123",
      method: "POST",
      path: "/api/ai/generate",
      status: 502,
      exception: "BadGatewayException",
      message: "Invalid AI response",
    });
    logged.mockRestore();
  });
});
