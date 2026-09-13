import type {
  JsonValue,
  WorldRule,
  WorldRuleExpression,
  WorldRulePredicate,
  WorldRuleEffect,
  WorldRuleEvent,
  RuleStateView,
  RuleStateEntity,
  RuleValueType,
  WorldRuleExecution,
  WorldRuleWrite,
  WorldRuleTrace,
  RecordedRuleRoll,
  RuleRollRequest,
  WorldRuleExecutionLimits,
} from "../types";

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const safeKey = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 160 &&
  !["__proto__", "prototype", "constructor"].includes(v);
const eventKey = (v: unknown): v is string =>
  safeKey(v) && /^[a-z][a-z0-9.-]*:[a-z0-9][a-z0-9.-]*$/.test(v);
const reservedEvents = new Set([
  "aow:state-changed",
  "aow:dice-requested",
  "aow:dice-result",
]);
const fail = (message: string): never => {
  throw new Error(message);
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function jsonGuard(value: unknown, maxNodes = 30000) {
  let count = 0,
    characters = 0;
  const seen = new Set<unknown>();
  function walk(v: unknown, depth: number) {
    if (++count > maxNodes || depth > 32)
      fail("The supported data budget was exceeded.");
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) fail("Numeric values must be finite.");
      return;
    }
    if (typeof v === "string") {
      if (v.length > 10000 || (characters += v.length) > 500000)
        fail("A text value exceeds the supported limit.");
      return;
    }
    if (!object(v) && !Array.isArray(v)) fail("Only JSON data is supported.");
    if (seen.has(v)) fail("Cyclic input data is unsupported.");
    seen.add(v);
    if (Array.isArray(v)) for (const item of v) walk(item, depth + 1);
    else
      for (const [key, item] of Object.entries(v as ObjectValue)) {
        if (!safeKey(key)) fail("A field key is unsupported.");
        walk(item, depth + 1);
      }
    seen.delete(v);
  }
  walk(value, 0);
}
function keys(
  value: unknown,
  required: string[],
  optional: string[] = [],
): ObjectValue {
  if (
    !object(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    fail("The rule uses unsupported or missing fields.");
  return value as ObjectValue;
}
function requireKey(value: unknown) {
  if (!safeKey(value)) fail("A rule reference is invalid.");
}
function expressions(values: unknown, depth: number) {
  if (!Array.isArray(values) || !values.length || values.length > 32)
    fail("An expression group must contain one to thirty-two members.");
  for (const v of values as unknown[]) expression(v, depth + 1);
}
function expression(value: unknown, depth = 0): void {
  if (depth > 12 || !object(value))
    fail("The expression is unsupported or too deeply nested.");
  const v = value as ObjectValue;
  switch (v.kind) {
    case "literal":
      keys(v, ["kind", "value"]);
      return;
    case "constant":
      keys(v, ["kind", "value"]);
      if (typeof v.value !== "number") fail("A constant must be numeric.");
      return;
    case "context":
    case "local":
      keys(v, ["kind", "key"]);
      requireKey(v.key);
      return;
    case "state":
      keys(v, ["kind", "scope", "entity", "field"]);
      if (!["runtime", "captured"].includes(String(v.scope)))
        fail("The state scope is unsupported.");
      requireKey(v.field);
      expression(v.entity, depth + 1);
      return;
    case "arithmetic":
      keys(v, ["kind", "operator", "operands"]);
      if (
        !["add", "subtract", "multiply", "divide", "min", "max"].includes(
          String(v.operator),
        )
      )
        fail("The arithmetic operator is unsupported.");
      expressions(v.operands, depth);
      return;
    case "query-count":
      keys(v, ["kind", "scope", "entityType", "field", "equals"]);
      if (!["runtime", "captured"].includes(String(v.scope)))
        fail("The query scope is unsupported.");
      requireKey(v.entityType);
      requireKey(v.field);
      expression(v.equals, depth + 1);
      return;
    default:
      fail("This expression is outside the executable profile.");
  }
}
function predicate(value: unknown, depth = 0): void {
  if (depth > 12 || !object(value))
    fail("The condition is unsupported or too deeply nested.");
  const v = value as ObjectValue;
  switch (v.kind) {
    case "always":
    case "never":
      keys(v, ["kind"]);
      return;
    case "all":
    case "any":
      keys(v, ["kind", "predicates"]);
      if (
        !Array.isArray(v.predicates) ||
        !v.predicates.length ||
        v.predicates.length > 32
      )
        fail("A condition group must contain one to thirty-two members.");
      for (const p of v.predicates as unknown[]) predicate(p, depth + 1);
      return;
    case "not":
      keys(v, ["kind", "predicate"]);
      predicate(v.predicate, depth + 1);
      return;
    case "compare":
      keys(v, ["kind", "operator", "left", "right"]);
      if (!["eq", "ne", "lt", "lte", "gt", "gte"].includes(String(v.operator)))
        fail("The comparison is unsupported.");
      expression(v.left);
      expression(v.right);
      return;
    default:
      fail("This condition is outside the executable profile.");
  }
}
function contextExpressions(value: unknown) {
  if (!object(value) || Object.keys(value).length > 32)
    fail("Event context is unsupported.");
  for (const v of Object.values(value as ObjectValue)) expression(v);
}
function effect(value: unknown) {
  if (!object(value)) fail("An effect is invalid.");
  const v = value as ObjectValue;
  switch (v.kind) {
    case "set":
    case "increment":
    case "move": {
      keys(v, ["kind", "target", "value"]);
      const t = keys(v.target, ["entity", "field"]);
      requireKey(t.field);
      expression(t.entity);
      expression(v.value);
      return;
    }
    case "set-local":
      keys(v, ["kind", "key", "value"]);
      requireKey(v.key);
      expression(v.value);
      return;
    case "emit":
      keys(v, ["kind", "event", "context"]);
      if (!eventKey(v.event) || reservedEvents.has(v.event))
        fail("An emitted event type is invalid or reserved for engine facts.");
      contextExpressions(v.context);
      return;
    case "roll":
      keys(v, ["kind", "count", "sides", "resultEvent", "context"]);
      if (
        !Number.isInteger(v.count) ||
        Number(v.count) < 1 ||
        Number(v.count) > 100 ||
        !Number.isInteger(v.sides) ||
        Number(v.sides) < 2 ||
        Number(v.sides) > 1000 ||
        !eventKey(v.resultEvent) ||
        v.resultEvent === "aow:state-changed" ||
        v.resultEvent === "aow:dice-requested"
      )
        fail("The recorded dice request is unsupported.");
      contextExpressions(v.context);
      return;
    default:
      fail("This effect is outside the executable profile.");
  }
}
function validateOne(value: unknown) {
  const rule = keys(
    value,
    [
      "formatVersion",
      "id",
      "name",
      "revision",
      "lifecycle",
      "priority",
      "trigger",
      "effects",
      "audit",
    ],
    ["description", "condition"],
  );
  if (
    rule.formatVersion !== 1 ||
    !Number.isSafeInteger(rule.revision) ||
    Number(rule.revision) < 1 ||
    !Number.isSafeInteger(rule.priority) ||
    Math.abs(Number(rule.priority)) > 10000
  )
    fail("The rule version, revision, or priority is unsupported.");
  requireKey(rule.id);
  if (
    typeof rule.name !== "string" ||
    !rule.name.trim() ||
    rule.name.length > 240
  )
    fail("A rule needs a human-readable name.");
  if (rule.description !== undefined && typeof rule.description !== "string")
    fail("A rule description must be text.");
  if (!["enabled", "disabled", "archived"].includes(String(rule.lifecycle)))
    fail("The rule lifecycle is unsupported.");
  const trigger = keys(rule.trigger, ["event", "version"]);
  if (!eventKey(trigger.event) || trigger.version !== 1)
    fail("The rule trigger is unsupported.");
  const audit = keys(rule.audit, ["createdBy", "updatedAt"]);
  requireKey(audit.createdBy);
  if (
    typeof audit.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(audit.updatedAt))
  )
    fail("Rule audit metadata is invalid.");
  if (rule.condition !== undefined) predicate(rule.condition);
  if (
    !Array.isArray(rule.effects) ||
    !rule.effects.length ||
    rule.effects.length > 32
  )
    fail("A rule must contain one to thirty-two ordered effects.");
  for (const e of rule.effects as unknown[]) effect(e);
}
export function validateWorldRule(value: unknown): {
  valid: boolean;
  issues: readonly string[];
} {
  try {
    jsonGuard(value, 5000);
    validateOne(value);
    return { valid: true, issues: [] };
  } catch (e) {
    return {
      valid: false,
      issues: [e instanceof Error ? e.message : "Invalid rule."],
    };
  }
}
export function validateWorldRules(value: unknown): {
  valid: boolean;
  issues: readonly string[];
} {
  try {
    jsonGuard(value);
    if (!Array.isArray(value) || value.length > 128)
      fail("The captured rule library is unsupported or too large.");
    const ids = new Set(),
      names = new Set();
    for (const rule of value as unknown[]) {
      validateOne(rule);
      const r = rule as WorldRule;
      if (ids.has(r.id) || names.has(r.name))
        fail(
          "Rule identities and names must be unique in the captured library.",
        );
      ids.add(r.id);
      names.add(r.name);
    }
    return { valid: true, issues: [] };
  } catch (e) {
    return {
      valid: false,
      issues: [e instanceof Error ? e.message : "Invalid rule library."],
    };
  }
}
function matchesType(value: JsonValue, type: RuleValueType) {
  if (type === "json") return true;
  if (type === "point")
    return (
      object(value) &&
      Object.keys(value).length === 3 &&
      ["x", "y", "z"].every(
        (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
      )
    );
  return typeof value === type && (type !== "number" || Number.isFinite(value));
}
function validateState(value: unknown): asserts value is RuleStateView {
  jsonGuard(value);
  const state = keys(value, ["runtime", "captured", "schema"]);
  if (
    !object(state.runtime) ||
    !object(state.captured) ||
    !object(state.schema)
  )
    fail("The scoped state view is invalid.");
  for (const fields of Object.values(state.schema as ObjectValue)) {
    if (!object(fields)) fail("A state schema is invalid.");
    for (const spec of Object.values(fields as ObjectValue)) {
      const s = keys(spec, ["type", "writable"]);
      if (
        !["number", "string", "boolean", "point", "json"].includes(
          String(s.type),
        ) ||
        typeof s.writable !== "boolean"
      )
        fail("A state schema field is unsupported.");
    }
  }
  for (const scope of ["runtime", "captured"] as const)
    for (const entity of Object.values(state[scope] as ObjectValue)) {
      const e = keys(entity, ["type", "fields"]);
      if (!safeKey(e.type) || !object(e.fields))
        fail("A scoped entity is invalid.");
      const fields = (state.schema as ObjectValue)[String(e.type)];
      if (!object(fields))
        fail("An entity type is not declared by the host schema.");
      for (const [key, val] of Object.entries(e.fields as ObjectValue)) {
        const spec = (fields as ObjectValue)[key];
        if (
          !object(spec) ||
          !matchesType(val as JsonValue, spec.type as RuleValueType)
        )
          fail("A state field does not match its declared type.");
      }
    }
}
const equal = (a: JsonValue, b: JsonValue): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (object(a) && object(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every(
        (k) =>
          Object.hasOwn(b, k) && equal(a[k] as JsonValue, b[k] as JsonValue),
      )
    );
  return false;
};

/** Pure whole-chain simulation. Failure or missing recorded entropy returns the original state and no committable writes/events. */
export function executeWorldRules(input: {
  readonly rules: unknown;
  readonly event: WorldRuleEvent;
  readonly state: RuleStateView;
  readonly entropy?: readonly RecordedRuleRoll[];
  readonly limits?: WorldRuleExecutionLimits;
}): WorldRuleExecution {
  const trace: WorldRuleTrace[] = [],
    requests: RuleRollRequest[] = [],
    rolls: RecordedRuleRoll[] = [];
  const events: WorldRuleEvent[] = [],
    writes: WorldRuleWrite[] = [];
  const max = {
    events: 128,
    effects: 512,
    operations: 20000,
    depth: 24,
    trace: 2048,
  };
  let operations = 0,
    effectSteps = 0,
    eventSerial = 0,
    outputCharacters = 0;
  let needsEntropy = false;
  try {
    for (const key of Object.keys(max) as (keyof typeof max)[]) {
      const n = input.limits?.[key];
      if (n !== undefined) {
        if (!Number.isSafeInteger(n) || n < 1 || n > max[key])
          fail(
            "Execution limits must be positive and within the supported ceiling.",
          );
        max[key] = n;
      }
    }
    const bump = () => {
      if (++operations > max.operations)
        fail("The rule operation budget was exceeded.");
    };
    const addTrace = (item: WorldRuleTrace) => {
      if (trace.length >= max.trace)
        fail("The causal trace budget was exceeded.");
      trace.push(item);
    };
    const valid = validateWorldRules(input.rules);
    if (!valid.valid) fail(valid.issues[0]);
    validateState(input.state);
    jsonGuard(input.event);
    jsonGuard(input.entropy ?? []);
    const root = input.event;
    keys(
      root,
      [
        "formatVersion",
        "id",
        "rootEventId",
        "idempotencyKey",
        "type",
        "version",
        "source",
        "context",
      ],
      ["parentEventId", "causedBy"],
    );
    if (
      root.formatVersion !== 1 ||
      root.version !== 1 ||
      !eventKey(root.type) ||
      reservedEvents.has(root.type) ||
      !safeKey(root.id) ||
      root.rootEventId !== root.id ||
      root.parentEventId !== undefined ||
      !safeKey(root.idempotencyKey) ||
      !["gm", "player"].includes(root.source) ||
      !object(root.context) ||
      root.causedBy !== undefined
    )
      fail("The root event must be a host-authorized declaration.");
    const rules = (input.rules as WorldRule[])
      .filter((r) => r.lifecycle === "enabled")
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      );
    const entropy = new Map<string, RecordedRuleRoll>();
    for (const roll of input.entropy ?? []) {
      keys(roll, ["requestId", "count", "sides", "values"]);
      if (
        !safeKey(roll.requestId) ||
        entropy.has(roll.requestId) ||
        !Array.isArray(roll.values) ||
        roll.values.length !== roll.count ||
        !Number.isInteger(roll.count) ||
        roll.count < 1 ||
        roll.count > 100 ||
        !Number.isInteger(roll.sides) ||
        roll.sides < 2 ||
        roll.sides > 1000 ||
        roll.values.some((n) => !Number.isInteger(n) || n < 1 || n > roll.sides)
      )
        fail("The recorded entropy tape is invalid.");
      entropy.set(roll.requestId, roll);
    }
    let state = clone(input.state);
    const queue: { event: WorldRuleEvent; depth: number }[] = [
      { event: clone(root), depth: 0 },
    ];
    while (queue.length) {
      if (events.length >= max.events)
        fail("The event chain limit was exceeded; no changes were applied.");
      const { event, depth } = queue.shift()!;
      if (depth > max.depth)
        fail("The causal depth limit was exceeded; no changes were applied.");
      events.push(event);
      addTrace({
        eventId: event.id,
        kind: "event",
        detail: `Process ${event.type}.`,
      });
      let locals: Record<string, JsonValue> = {};
      const applicable = rules.filter(
        (r) =>
          r.trigger.event === event.type && r.trigger.version === event.version,
      );
      const priorities = [...new Set(applicable.map((r) => r.priority))];
      for (const priority of priorities) {
        const candidates: {
          state: RuleStateView;
          locals: Record<string, JsonValue>;
          targets: Set<string>;
          localTargets: Set<string>;
          writes: WorldRuleWrite[];
          events: WorldRuleEvent[];
        }[] = [];
        for (const rule of applicable.filter((r) => r.priority === priority)) {
          const candidate = {
            state: clone(state),
            locals: clone(locals),
            targets: new Set<string>(),
            localTargets: new Set<string>(),
            writes: [] as WorldRuleWrite[],
            events: [] as WorldRuleEvent[],
          };
          const field = (
            scope: "runtime" | "captured",
            id: string,
            key: string,
          ) => {
            const entity = Object.hasOwn(candidate.state[scope], id)
              ? candidate.state[scope][id]
              : undefined;
            if (!entity)
              return fail("A scoped effect or state reference could not be resolved.");
            const fields = candidate.state.schema[entity.type];
            const spec =
              fields && Object.hasOwn(fields, key) ? fields[key] : undefined;
            if (!spec) return fail("A state field is outside the declared schema.");
            return {
              entity,
              spec,
              value: Object.hasOwn(entity.fields, key)
                ? entity.fields[key]
                : null,
            };
          };
          const numeric = (v: JsonValue) => {
            if (typeof v !== "number" || !Number.isFinite(v))
              fail("The expression requires a finite number.");
            return v as number;
          };
          const evaluate = (x: WorldRuleExpression): JsonValue => {
            bump();
            switch (x.kind) {
              case "literal":
              case "constant":
                return x.value;
              case "context":
                return Object.hasOwn(event.context, x.key)
                  ? event.context[x.key]
                  : null;
              case "local":
                return Object.hasOwn(candidate.locals, x.key)
                  ? candidate.locals[x.key]
                  : null;
              case "state": {
                const id = evaluate(x.entity);
                if (typeof id !== "string")
                  fail("A state entity binding must resolve to an identifier.");
                return field(x.scope, id as string, x.field).value;
              }
              case "query-count": {
                const fields = Object.hasOwn(
                  candidate.state.schema,
                  x.entityType,
                )
                  ? candidate.state.schema[x.entityType]
                  : undefined;
                const schema =
                  fields && Object.hasOwn(fields, x.field)
                    ? fields[x.field]
                    : undefined;
                if (!schema)
                  fail("A query field is outside the declared schema.");
                const expected = evaluate(x.equals);
                let count = 0;
                for (const entity of Object.values(candidate.state[x.scope])) {
                  bump();
                  if (
                    entity.type === x.entityType &&
                    equal(
                      Object.hasOwn(entity.fields, x.field)
                        ? entity.fields[x.field]
                        : null,
                      expected,
                    )
                  )
                    count++;
                }
                return count;
              }
              case "arithmetic": {
                const n = x.operands.map((v) => numeric(evaluate(v)));
                let result: number;
                switch (x.operator) {
                  case "add":
                    result = n.reduce((a, b) => a + b, 0);
                    break;
                  case "subtract":
                    result = n.slice(1).reduce((a, b) => a - b, n[0]);
                    break;
                  case "multiply":
                    result = n.reduce((a, b) => a * b, 1);
                    break;
                  case "divide":
                    result = n.slice(1).reduce((a, b) => a / b, n[0]);
                    break;
                  case "min":
                    result = Math.min(...n);
                    break;
                  case "max":
                    result = Math.max(...n);
                    break;
                }
                return numeric(result);
              }
            }
          };
          const test = (p: WorldRulePredicate): boolean => {
            bump();
            switch (p.kind) {
              case "always":
                return true;
              case "never":
                return false;
              case "all":
                return p.predicates.every(test);
              case "any":
                return p.predicates.some(test);
              case "not":
                return !test(p.predicate);
              case "compare": {
                const a = evaluate(p.left),
                  b = evaluate(p.right);
                if (p.operator === "eq") return equal(a, b);
                if (p.operator === "ne") return !equal(a, b);
                const l = numeric(a),
                  r = numeric(b);
                return p.operator === "lt"
                  ? l < r
                  : p.operator === "lte"
                    ? l <= r
                    : p.operator === "gt"
                      ? l > r
                      : l >= r;
              }
            }
          };
          const satisfied = !rule.condition || test(rule.condition);
          addTrace({
            eventId: event.id,
            ruleName: rule.name,
            kind: "condition",
            detail: satisfied
              ? "Conditions passed against the priority stage state."
              : "Conditions did not pass.",
          });
          if (!satisfied) continue;
          const emitted = (
            type: string,
            context: Record<string, JsonValue>,
            index: number,
            source: WorldRuleEvent["source"],
          ) => {
            outputCharacters += JSON.stringify(context).length;
            if (outputCharacters > 2000000)
              fail(
                "The causal output budget was exceeded; no changes were applied.",
              );
            if (
              events.length +
                queue.length +
                candidates.reduce((n, c) => n + c.events.length, 0) +
                candidate.events.length >=
              max.events
            )
              fail(
                "The event chain limit was exceeded; no changes were applied.",
              );
            candidate.events.push({
              formatVersion: 1,
              id: `${root.id}/${++eventSerial}`,
              rootEventId: root.id,
              parentEventId: event.id,
              idempotencyKey: root.idempotencyKey,
              type,
              version: 1,
              source,
              context,
              causedBy: {
                ruleId: rule.id,
                ruleRevision: rule.revision,
                effectIndex: index,
              },
            });
          };
          for (const [index, e] of rule.effects.entries()) {
            if (++effectSteps > max.effects)
              fail(
                "The ordered effect limit was exceeded; no changes were applied.",
              );
            bump();
            addTrace({
              eventId: event.id,
              ruleName: rule.name,
              effectIndex: index,
              kind: "effect",
              detail: `Execute ${e.kind} in authored order.`,
            });
            if (e.kind === "set-local") {
              candidate.locals[e.key] = clone(evaluate(e.value));
              candidate.localTargets.add(e.key);
              continue;
            }
            if (e.kind === "emit" || e.kind === "roll") {
              const context: Record<string, JsonValue> = {};
              for (const [key, expression] of Object.entries(e.context))
                context[key] = evaluate(expression);
              if (e.kind === "emit") emitted(e.event, context, index, "rule");
              else {
                const requestId = `${event.id}:${rule.id}:${index}`;
                const request = { requestId, count: e.count, sides: e.sides };
                requests.push(request);
                const roll = entropy.get(requestId);
                if (!roll) {
                  needsEntropy = true;
                  fail(
                    "Recorded dice results are required; resume by replaying the same declaration with the recorded tape.",
                  );
                }
                if (roll!.count !== e.count || roll!.sides !== e.sides)
                  fail("Recorded dice results do not match the rule request.");
                rolls.push(roll!);
                emitted(
                  "aow:dice-requested",
                  { requestId, count: e.count, sides: e.sides },
                  index,
                  "rule",
                );
                emitted(
                  e.resultEvent,
                  {
                    ...context,
                    requestId,
                    count: e.count,
                    sides: e.sides,
                    values: [...roll!.values],
                    total: roll!.values.reduce((a, b) => a + b, 0),
                  },
                  index,
                  "dice",
                );
              }
              continue;
            }
            const id = evaluate(e.target.entity);
            if (typeof id !== "string")
              fail("An effect target must resolve to an entity identifier.");
            const target = field("runtime", id as string, e.target.field);
            if (!target.spec.writable) fail("The effect target is read-only.");
            let after = evaluate(e.value);
            if (e.kind === "increment")
              after = numeric(target.value) + numeric(after);
            if (
              (e.kind === "move" && target.spec.type !== "point") ||
              !matchesType(after, target.spec.type)
            )
              fail("The effect does not satisfy the target field type.");
            const key = JSON.stringify([id, e.target.field]);
            candidate.targets.add(key);
            if (equal(target.value, after)) continue;
            const write: WorldRuleWrite = {
              entityId: id as string,
              field: e.target.field,
              before: clone(target.value),
              after: clone(after),
              eventId: event.id,
              ruleId: rule.id,
              ruleName: rule.name,
              ruleRevision: rule.revision,
              effectIndex: index,
            };
            (target.entity.fields as Record<string, JsonValue>)[
              e.target.field
            ] = clone(after);
            candidate.writes.push(write);
            emitted(
              "aow:state-changed",
              {
                ...event.context,
                entityId: id as string,
                field: e.target.field,
                before: write.before,
                after: write.after,
              },
              index,
              "state-change",
            );
          }
          candidates.push(candidate);
        }
        const targets = new Set<string>(),
          localTargets = new Set<string>();
        for (const candidate of candidates) {
          for (const key of candidate.targets) {
            if (targets.has(key))
              fail(
                "Same-priority rules compete for the same state field; assign explicit priority stages.",
              );
            targets.add(key);
          }
          for (const key of candidate.localTargets) {
            if (localTargets.has(key))
              fail(
                "Same-priority rules compete for the same execution-local field.",
              );
            localTargets.add(key);
          }
        }
        // Merge only authored writes, never each candidate's stale baseline snapshot.
        for (const candidate of candidates) {
          for (const write of candidate.writes) {
            const entity = state.runtime[write.entityId] as RuleStateEntity;
            (entity.fields as Record<string, JsonValue>)[write.field] = clone(
              write.after,
            );
            writes.push(write);
          }
          for (const key of candidate.localTargets)
            locals[key] = candidate.locals[key];
          for (const child of candidate.events)
            queue.push({ event: child, depth: depth + 1 });
        }
      }
    }
    validateState(state);
    return {
      status: writes.length || events.length > 1 ? "applied" : "no-op",
      state,
      events,
      writes,
      trace,
      rolls,
      requests,
      diagnostics: [],
    };
  } catch (error) {
    return {
      status: needsEntropy ? "needs-entropy" : "failed",
      state: input.state,
      events: [],
      writes: [],
      trace,
      rolls,
      requests,
      diagnostics: [
        error instanceof Error
          ? error.message
          : "The event chain failed without applying changes.",
      ],
    };
  }
}

/** Explicit adoption library; never installed or run implicitly for rule-free Worlds. */
export function starterMovementRules(options: {
  readonly budgetFeet: number;
  readonly ids: readonly string[];
  readonly createdBy: string;
  readonly updatedAt: string;
}): WorldRule[] {
  if (
    !Number.isFinite(options.budgetFeet) ||
    options.budgetFeet < 0 ||
    options.ids.length !== 6
  )
    fail("Choose a nonnegative starter budget and six rule identities.");
  const actor: WorldRuleExpression = { kind: "context", key: "actorId" };
  const field = (key: string): WorldRuleExpression => ({
    kind: "state",
    scope: "runtime",
    entity: actor,
    field: key,
  });
  const literal = (value: JsonValue): WorldRuleExpression => ({
    kind: "literal",
    value,
  });
  const context = (key: string): WorldRuleExpression => ({
    kind: "context",
    key,
  });
  const local: WorldRuleExpression = { kind: "local", key: "cost" };
  const compare = (
    left: WorldRuleExpression,
    operator: "eq" | "gte",
    right: WorldRuleExpression,
  ): WorldRulePredicate => ({ kind: "compare", left, operator, right });
  const rules: Omit<
    WorldRule,
    "id" | "formatVersion" | "revision" | "lifecycle" | "audit"
  >[] = [
    {
      name: "Initialize movement allowance",
      priority: 10,
      trigger: { event: "aow:movement-declared", version: 1 },
      condition: compare(field("aow:movementRemaining"), "eq", literal(null)),
      effects: [
        {
          kind: "set",
          target: { entity: actor, field: "aow:movementRemaining" },
          value: literal(options.budgetFeet),
        },
      ],
    },
    {
      name: "Initialize movement record",
      priority: 10,
      trigger: { event: "aow:movement-declared", version: 1 },
      condition: compare(field("aow:moves"), "eq", literal(null)),
      effects: [
        {
          kind: "set",
          target: { entity: actor, field: "aow:moves" },
          value: literal(0),
        },
      ],
    },
    {
      name: "Measure movement cost",
      priority: 20,
      trigger: { event: "aow:movement-declared", version: 1 },
      effects: [
        { kind: "set-local", key: "cost", value: context("distanceFeet") },
      ],
    },
    {
      name: "Charge five feet per sloped segment",
      priority: 30,
      trigger: { event: "aow:movement-declared", version: 1 },
      effects: [
        {
          kind: "set-local",
          key: "cost",
          value: {
            kind: "arithmetic",
            operator: "add",
            operands: [
              local,
              {
                kind: "arithmetic",
                operator: "multiply",
                operands: [literal(5), context("slopedSegments")],
              },
            ],
          },
        },
      ],
    },
    {
      name: "Move within allowance on supported unobstructed terrain",
      priority: 40,
      trigger: { event: "aow:movement-declared", version: 1 },
      condition: {
        kind: "all",
        predicates: [
          compare(context("contactCount"), "eq", literal(0)),
          compare(context("originInteriorCount"), "eq", literal(0)),
          compare(context("destinationSupported"), "eq", literal(true)),
          compare(field("aow:movementRemaining"), "gte", local),
        ],
      },
      effects: [
        {
          kind: "move",
          target: { entity: actor, field: "position" },
          value: context("destination"),
        },
        {
          kind: "increment",
          target: { entity: actor, field: "aow:movementRemaining" },
          value: {
            kind: "arithmetic",
            operator: "subtract",
            operands: [literal(0), local],
          },
        },
      ],
    },
    {
      name: "Record completed movement",
      priority: 10,
      trigger: { event: "aow:state-changed", version: 1 },
      condition: compare(context("field"), "eq", literal("position")),
      effects: [
        {
          kind: "increment",
          target: {
            entity: { kind: "context", key: "entityId" },
            field: "aow:moves",
          },
          value: literal(1),
        },
      ],
    },
  ];
  const result = rules.map((rule, index): WorldRule => ({
    ...rule,
    formatVersion: 1,
    id: options.ids[index],
    revision: 1,
    lifecycle: "enabled",
    audit: { createdBy: options.createdBy, updatedAt: options.updatedAt },
  }));
  const valid = validateWorldRules(result);
  if (!valid.valid) fail(valid.issues[0]);
  return result;
}
