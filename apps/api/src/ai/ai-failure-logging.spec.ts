import { Logger } from "@nestjs/common";
import { logInvalidAiOutput } from "./ai-failure-logging";

describe("AI failure logging", () => {
  it("records validation metadata without logging generated content", () => {
    const error = jest.fn<void, [string]>();
    const logger = { error } as unknown as Logger;
    const generated = "private GM premise and unreleased World material";

    logInvalidAiOutput(
      logger,
      "world-location-proposal",
      "provider-response",
      generated.length,
    );

    const serialized = error.mock.calls[0]?.[0] ?? "";
    expect(serialized).toContain('"event":"invalid_ai_output"');
    expect(serialized).toContain(`"outputLength":${generated.length}`);
    expect(serialized).not.toContain(generated);
    expect(serialized).not.toContain("outputPreview");
  });
});
