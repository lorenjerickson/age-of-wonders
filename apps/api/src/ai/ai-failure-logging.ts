import { Logger } from "@nestjs/common";

const MAX_OUTPUT_PREVIEW = 2_000;

export function logInvalidAiOutput(
  logger: Logger,
  generationKind: string,
  responseId: string,
  output: string,
): void {
  const preview = Array.from(output.slice(0, MAX_OUTPUT_PREVIEW), (value) => {
    const code = value.charCodeAt(0);
    return (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
      ? "�"
      : value;
  }).join("");
  logger.error(
    JSON.stringify({
      event: "invalid_ai_output",
      generationKind,
      responseId,
      outputLength: output.length,
      outputTruncated: output.length > MAX_OUTPUT_PREVIEW,
      outputPreview: preview,
    }),
  );
}
