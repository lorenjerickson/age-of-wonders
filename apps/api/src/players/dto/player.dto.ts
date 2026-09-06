import type { ChangePlayerStandingRequest } from "@aow/common";
import { IsIn } from "class-validator";

const STANDINGS = ["active", "inactive", "banned"] as const;

export class ChangePlayerStandingDto implements ChangePlayerStandingRequest {
  @IsIn(STANDINGS)
  expectedStanding!: (typeof STANDINGS)[number];

  @IsIn(STANDINGS)
  targetStanding!: (typeof STANDINGS)[number];
}
