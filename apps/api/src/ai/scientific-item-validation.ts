import { BadGatewayException } from "@nestjs/common";

export function assertScientificItemClassification(
  components: Record<string, unknown>,
): void {
  for (const [field, label] of [
    ["operatingBasis", "operating basis"],
    ["understanding", "understanding state"],
  ] as const) {
    if (
      typeof components[field] !== "string" ||
      components[field].trim().length === 0
    ) {
      throw new BadGatewayException(
        `The AI response did not include an item ${label}.`,
      );
    }
  }

  if (
    components.operatingBasis === "composite" &&
    (typeof components.mechanismDescription !== "string" ||
      components.mechanismDescription.trim().length === 0)
  ) {
    throw new BadGatewayException(
      "A composite item operating basis requires a mechanism description.",
    );
  }
}
