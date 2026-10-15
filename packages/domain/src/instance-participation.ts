import {
  CORE_SESSION_AGENT_ACT_CAPABILITIES,
  CORE_SESSION_AGENT_OBSERVE_CAPABILITIES,
} from "@aow/common";
import {
  Entity,
  type CommandInvocation,
  type EntityTransition,
  type EntityOptions,
  type DeepReadonly,
} from "./entity";
const memberships: Record<string, readonly string[]> = {
  active: ["inactive", "left", "banned"],
  inactive: ["active", "left", "banned"],
  left: [],
  banned: ["inactive"],
};
export interface InstanceParticipationState extends Record<string, unknown> {
  kind: "human" | "agent";
  status: string;
  role?: string;
  displayName?: string;
  activeCharacterId?: string | null;
  leftAt?: string | null;
  observeCapabilities?: readonly string[];
  actCapabilities?: readonly string[];
}
export type InstanceParticipationCommands = {
  transition: {
    params: { expectedStatus: string; status: string; occurredAt: string };
    context: { currentSession?: boolean };
  };
  configureCapabilities: {
    params: { observe: readonly string[]; act: readonly string[] };
    context: object;
  };
};
export type InstanceParticipationEvents = {
  transitioned: { from: string; to: string };
  capabilitiesConfigured: {
    observe: readonly string[];
    act: readonly string[];
  };
};
/** Instance-owned participation lifecycle. Authentication and credential grants are never gameplay state. */
export class InstanceParticipation extends Entity<
  InstanceParticipationState,
  InstanceParticipationCommands,
  InstanceParticipationEvents
> {
  private constructor(
    data: InstanceParticipationState,
    options?: EntityOptions,
  ) {
    super(
      "instance-participation",
      data,
      ["transitioned", "capabilitiesConfigured"],
      { mode: "runtime" },
      options,
    );
    this.validate({ mode: "runtime" });
  }
  static deserializePayload(value: unknown, options?: EntityOptions) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Participation requires an object.");
    return new InstanceParticipation(
      value as InstanceParticipationState,
      options,
    );
  }
  static deserialize(value: unknown, options?: EntityOptions) {
    const v = value as Record<string, unknown>;
    if (!v || v.type !== "instance-participation" || v.schemaVersion !== 1)
      throw new TypeError("Unsupported participation envelope.");
    return this.deserializePayload(v.data, options);
  }
  serializePayload() {
    return this.serialize().data;
  }
  static assertMembershipTransition(
    state: Pick<InstanceParticipationState, "status" | "role">,
    expected: string,
    target: string,
  ) {
    if (state.role?.toLowerCase() === "gm")
      throw new TypeError(
        "The Game Master membership follows Campaign Instance ownership.",
      );
    if (state.status !== expected || !memberships[expected]?.includes(target))
      throw new TypeError(
        "Membership status changed or the requested transition is unavailable.",
      );
  }
  static assertAgentTransition(from: string, to: string) {
    if (!(
      ["configured", "authorized", "active", "paused"].includes(from) &&
      (to === "revoked" ||
        (from === "configured" && to === "authorized") ||
        (["authorized", "active"].includes(from) && to === "paused") ||
        (from === "paused" && to === "authorized"))
    ))
      throw new TypeError(
        "The requested Agent status transition is not allowed.",
      );
  }
  static capabilities(values: readonly string[], kind: "observe" | "act") {
    const normalized = [...new Set(values.map((v) => v.trim()))];
    if (
      normalized.length > 100 ||
      normalized.some((v) => v.length > 120 || !/^[^:\s]+:[^:\s]+$/.test(v))
    )
      throw new TypeError("Agent capabilities must use namespaced keys.");
    if (
      normalized.some(
        (v) =>
          /^(auth|identity|credentials|secrets?):/i.test(v) ||
          /(^|[-_.:])(impersonate|assume-user|session-token|secrets?)([-_.:]|$)/i.test(
            v,
          ),
      )
    )
      throw new TypeError(
        "Agent capabilities cannot grant credential or human identity authority.",
      );
    const allowed: readonly string[] =
      kind === "observe"
        ? CORE_SESSION_AGENT_OBSERVE_CAPABILITIES
        : CORE_SESSION_AGENT_ACT_CAPABILITIES;
    if (normalized.some((v) => !allowed.includes(v)))
      throw new TypeError(
        `Agent ${kind} capabilities must use the core Session capability registry.`,
      );
    return normalized;
  }
  protected validateState(data: DeepReadonly<InstanceParticipationState>) {
    return (
      data.kind === "human"
        ? Object.hasOwn(memberships, data.status)
        : data.kind === "agent" &&
          ["configured", "authorized", "active", "paused", "revoked"].includes(
            data.status,
          )
    )
      ? []
      : [
          {
            code: "instance-participation-status",
            message: "Choose a valid participation kind and status.",
          },
        ];
  }
  protected handleCommand<K extends keyof InstanceParticipationCommands>(
    name: K,
    invocation: CommandInvocation<InstanceParticipationCommands[K]>,
  ): EntityTransition<InstanceParticipationState, InstanceParticipationEvents> {
    const data = this.serializePayload();
    if (name === "configureCapabilities") {
      if (data.kind !== "agent")
        throw new TypeError(
          "Only Agents have observation and action capability grants.",
        );
      const params =
        invocation.params as InstanceParticipationCommands["configureCapabilities"]["params"];
      const observe = InstanceParticipation.capabilities(
          params.observe,
          "observe",
        ),
        act = InstanceParticipation.capabilities(params.act, "act");
      return {
        data: { ...data, observeCapabilities: observe, actCapabilities: act },
        events: [{ name: "capabilitiesConfigured", context: { observe, act } }],
      };
    }
    if (name !== "transition")
      throw new TypeError("Unknown participation command.");
    const { expectedStatus, status, occurredAt } =
      invocation.params as InstanceParticipationCommands["transition"]["params"];
    if (data.kind === "human") {
      InstanceParticipation.assertMembershipTransition(
        data,
        expectedStatus,
        status,
      );
      if (
        (invocation.context as { currentSession?: boolean }).currentSession &&
        status !== "active"
      )
        throw new TypeError(
          `${data.displayName}'s membership cannot change while they participate in a current Session.`,
        );
      if (status === "left" && !Number.isFinite(Date.parse(occurredAt)))
        throw new TypeError("Provide the membership departure time.");
      return {
        data: {
          ...data,
          status,
          leftAt: status === "left" ? occurredAt : null,
          ...(["left", "banned"].includes(status)
            ? { activeCharacterId: null }
            : {}),
        },
        events: [
          { name: "transitioned", context: { from: data.status, to: status } },
        ],
      };
    }
    InstanceParticipation.assertAgentTransition(expectedStatus, status);
    if (data.status !== expectedStatus)
      throw new TypeError("Agent participation changed; reload and retry.");
    return {
      data: { ...data, status },
      events: [
        { name: "transitioned", context: { from: data.status, to: status } },
      ],
    };
  }
}
