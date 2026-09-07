import { Logger } from "@nestjs/common";

export function logInvalidAiOutput(
  logger: Logger,
  generationKind: string,
  responseId: string,
  outputLength: number,
): void {
  logger.error(
    JSON.stringify({
      event: "invalid_ai_output",
      generationKind,
      responseId,
      outputLength,
    }),
  );
}
