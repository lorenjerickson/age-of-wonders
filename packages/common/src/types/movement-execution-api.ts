import type { TerrainPoint } from "./isometric-terrain";

/** GM-only Session movement input. Identifiers are transport values, never labels. */
export interface SessionMovementRequest {
  readonly actorId: string;
  readonly destination: TerrainPoint;
  readonly expectedRuntimeRevision: number;
  readonly idempotencyKey: string;
}
export interface SessionMovementDecisionRequest {
  readonly idempotencyKey: string;
}
export interface SessionMovementContext {
  readonly runtimeRevision: number;
  readonly status: "active" | "paused";
  readonly actors: readonly {
    readonly id: string;
    readonly name: string;
    readonly locationId: string;
    readonly locationName: string;
    readonly position: TerrainPoint;
  }[];
  readonly capturedRules: readonly {
    readonly name: string;
    readonly revision: number;
  }[];
  readonly proposals: readonly SessionMovementProposal[];
}
export interface SessionMovementProposal {
  readonly id: string;
  readonly status: "pending" | "approved" | "rejected" | "no-op" | "failed";
  readonly actorId: string;
  readonly actorName: string;
  readonly locationName: string;
  readonly origin: TerrainPoint;
  readonly destination: TerrainPoint;
  readonly expectedRuntimeRevision: number;
  readonly canApprove: boolean;
  readonly explanation: string;
  readonly effects: readonly string[];
  readonly trace: readonly string[];
  readonly createdAt: string;
  readonly decidedAt?: string;
}
