import {
  validateWorldRule,
  validateWorldRules,
  type WorldRule as WorldRuleData,
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
export { RuleExecution } from "./rule-execution";
