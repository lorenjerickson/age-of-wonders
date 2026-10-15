import { executeWorldRules, type WorldRuleExecution } from "@aow/common";
import {
  Entity,
  copyEntityData,
  type CommandInvocation,
  type EntityTransition,
} from "./entity";

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
    // Consume only committed observable facts. A rejected or failed command must
    // never return an interpreter result from an unpublished transition.
    let result: WorldRuleExecution | undefined;
    const subscription = owner.state$.subscribe((state) => {
      if (state.data.result !== undefined)
        result = copyEntityData(
          state.data.result as unknown,
        ) as WorldRuleExecution;
    });
    try {
      const receipt = await owner.command("evaluate", {
        initiator: input.event.source,
        params: {},
        context: {},
      });
      if (receipt.status === "rejected")
        throw new TypeError(receipt.reason ?? "Rule execution rejected.");
      if (result === undefined)
        throw new Error("Rule execution did not publish a result.");
      return result;
    } finally {
      subscription.unsubscribe();
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
