import {
  executeWorldRules,
  validateWorldRule,
  validateWorldRules,
  type WorldRule as WorldRuleData,
  type WorldRuleExecution,
} from "@aow/common";
import {
  Entity,
  type CommandInvocation,
  type DeepReadonly,
  type EntityTransition,
} from "./entity";

type RuleCommands = {
  replace: { params: { rule: WorldRuleData }; context: object };
};
/** Authored rule identity and structural policy; the expression interpreter stays pure. */
export class WorldRule extends Entity<
  WorldRuleData,
  RuleCommands,
  Record<string, never>
> {
  private constructor(data: WorldRuleData) {
    super("world-rule", data, [], { mode: "publication" });
    this.validate({ mode: "publication" });
  }
  static deserializePayload(data: unknown) {
    return new WorldRule(data as WorldRuleData);
  }
  static deserialize(value: unknown) {
    const envelope = value as Record<string, unknown> | null;
    if (
      !envelope ||
      envelope.type !== "world-rule" ||
      envelope.schemaVersion !== 1
    )
      throw new TypeError("Unsupported World rule envelope.");
    return this.deserializePayload(envelope.data);
  }
  static validateRule = validateWorldRule;
  static validateRules = validateWorldRules;
  serializePayload() {
    return this.serialize().data;
  }
  protected validateState(data: DeepReadonly<WorldRuleData>) {
    return validateWorldRule(data).issues.map((issue) => ({
      code: "world-rule-invalid",
      message: issue,
    }));
  }
  protected handleCommand(
    _name: "replace",
    invocation: CommandInvocation<RuleCommands["replace"]>,
  ): EntityTransition<WorldRuleData, Record<string, never>> {
    if (invocation.params.rule.id !== this.state.data.id)
      throw new TypeError("A rule's identity cannot change.");
    return { data: invocation.params.rule };
  }
}
type ExecutionInput = Parameters<typeof executeWorldRules>[0];
type ExecutionState = { input: ExecutionInput; result?: WorldRuleExecution };
type ExecutionCommands = {
  evaluate: {
    params: { entropy?: ExecutionInput["entropy"] };
    context: object;
  };
};
/** One deterministic preview/replay scope, including entropy requests and diagnostics. */
export class RuleExecution extends Entity<
  ExecutionState,
  ExecutionCommands,
  Record<string, never>
> {
  private constructor(input: ExecutionInput) {
    super("rule-execution", { input }, [], { mode: "runtime" });
  }
  static create(input: ExecutionInput) {
    return new RuleExecution(input);
  }
  static async run(input: ExecutionInput): Promise<WorldRuleExecution> {
    const owner = RuleExecution.create(input);
    try {
      const receipt = await owner.command("evaluate", {
        initiator: input.event.source,
        params: {},
        context: {},
      });
      if (receipt.status === "rejected")
        throw new TypeError(receipt.reason ?? "Rule execution rejected.");
      return owner.serialize().data.result!;
    } finally {
      owner.dispose();
    }
  }
  protected validateState() {
    return [];
  }
  protected handleCommand(
    _name: "evaluate",
    invocation: CommandInvocation<ExecutionCommands["evaluate"]>,
  ): EntityTransition<ExecutionState, Record<string, never>> {
    const input = {
      ...this.serialize().data.input,
      ...(invocation.params.entropy === undefined
        ? {}
        : { entropy: invocation.params.entropy }),
    };
    return { data: { input, result: executeWorldRules(input) } };
  }
}
